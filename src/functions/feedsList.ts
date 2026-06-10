import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { buildAdminUnauthorizedResponse, verifyAdminSession } from "../lib/adminSession";
import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, generateId } from "../lib/util";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse } from "../lib/api-types";

app.http("listFeeds", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "feeds",
  handler: listFeedsHandler,
});

export async function listFeedsHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  try {
    const config = getConfig();
    if (!verifyAdminSession(request, config)) {
      return buildAdminUnauthorizedResponse(requestId);
    }
    const { loadManageableSourceFeeds } = await import("../lib/sourceFeeds");
    const feeds = await loadManageableSourceFeeds(config, logger);

    // SECURITY NOTE: Feed URLs are NOT redacted in this authenticated endpoint
    // Rationale: Authenticated admins need to see full feed URLs to edit them
    // URLs are redacted in logs only (via redactFeedUrl in logger calls)
    // This endpoint is protected by the admin session cookie

    logger.info("feeds_list_succeeded", { requestId, count: feeds.length });

    return toHttpResponse(
      createSuccessResponse(requestId, {
        feeds, // Full URLs returned (protected by admin session auth)
        count: feeds.length,
      }),
    );
  } catch (error) {
    logger.error("feeds_list_failed", { requestId, error: errorMessage(error) });

    return toHttpResponse(
      createErrorResponse(
        requestId,
        ERROR_CODES.INTERNAL_ERROR,
        "Failed to load feeds",
        undefined,
      ),
    );
  }
}
