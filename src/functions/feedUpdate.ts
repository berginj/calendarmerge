import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { validateFeed } from "../lib/feedValidation";
import { errorMessage, generateId, getStorageConnectionString, normalizeFeedUrl, redactFeedUrl } from "../lib/util";

app.http("updateFeed", {
  methods: ["PUT"],
  authLevel: "function",
  route: "feeds/{feedId}",
  handler: updateFeedHandler,
});

interface UpdateFeedRequest {
  name?: string;
  url?: string;
  enabled?: boolean;
}

async function updateFeedHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const logger = createLogger(context);

  try {
    const feedId = request.params.feedId;
    if (!feedId) {
      return {
        status: 400,
        jsonBody: { error: "Feed ID is required" },
      };
    }

    const body = (await request.json()) as UpdateFeedRequest;

    // Validate input
    const validation = validateUpdateInput(body);
    if (!validation.valid) {
      logger.warn("feed_update_validation_failed", { feedId, errors: validation.errors });

      return {
        status: 400,
        jsonBody: {
          error: "Validation failed",
          details: validation.errors,
        },
      };
    }

    const config = getConfig();
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const { TableStore } = await import("../lib/tableStore");
    const store = new TableStore(connectionString);

    // Check if feed exists
    const existing = await store.getFeed(feedId);
    if (!existing) {
      logger.warn("feed_update_not_found", { feedId });

      return {
        status: 404,
        jsonBody: { error: "Feed not found" },
      };
    }

    // Build updates object
    const updates: Partial<UpdateFeedRequest> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.url !== undefined) updates.url = normalizeFeedUrl(body.url);
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    // Validate feed URL if it's being changed
    let validationResult;
    if (body.url !== undefined && body.url !== existing.url) {
      const requestId = generateId();
      const apiLogger = logger.withContext(undefined, requestId).setCategory("api");

      apiLogger.info("validating_feed_url_change", { feedId, oldUrl: existing.url, newUrl: updates.url });

      const tempFeedConfig = {
        id: feedId,
        name: body.name ?? existing.name,
        url: updates.url!,
      };

      validationResult = await validateFeed(tempFeedConfig, config, apiLogger);

      if (!validationResult.valid) {
        logger.warn("feed_validation_failed", { feedId, error: validationResult.error });

        return {
          status: 400,
          jsonBody: {
            error: "Feed validation failed",
            details: validationResult.error,
            httpStatus: validationResult.httpStatus,
          },
        };
      }

      // Log validation success with details
      apiLogger.info("feed_validation_succeeded", {
        feedId,
        eventCount: validationResult.eventCount,
        detectedPlatform: validationResult.detectedPlatform,
        warnings: validationResult.warnings,
      });
    }

    // Update feed
    const updated = await store.updateFeed(feedId, updates);

    logger.info("feed_updated", { feedId, updates: Object.keys(updates) });

    // Trigger automatic refresh if URL was changed or feed was enabled
    const shouldTriggerRefresh = (body.url !== undefined && body.url !== existing.url) ||
                                  (body.enabled === true && existing.enabled === false);

    if (shouldTriggerRefresh) {
      logger.info("triggering_refresh_after_feed_update", { feedId, reason: body.url !== existing.url ? "url_changed" : "feed_enabled" });

      // Import and trigger refresh asynchronously (don't wait for it)
      const { runRefresh } = await import("../lib/refresh");
      runRefresh(logger, `feed_update:${feedId}`).catch((error) => {
        logger.error("post_update_refresh_failed", { feedId, error: errorMessage(error) });
      });
    }

    // SECURITY: Redact feed URL to remove bearer tokens from response
    return {
      status: 200,
      jsonBody: {
        feed: {
          id: updated.id,
          name: updated.name,
          url: redactFeedUrl(updated.url),
          enabled: updated.enabled,
        },
        message: "Feed updated successfully",
        validated: validationResult !== undefined,
        validationDetails: validationResult ? {
          eventCount: validationResult.eventCount,
          detectedPlatform: validationResult.detectedPlatform,
          warnings: validationResult.warnings,
        } : undefined,
        refreshTriggered: shouldTriggerRefresh,
      },
    };
  } catch (error) {
    logger.error("feed_update_failed", { error: errorMessage(error) });

    return {
      status: 500,
      jsonBody: { error: "Failed to update feed" },
    };
  }
}

function validateUpdateInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    errors.push("Request body must be a JSON object");
    return { valid: false, errors };
  }

  const body = input as Partial<UpdateFeedRequest>;

  // At least one field must be provided
  if (body.name === undefined && body.url === undefined && body.enabled === undefined) {
    errors.push("At least one field (name, url, or enabled) must be provided");
  }

  // Validate name if provided
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      errors.push("Feed name must be a non-empty string if provided");
    }
  }

  // Validate URL if provided
  if (body.url !== undefined) {
    if (typeof body.url !== "string" || !body.url.trim()) {
      errors.push("Feed URL must be a non-empty string if provided");
    } else {
      try {
        normalizeFeedUrl(body.url);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
  }

  // Validate enabled if provided
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    errors.push("enabled must be a boolean if provided");
  }

  return { valid: errors.length === 0, errors };
}
