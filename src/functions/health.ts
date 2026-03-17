import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createLogger } from "../lib/log";
import { loadCurrentStatus } from "../lib/refresh";

app.http("healthStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "status",
  handler: healthHandler,
});

async function healthHandler(_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const logger = createLogger(context);
  const status = await loadCurrentStatus(logger);

  return {
    status: status.healthy ? 200 : 503,
    jsonBody: {
      serviceName: status.serviceName,
      state: status.state,
      lastSuccessfulRefresh: status.lastSuccessfulRefresh,
      lastAttemptedRefresh: status.lastAttemptedRefresh,
      sourceFeedCount: status.sourceFeedCount,
      mergedEventCount: status.mergedEventCount,
      candidateMergedEventCount: status.candidateMergedEventCount,
      output: status.output,
      errorSummary: status.errorSummary,
      sourceStatuses: status.sourceStatuses,
      calendarPublished: status.calendarPublished,
      servedLastKnownGood: status.servedLastKnownGood,
    },
  };
}
