import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, generateId } from "../lib/util";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse } from "../lib/api-types";

app.http("listFeeds", {
  methods: ["GET"],
  authLevel: "function",
  route: "feeds",
  handler: listFeedsHandler,
});

export async function listFeedsHandler(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  try {
    const config = getConfig();
    const { loadSourceFeeds } = await import("../lib/sourceFeeds");
    const feeds = await loadSourceFeeds(config, logger);

    // SECURITY NOTE: Feed URLs are NOT redacted in this authenticated endpoint
    // Rationale: Users with valid function keys need to see their own feed URLs to edit them
    // URLs are redacted in logs only (via redactFeedUrl in logger calls)
    // This endpoint requires function-level auth, so URLs are protected by authentication

    logger.info("feeds_list_succeeded", { requestId, count: feeds.length });

    return toHttpResponse(
      createSuccessResponse(requestId, {
        feeds, // Full URLs returned (protected by function auth)
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
        errorMessage(error),
      ),
    );
  }
}
