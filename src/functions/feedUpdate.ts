import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { buildAdminUnauthorizedResponse, verifyAdminSession } from "../lib/adminSession";
import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { validateFeed } from "../lib/feedValidation";
import { errorMessage, generateId, getStorageConnectionString, normalizeFeedUrl, redactFeedUrl } from "../lib/util";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse, ValidationResult } from "../lib/api-types";
import { fieldError, invalid, parseJsonObjectRequest, valid, validationErrorResponse } from "../lib/httpValidation";

app.http("updateFeed", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "feeds/{feedId}",
  handler: updateFeedHandler,
});

interface UpdateFeedRequest {
  name?: string;
  url?: string;
  enabled?: boolean;
}

export async function updateFeedHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  try {
    const feedId = request.params.feedId;
    if (!feedId) {
      return toHttpResponse(
        createErrorResponse(requestId, ERROR_CODES.VALIDATION_ERROR, "Feed ID is required"),
      );
    }

    const parsed = await parseJsonObjectRequest(request);
    if (!parsed.valid) {
      logger.warn("feed_update_invalid_json", { feedId, errors: parsed.errors });
      return validationErrorResponse(requestId, parsed.message, parsed.errors, parsed.code);
    }

    const validation = validateUpdateInput(parsed.data);
    if (!validation.valid) {
      logger.warn("feed_update_validation_failed", { feedId, errors: validation.errors });
      return validationErrorResponse(requestId, "Validation failed", validation.errors);
    }
    const body = validation.data;

    const config = getConfig();
    if (!verifyAdminSession(request, config)) {
      return buildAdminUnauthorizedResponse(requestId);
    }
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const { TableStore } = await import("../lib/tableStore");
    const store = new TableStore(connectionString);

    // Check if feed exists
    const existing = await store.getFeed(feedId);
    if (!existing) {
      logger.warn("feed_update_not_found", { feedId });

      return toHttpResponse(
        createErrorResponse(requestId, ERROR_CODES.NOT_FOUND, "Feed not found"),
      );
    }

    // Build updates object
    const updates: Partial<UpdateFeedRequest> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.url !== undefined) updates.url = normalizeFeedUrl(body.url);
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    // Validate feed URL if it's being changed
    let validationResult;
    if (updates.url !== undefined && updates.url !== existing.url) {
      const apiLogger = logger.withContext(undefined, requestId).setCategory("api");

      apiLogger.info("validating_feed_url_change", {
        feedId,
        oldUrl: redactFeedUrl(existing.url),
        newUrl: redactFeedUrl(updates.url),
      });

      const tempFeedConfig = {
        id: feedId,
        name: body.name ?? existing.name,
        url: updates.url!,
      };

      validationResult = await validateFeed(tempFeedConfig, config, apiLogger);

      if (!validationResult.valid) {
        logger.warn("feed_validation_failed", { feedId, error: validationResult.error });

        return toHttpResponse(
          createErrorResponse(
            requestId,
            ERROR_CODES.VALIDATION_ERROR,
            "Feed validation failed",
            validationResult.error,
          ),
        );
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
    const shouldTriggerRefresh = (updates.url !== undefined && updates.url !== existing.url) ||
                                  (body.enabled === true && existing.enabled === false);

    if (shouldTriggerRefresh) {
      logger.info("triggering_refresh_after_feed_update", { feedId, reason: updates.url !== existing.url ? "url_changed" : "feed_enabled" });

      // Import and trigger refresh asynchronously (don't wait for it)
      const { runRefresh } = await import("../lib/refresh");
      runRefresh(logger, `feed_update:${feedId}`).catch((error) => {
        logger.error("post_update_refresh_failed", { feedId, error: errorMessage(error) });
      });
    }

    // SECURITY NOTE: Feed URL is NOT redacted in this authenticated endpoint
    // Rationale: Authenticated admins need the full URL to manage and restore feeds
    // The endpoint is protected by the admin session cookie, so URL values are not exposed publicly
    // URLs are redacted in logs only (via redactFeedUrl in logger calls)
    // IMPORTANT: Frontend edit flow depends on receiving full URL to avoid losing tokens
    return toHttpResponse(
      createSuccessResponse(
        requestId,
        {
          feed: {
            id: updated.id,
            name: updated.name,
            url: updated.url, // Full URL returned (protected by admin session auth)
            enabled: updated.enabled,
            disabledAt: updated.enabled === false ? updated.disabledAt : undefined,
            restoreAvailableUntil: updated.enabled === false ? updated.restoreAvailableUntil : undefined,
          },
          validated: validationResult !== undefined,
          validationDetails: validationResult ? {
            eventCount: validationResult.eventCount,
            detectedPlatform: validationResult.detectedPlatform,
            warnings: validationResult.warnings,
          } : undefined,
          refreshTriggered: shouldTriggerRefresh,
        },
        "Feed updated successfully",
      ),
    );
  } catch (error) {
    logger.error("feed_update_failed", { error: errorMessage(error) });

    return toHttpResponse(
      createErrorResponse(requestId, ERROR_CODES.INTERNAL_ERROR, "Failed to update feed"),
    );
  }
}

function validateUpdateInput(input: Record<string, unknown>): ValidationResult<UpdateFeedRequest> {
  const errors: Record<string, string[]> = {};

  // At least one field must be provided
  if (input.name === undefined && input.url === undefined && input.enabled === undefined) {
    fieldError(errors, "body", "At least one field (name, url, or enabled) must be provided");
  }

  // Validate name if provided
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      fieldError(errors, "name", "Feed name must be a non-empty string if provided");
    }
  }

  // Validate URL if provided
  if (input.url !== undefined) {
    if (typeof input.url !== "string" || !input.url.trim()) {
      fieldError(errors, "url", "Feed URL must be a non-empty string if provided");
    } else {
      try {
        normalizeFeedUrl(input.url);
      } catch (error) {
        fieldError(errors, "url", errorMessage(error));
      }
    }
  }

  // Validate enabled if provided
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    fieldError(errors, "enabled", "enabled must be a boolean if provided");
  }

  if (Object.keys(errors).length > 0) {
    return invalid(errors);
  }

  return valid({
    name: typeof input.name === "string" ? input.name : undefined,
    url: typeof input.url === "string" ? input.url : undefined,
    enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
  });
}
