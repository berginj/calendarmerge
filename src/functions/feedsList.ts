import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createLogger } from "../lib/log";

app.http("listFeeds", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "feeds",
  handler: listFeedsHandler,
});

async function listFeedsHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    // Simplified version - just return config feeds for now
    // TODO: Add table storage support later after basic functionality works
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
