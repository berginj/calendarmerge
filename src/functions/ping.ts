import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createSuccessResponse, toHttpResponse } from "../lib/api-types";
import { generateId } from "../lib/util";

// Simple diagnostic endpoint with no dependencies
app.http("ping", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ping",
  handler: pingHandler,
});

export async function pingHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  return toHttpResponse(
    createSuccessResponse(generateId(), {
      message: "pong",
      timestamp: new Date().toISOString(),
    }),
  );
}
