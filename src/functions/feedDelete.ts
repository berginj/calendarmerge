import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { buildAdminUnauthorizedResponse, verifyAdminSession, verifyCsrfHeader } from "../lib/adminSession";
import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, generateId, getStorageConnectionString } from "../lib/util";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse } from "../lib/api-types";

app.http("deleteFeed", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "feeds/{feedId}",
  handler: deleteFeedHandler,
});

export async function deleteFeedHandler(
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

    const config = getConfig();
    if (!verifyAdminSession(request, config)) {
      return buildAdminUnauthorizedResponse(requestId);
    }
    if (["POST", "PUT", "DELETE"].includes(request.method.toUpperCase()) && !verifyCsrfHeader(request)) {
      return buildAdminUnauthorizedResponse(requestId, "Missing CSRF header");
    }
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const { TableStore } = await import("../lib/tableStore");
    const store = new TableStore(connectionString);

    // Check if feed exists
    const existing = await store.getFeed(feedId);
    if (!existing) {
      logger.warn("feed_delete_not_found", { requestId, feedId });

      return toHttpResponse(
        createErrorResponse(requestId, ERROR_CODES.NOT_FOUND, "Feed not found"),
      );
    }

    // Soft delete (set enabled=false) so users can restore it from the UI for 15 days.
    await store.softDeleteFeed(feedId);

    logger.info("feed_deleted", { requestId, feedId });

    return toHttpResponse(
      createSuccessResponse(requestId, { feedId }, "Feed disabled for 15 days"),
    );
  } catch (error) {
    logger.error("feed_delete_failed", { requestId, error: errorMessage(error) });

    return toHttpResponse(
      createErrorResponse(requestId, ERROR_CODES.INTERNAL_ERROR, "Failed to delete feed"),
    );
  }
}
