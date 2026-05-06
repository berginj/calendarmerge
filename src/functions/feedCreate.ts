import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, generateId, getStorageConnectionString, normalizeFeedUrl, validateFeedId } from "../lib/util";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse } from "../lib/api-types";

app.http("createFeed", {
  methods: ["POST"],
  authLevel: "function",
  route: "feeds",
  handler: createFeedHandler,
});

interface CreateFeedRequest {
  id?: string;
  name: string;
  url: string;
}

export async function createFeedHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  try {
    const body = (await request.json()) as CreateFeedRequest;

    // Validate input
    const validation = validateFeedInput(body);
    if (!validation.valid) {
      logger.warn("feed_create_validation_failed", { requestId, errors: validation.errors });

      return toHttpResponse(
        createErrorResponse(
          requestId,
          ERROR_CODES.VALIDATION_ERROR,
          "Validation failed",
          validation.errors.join("; "),
          { body: validation.errors },
        ),
      );
    }

    const config = getConfig();
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const { TableStore } = await import("../lib/tableStore");
    const store = new TableStore(connectionString);
    const normalizedUrl = normalizeFeedUrl(body.url);

    // Generate ID if not provided
    const feedId = body.id || TableStore.generateFeedId(normalizedUrl);

    // Check for duplicate ID
    const existing = await store.getFeed(feedId);
    if (existing) {
      logger.warn("feed_create_duplicate_id", { requestId, feedId });

      return toHttpResponse(
        createErrorResponse(
          requestId,
          ERROR_CODES.CONFLICT,
          "Feed ID already exists",
          undefined,
          { id: [`Feed ID already exists: ${feedId}`] },
        ),
      );
    }

    // Create feed
    const entity = await store.createFeed({
      partitionKey: "default",
      rowKey: feedId,
      id: feedId,
      name: body.name.trim(),
      url: normalizedUrl,
      enabled: true,
    });

    logger.info("feed_created", { requestId, feedId, name: body.name });

    // SECURITY NOTE: Feed URL is NOT redacted in this authenticated endpoint
    // Rationale: User just created this feed and needs to see the full URL they entered
    // This endpoint requires function-level auth, so URL is protected by authentication
    // URLs are redacted in logs only
    return toHttpResponse(
      createSuccessResponse(
        requestId,
        {
          feed: {
            id: entity.id,
            name: entity.name,
            url: entity.url, // Full URL returned (protected by function auth)
            enabled: entity.enabled,
          },
        },
        "Feed created successfully",
      ),
      201,
    );
  } catch (error) {
    logger.error("feed_create_failed", { requestId, error: errorMessage(error) });

    return toHttpResponse(
      createErrorResponse(requestId, ERROR_CODES.INTERNAL_ERROR, "Failed to create feed"),
    );
  }
}

function validateFeedInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    errors.push("Request body must be a JSON object");
    return { valid: false, errors };
  }

  const body = input as Partial<CreateFeedRequest>;

  // Validate name
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    errors.push("Feed name is required and must be a non-empty string");
  }

  // Validate URL
  if (!body.url || typeof body.url !== "string" || !body.url.trim()) {
    errors.push("Feed URL is required and must be a non-empty string");
  } else {
    try {
      normalizeFeedUrl(body.url);
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }

  // Validate ID if provided
  if (body.id !== undefined) {
    if (typeof body.id !== "string" || !body.id.trim()) {
      errors.push("Feed ID must be a non-empty string if provided");
    } else {
      try {
        validateFeedId(body.id);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
