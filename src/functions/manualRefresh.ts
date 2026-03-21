import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createLogger } from "../lib/log";
import { errorMessage } from "../lib/util";

app.http("manualRefresh", {
  methods: ["POST"],
  authLevel: "function",
  route: "refresh",
  handler: manualRefreshHandler,
});

async function manualRefreshHandler(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const logger = createLogger(context);
  try {
    const { runRefresh } = await import("../lib/refresh");
    const result = await runRefresh(logger, "manual");

    return {
      status: result.status.state === "failed" ? 502 : 200,
      jsonBody: {
        success: result.status.state !== "failed",
        partialFailure: result.status.state === "partial",
        eventCount: result.status.mergedEventCount,
        candidateEventCount: result.candidateEventCount,
        sourceStatuses: result.status.sourceStatuses,
        output: result.status.output,
        servedLastKnownGood: result.usedLastKnownGood,
        calendarPublished: result.calendarPublished,
        lastAttemptedRefresh: result.status.lastAttemptedRefresh,
        lastSuccessfulRefresh: result.status.lastSuccessfulRefresh,
        errorSummary: result.status.errorSummary,
        state: result.status.state,
      },
    };
  } catch (error) {
    logger.error("manual_refresh_failed", { error: errorMessage(error) });

    return {
      status: 500,
      jsonBody: {
        success: false,
        error: "Manual refresh failed",
        details: errorMessage(error),
      },
    };
  }
}
