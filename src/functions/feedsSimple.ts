import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse } from "../lib/api-types";
import { errorMessage, generateId, redactFeedUrl } from "../lib/util";

// Simplified feeds endpoint for testing
app.http("listFeedsSimple", {
  methods: ["GET"],
  authLevel: "function",
  route: "feeds-simple",
  handler: listFeedsSimpleHandler,
});

export async function listFeedsSimpleHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();

  try {
    // Import inline to catch any import errors
    const { getConfig } = await import("../lib/config");
    const config = getConfig();
    const feeds = config.sourceFeeds.map((feed) => ({
      ...feed,
      url: redactFeedUrl(feed.url),
    }));

    return toHttpResponse(
      createSuccessResponse(requestId, {
        feeds,
        count: feeds.length,
      }),
    );
  } catch (error) {
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
