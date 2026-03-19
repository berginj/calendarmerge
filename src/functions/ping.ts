import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

// Simple diagnostic endpoint with no dependencies
app.http("ping", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ping",
  handler: pingHandler,
});

async function pingHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: {
      message: "pong",
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      env: {
        hasStorageConnectionString: Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING),
        hasSourceFeeds: Boolean(process.env.SOURCE_FEEDS_JSON),
        hasOutputStorageAccount: Boolean(process.env.OUTPUT_STORAGE_ACCOUNT),
      },
    },
  };
}
