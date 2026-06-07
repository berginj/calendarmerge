import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { buildAdminUnauthorizedResponse, verifyAdminSession } from "../lib/adminSession";
import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, generateId, getStorageConnectionString } from "../lib/util";
import {
  createErrorResponse,
  createPartialSuccessResponse,
  createSuccessResponse,
  ERROR_CODES,
  toHttpResponse,
} from "../lib/api-types";

app.http("manualRefresh", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "refresh",
  handler: manualRefreshHandler,
});

const REFRESH_COOLDOWN_MS = 30000;

export function resetManualRefreshCooldownForTest(): void {
  // Retained for existing tests. Durable cooldown state lives in Azure Table Storage.
}

export async function manualRefreshHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  logger.info("manual_refresh_requested", { requestId });

  try {
    const config = getConfig();
    if (!verifyAdminSession(request, config)) {
      return buildAdminUnauthorizedResponse(requestId);
    }
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const rateLimitScopes = buildRateLimitScopes(request);
    const { ManualRefreshRateLimitStore } = await import("../lib/manualRefreshRateLimit");
    const rateLimitStore = new ManualRefreshRateLimitStore(connectionString);
    const rateLimit = await rateLimitStore.check(rateLimitScopes, REFRESH_COOLDOWN_MS);

    if (!rateLimit.allowed) {
      const retryAfterSeconds = rateLimit.retryAfterSeconds ?? Math.ceil(REFRESH_COOLDOWN_MS / 1000);

      logger.warn("manual_refresh_rate_limited", {
        requestId,
        retryAfterSeconds,
        scopes: rateLimitScopes.map((scope) => scope.rowKey),
      });

      const response = toHttpResponse(
        createErrorResponse(
          requestId,
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          "Please wait before refreshing again",
          `Manual refresh is limited to once every 30 seconds. Retry in ${retryAfterSeconds} seconds.`,
        ),
      );

      return {
        ...response,
        headers: { "Retry-After": retryAfterSeconds.toString() },
      };
    }

    // NOTE: We intentionally do NOT update timestamp here - only after successful refresh.
    // This allows immediate retry after failed refresh attempts.
    const { runRefresh } = await import("../lib/refresh");
    const result = await runRefresh(logger, "manual");

    // Update cooldown timestamp only after a non-failed refresh result.
    // Failed refresh attempts should be immediately retryable.
    if (result.status.state !== "failed") {
      await rateLimitStore.recordSuccess(rateLimitScopes);
    }

    logger.info("manual_refresh_completed", {
      requestId,
      refreshId: result.status.refreshId,
      state: result.status.state,
      operationalState: result.status.operationalState,
    });

    const responseData = {
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
    };

    if (result.status.state === "failed") {
      return toHttpResponse(
        createErrorResponse(
          requestId,
          ERROR_CODES.SERVICE_UNAVAILABLE,
        "Refresh failed",
        result.status.errorSummary.join("; ") || "No calendars were published.",
      ),
        503,
      );
    }

    if (result.status.state === "partial") {
      return toHttpResponse(
        createPartialSuccessResponse(
          requestId,
          responseData,
          result.status.errorSummary,
          "Refresh completed with warnings",
          { refreshId: result.status.refreshId },
        ),
      );
    }

    return toHttpResponse(
      createSuccessResponse(
        requestId,
        responseData,
        "Refresh completed successfully",
        { refreshId: result.status.refreshId },
      ),
    );
  } catch (error) {
    logger.error("manual_refresh_failed", { requestId, error: errorMessage(error) });

    return toHttpResponse(
      createErrorResponse(
        requestId,
        ERROR_CODES.INTERNAL_ERROR,
        "Manual refresh failed",
        errorMessage(error),
      ),
    );
  }
}

function buildRateLimitScopes(request: HttpRequest) {
  return [{ partitionKey: "manual-refresh", rowKey: "global" }];
}
