import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createSuccessResponse, toHttpResponse } from "../lib/api-types";
import { createLogger } from "../lib/log";
import { loadCurrentStatus } from "../lib/refresh";
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
    createSuccessResponse(generateId(), {
      serviceName: status.serviceName,
      state: status.state,
      lastSuccessfulRefresh: status.lastSuccessfulRefresh,
      lastAttemptedRefresh: status.lastAttemptedRefresh,
      sourceFeedCount: status.sourceFeedCount,
      mergedEventCount: status.mergedEventCount,
      gamesOnlyMergedEventCount: status.gamesOnlyMergedEventCount,
      candidateMergedEventCount: status.candidateMergedEventCount,
      output: status.output,
      errorSummary: status.errorSummary,
      sourceStatuses: status.sourceStatuses,
      calendarPublished: status.calendarPublished,
      gamesOnlyCalendarPublished: status.gamesOnlyCalendarPublished,
      servedLastKnownGood: status.servedLastKnownGood,
    }),
    status.healthy ? 200 : 503,
  );
}
