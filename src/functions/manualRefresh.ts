import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createLogger } from "../lib/log";
import { errorMessage, generateId } from "../lib/util";

app.http("manualRefresh", {
  methods: ["POST"],
  authLevel: "function",
  route: "refresh",
  handler: manualRefreshHandler,
});

// SECURITY: Basic rate limiting to prevent DoS attacks
// LIMITATION: This is in-memory per-instance, not durable across scale-out
// Primary protection is the activeRefresh promise in refresh.ts (prevents concurrent refreshes)
// This adds defense-in-depth by limiting rapid sequential calls on same instance
const REFRESH_COOLDOWN_MS = 30000;
let lastSuccessfulRefreshTime = 0;

async function manualRefreshHandler(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  logger.info("manual_refresh_requested", { requestId });

  // NOTE: Concurrent refreshes are already prevented by activeRefresh promise in refresh.ts
  // This cooldown is additional protection against rapid sequential calls
  // LIMITATION: Only effective on single instance, does not work across scale-out
  const now = Date.now();
  const timeSinceLastRefresh = now - lastSuccessfulRefreshTime;

  if (lastSuccessfulRefreshTime > 0 && timeSinceLastRefresh < REFRESH_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLastRefresh) / 1000);

    logger.warn("manual_refresh_rate_limited", {
      requestId,
      timeSinceLastMs: timeSinceLastRefresh,
      retryAfterSeconds,
      note: "In-memory cooldown - may not apply across instances",
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

  // NOTE: We intentionally do NOT update timestamp here - only after successful refresh
  // This allows immediate retry after failures

  try {
    const { runRefresh } = await import("../lib/refresh");
    const result = await runRefresh(logger, "manual");

    // Update cooldown timestamp only after successful completion
    // This allows immediate retry after failures
    lastSuccessfulRefreshTime = Date.now();

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
