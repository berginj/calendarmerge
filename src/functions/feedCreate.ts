import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { buildAdminUnauthorizedResponse, verifyAdminSession } from "../lib/adminSession";
import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, generateId, getStorageConnectionString, normalizeFeedUrl, validateFeedId } from "../lib/util";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse, ValidationResult } from "../lib/api-types";
import { fieldError, invalid, parseJsonObjectRequest, valid, validationErrorResponse } from "../lib/httpValidation";

app.http("createFeed", {
  methods: ["POST"],
  authLevel: "anonymous",
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
    const parsed = await parseJsonObjectRequest(request);
    if (!parsed.valid) {
      logger.warn("feed_create_invalid_json", { requestId, errors: parsed.errors });
      return validationErrorResponse(requestId, parsed.message, parsed.errors, parsed.code);
    }

    const validation = validateFeedInput(parsed.data);
    if (!validation.valid) {
      logger.warn("feed_create_validation_failed", { requestId, errors: validation.errors });
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

function validateFeedInput(input: Record<string, unknown>): ValidationResult<CreateFeedRequest> {
  const errors: Record<string, string[]> = {};

  // Validate name
  if (!input.name || typeof input.name !== "string" || !input.name.trim()) {
    fieldError(errors, "name", "Feed name is required and must be a non-empty string");
  }

  // Validate URL
  if (!input.url || typeof input.url !== "string" || !input.url.trim()) {
    fieldError(errors, "url", "Feed URL is required and must be a non-empty string");
  } else {
    try {
      normalizeFeedUrl(input.url);
    } catch (error) {
      fieldError(errors, "url", errorMessage(error));
    }
  }

  // Validate ID if provided
  if (input.id !== undefined) {
    if (typeof input.id !== "string" || !input.id.trim()) {
      fieldError(errors, "id", "Feed ID must be a non-empty string if provided");
    } else {
      try {
        validateFeedId(input.id);
      } catch (error) {
        fieldError(errors, "id", errorMessage(error));
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return invalid(errors);
  }

  return valid({
    id: typeof input.id === "string" ? input.id.trim() : undefined,
    name: (input.name as string).trim(),
    url: input.url as string,
  });
}
