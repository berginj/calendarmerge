import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createLogger } from "../lib/log";
import { errorMessage, generateId } from "../lib/util";

app.http("manualRefresh", {
  methods: ["POST"],
  authLevel: "function",
  route: "refresh",
  handler: manualRefreshHandler,
});

// SECURITY: Rate limiting to prevent DoS attacks
// Minimum 30 seconds between manual refresh calls
const REFRESH_COOLDOWN_MS = 30000;
let lastManualRefreshTime = 0;

async function manualRefreshHandler(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  logger.info("manual_refresh_requested", { requestId });

  // SECURITY: Check rate limit
  const now = Date.now();
  const timeSinceLastRefresh = now - lastManualRefreshTime;

  if (lastManualRefreshTime > 0 && timeSinceLastRefresh < REFRESH_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLastRefresh) / 1000);

    logger.warn("manual_refresh_rate_limited", {
      requestId,
      timeSinceLastMs: timeSinceLastRefresh,
      retryAfterSeconds,
    });

    return {
      status: 429,
      headers: {
        'Retry-After': retryAfterSeconds.toString(),
      },
      jsonBody: {
        requestId,
        status: "error",
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Please wait before refreshing again",
          details: `Manual refresh is limited to once every 30 seconds. Retry in ${retryAfterSeconds} seconds.`,
        },
      },
    };
  }

  lastManualRefreshTime = now;

  try {
    const { runRefresh } = await import("../lib/refresh");
    const result = await runRefresh(logger, "manual");

    logger.info("manual_refresh_completed", {
      requestId,
      refreshId: result.status.refreshId,
      state: result.status.state,
      operationalState: result.status.operationalState,
    });

    return {
      status: result.status.state === "failed" ? 502 : 200,
      jsonBody: {
        requestId,
        refreshId: result.status.refreshId,
        success: result.status.state !== "failed",
        partialFailure: result.status.state === "partial",
        operationalState: result.status.operationalState,
        degradationReasons: result.status.degradationReasons,
        eventCount: result.status.mergedEventCount,
        gamesOnlyEventCount: result.status.gamesOnlyMergedEventCount,
        candidateEventCount: result.candidateEventCount,
        sourceStatuses: result.status.sourceStatuses,
        feedChangeAlerts: result.status.feedChangeAlerts,
        suspectFeeds: result.status.suspectFeeds,
        potentialDuplicates: result.status.potentialDuplicates,
        rescheduledEvents: result.status.rescheduledEvents,
        cancelledEventsFiltered: result.status.cancelledEventsFiltered,
        output: result.status.output,
        servedLastKnownGood: result.usedLastKnownGood,
        calendarPublished: result.calendarPublished,
        gamesOnlyCalendarPublished: result.status.gamesOnlyCalendarPublished,
        lastAttemptedRefresh: result.status.lastAttemptedRefresh,
        lastSuccessfulRefresh: result.status.lastSuccessfulRefresh,
        lastSuccessfulCheck: result.status.lastSuccessfulCheck,
        checkAgeHours: result.status.checkAgeHours,
        errorSummary: result.status.errorSummary,
        state: result.status.state,
        healthy: result.status.healthy,
      },
    };
  } catch (error) {
    logger.error("manual_refresh_failed", { requestId, error: errorMessage(error) });

    return {
      status: 500,
      jsonBody: {
        requestId,
        success: false,
        error: "Manual refresh failed",
        details: errorMessage(error),
      },
    };
  }
}
