import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

// Simplified feeds endpoint for testing
app.http("listFeedsSimple", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "feeds-simple",
  handler: listFeedsSimpleHandler,
});

async function listFeedsSimpleHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    // Import inline to catch any import errors
    const { getConfig } = await import("../lib/config");
    const config = getConfig();

    return {
      status: 200,
      jsonBody: {
        feeds: config.sourceFeeds,
        count: config.sourceFeeds.length,
      },
    };
  } catch (error) {
    return {
      status: 500,
      jsonBody: {
        error: "Failed to load feeds",
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    };
  }
}
