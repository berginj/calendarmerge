import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createSuccessResponse, toHttpResponse } from "../lib/api-types";
import { createLogger } from "../lib/log";
import { loadCurrentStatus } from "../lib/refresh";
import { buildPublicStatus } from "../lib/status";
import { generateId } from "../lib/util";

app.http("healthStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "status",
  handler: healthHandler,
});

export async function healthHandler(_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const logger = createLogger(context);
  const status = await loadCurrentStatus(logger);

  return toHttpResponse(
    createSuccessResponse(generateId(), buildPublicStatus(status)),
    status.healthy ? 200 : 503,
  );
}
