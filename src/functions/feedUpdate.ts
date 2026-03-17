import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { TableStore } from "../lib/tableStore";
import { errorMessage } from "../lib/util";

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
    const store = new TableStore(config.outputStorageAccount);

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
    if (body.url !== undefined) updates.url = body.url.trim();
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    // Update feed
    const updated = await store.updateFeed(feedId, updates);

    logger.info("feed_updated", { feedId, updates: Object.keys(updates) });

    return {
      status: 200,
      jsonBody: {
        feed: {
          id: updated.id,
          name: updated.name,
          url: updated.url,
        },
        message: "Feed updated successfully",
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
        const url = new URL(body.url);
        if (!["http:", "https:"].includes(url.protocol)) {
          errors.push("Feed URL must use http or https protocol");
        }
      } catch {
        errors.push("Feed URL is not a valid URL");
      }
    }
  }

  // Validate enabled if provided
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    errors.push("enabled must be a boolean if provided");
  }

  return { valid: errors.length === 0, errors };
}
