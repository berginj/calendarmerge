import { BlobStore } from "./blobStore";
import { getConfig } from "./config";
import { createSnapshotMap, detectRescheduledEvents } from "./eventSnapshot";
import { fetchFeed } from "./fetchFeeds";
import { Logger } from "./log";
import { mergeFeedEvents } from "./merge";
import { buildPublicCalendarArtifacts } from "./publicCalendars";
import { loadSourceFeeds } from "./sourceFeeds";
import { buildStartingStatus } from "./status";
import { AppConfig, EventSnapshot, FeedChangeAlert, FeedRunResult, RefreshResult, ServiceStatus, SourceFeedConfig } from "./types";
import { buildOutputPaths, errorMessage, generateId } from "./util";

let activeRefresh: Promise<RefreshResult> | undefined;

export async function runRefresh(logger: Logger, reason: string): Promise<RefreshResult> {
  if (!activeRefresh) {
    activeRefresh = executeRefresh(logger, reason).finally(() => {
      activeRefresh = undefined;
    });
  } else {
    logger.info("refresh_reused_inflight_run", { reason });
  }

  return activeRefresh;
}

export async function loadCurrentStatus(logger: Logger): Promise<ServiceStatus> {
  const config = getConfig();
  const store = new BlobStore(config);
  const fallback = buildStartingStatus(config);

  // Ensure connection string is available for BlobStore
  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    logger.warn("azure_storage_connection_string_missing", {
      message: "AZURE_STORAGE_CONNECTION_STRING not set, using managed identity",
    });
  }

  try {
    return (await store.readStatus()) ?? fallback;
  } catch (error) {
    logger.error("status_read_failed", { error: errorMessage(error) });

    return {
      ...fallback,
      errorSummary: [`Failed to read status.json: ${errorMessage(error)}`],
    };
  }
}

async function executeRefresh(logger: Logger, reason: string): Promise<RefreshResult> {
  const refreshId = generateId();
  const config = getConfig();
  const store = new BlobStore(config);
  const attemptTimestamp = new Date().toISOString();

  // Create refresh-scoped logger
  const refreshLogger = logger.withContext(refreshId).setCategory("refresh");

  const previousStatus = await safeReadStatus(store, refreshLogger, config.serviceName);
  const sourceFeeds = await loadSourceFeeds(config, refreshLogger);
  const sourceResults = await Promise.all(sourceFeeds.map((source) => fetchFeed(source, config, refreshLogger.setCategory("feed"))));

  // Build map of previous event counts by feed ID
  const previousEventCounts = new Map<string, number>();
  const previousConsecutiveFailures = new Map<string, number>();
  if (previousStatus?.sourceStatuses) {
    for (const status of previousStatus.sourceStatuses) {
      previousEventCounts.set(status.id, status.eventCount);
      previousConsecutiveFailures.set(status.id, status.consecutiveFailures ?? 0);
    }
  }

  // Enhance feed statuses with change detection
  const enhancedSourceResults = sourceResults.map((result) => {
    const previousCount = previousEventCounts.get(result.source.id);
    const previousFailures = previousConsecutiveFailures.get(result.source.id) ?? 0;
    const consecutiveFailures = result.status.ok ? 0 : previousFailures + 1;
    const suspect = result.status.ok && result.events.length === 0 && (previousCount ?? 0) > 0;

    return {
      ...result,
      status: {
        ...result.status,
        previousEventCount: previousCount,
        suspect,
        consecutiveFailures,
      },
    };
  });

  const successfulResults = enhancedSourceResults.filter((result) => result.status.ok);
  const failedStatuses = enhancedSourceResults.filter((result) => !result.status.ok).map((result) => result.status);

  // Generate feed change alerts
  const feedChangeAlerts = generateFeedChangeAlerts(enhancedSourceResults, attemptTimestamp);
  const suspectFeeds = enhancedSourceResults
    .filter((r) => r.status.suspect)
    .map((r) => r.source.id);

  const mergeResult = successfulResults.length > 0 ? mergeFeedEvents(successfulResults) : { events: [], potentialDuplicates: [] };
  const candidateEvents = mergeResult.events;
  const potentialDuplicates = mergeResult.potentialDuplicates;
  const candidateEventCount = candidateEvents.length;

  // Detect rescheduled events (7-day future window)
  const previousSnapshots = new Map<string, EventSnapshot>();
  if (previousStatus?.eventSnapshots) {
    for (const [uid, snapshot] of Object.entries(previousStatus.eventSnapshots)) {
      previousSnapshots.set(uid, snapshot);
    }
  }
  const rescheduledEvents = detectRescheduledEvents(candidateEvents, previousSnapshots, attemptTimestamp);

  // Create new snapshots for next refresh
  const newSnapshots = createSnapshotMap(candidateEvents, attemptTimestamp);

  const previousCalendarExists = await safeCalendarExists(store, refreshLogger);
  const canPublishPartial = failedStatuses.length > 0 && !previousCalendarExists;
  const shouldPublishCalendar = successfulResults.length > 0 && (failedStatuses.length === 0 || canPublishPartial);
  let calendarPublished = false;
  let gamesOnlyCalendarPublished = false;
  let usedLastKnownGood = false;
  let mergedEventCount = previousStatus?.mergedEventCount ?? 0;
  let gamesOnlyMergedEventCount = previousStatus?.gamesOnlyMergedEventCount ?? 0;

  // Track per-calendar timestamps
  const previousCheck = previousStatus?.lastSuccessfulCheck;
  let fullCalendarTimestamp = previousCheck && typeof previousCheck === "object" ? previousCheck.fullCalendar : undefined;
  let gamesCalendarTimestamp = previousCheck && typeof previousCheck === "object" ? previousCheck.gamesCalendar : undefined;

  // Legacy: Keep for backward compatibility
  let lastSuccessfulRefresh = previousStatus?.lastSuccessfulRefresh;

  const errorSummary = failedStatuses.map((status) => `${status.id}: ${status.error ?? "Unknown feed failure."}`);
  const publishErrors: string[] = [];

  refreshLogger.info("refresh_started", {
    reason,
    feedCount: sourceFeeds.length,
    refreshId,
  });

  // Build public artifacts to get cancelled event count
  const generatedAt = new Date();
  const publicArtifacts = candidateEvents.length > 0
    ? buildPublicCalendarArtifacts(candidateEvents, config.serviceName, generatedAt)
    : null;
  const cancelledEventsFiltered = publicArtifacts?.cancelledEventsFiltered ?? 0;

  if (shouldPublishCalendar && publicArtifacts) {
    try {
      await store.writeCalendar(publicArtifacts.fullCalendarText);
      await store.writePublicJsonBlob(config.scheduleXFullBlobPath, publicArtifacts.fullScheduleX);
      calendarPublished = true;
      mergedEventCount = publicArtifacts.publicEvents.length;
      fullCalendarTimestamp = attemptTimestamp;
    } catch (error) {
      const message = `Failed to write ${config.outputBlobPath}: ${errorMessage(error)}`;
      publishErrors.push(message);
      refreshLogger.setCategory("publish").error("calendar_write_failed", { error: message, blobPath: config.outputBlobPath });
      usedLastKnownGood = previousCalendarExists;
    }

    try {
      await store.writeCalendar(publicArtifacts.gamesCalendarText, config.gamesOutputBlobPath);
      await store.writePublicJsonBlob(config.scheduleXGamesBlobPath, publicArtifacts.gamesScheduleX);
      gamesOnlyCalendarPublished = true;
      gamesOnlyMergedEventCount = publicArtifacts.publicGamesEvents.length;
      gamesCalendarTimestamp = attemptTimestamp;
    } catch (error) {
      const message = `Failed to write ${config.gamesOutputBlobPath}: ${errorMessage(error)}`;
      publishErrors.push(message);
      refreshLogger.setCategory("publish").error("games_calendar_write_failed", { error: message, blobPath: config.gamesOutputBlobPath });
      usedLastKnownGood = previousCalendarExists;
    }

    // Update legacy field if both succeed
    if (calendarPublished && gamesOnlyCalendarPublished) {
      lastSuccessfulRefresh = attemptTimestamp;
    }
  } else if (successfulResults.length > 0) {
    usedLastKnownGood = previousCalendarExists;
  }

  // Build per-calendar timestamp structure
  const lastSuccessfulCheck = {
    fullCalendar: fullCalendarTimestamp,
    gamesCalendar: gamesCalendarTimestamp,
    combined: calendarPublished && gamesOnlyCalendarPublished ? attemptTimestamp : undefined,
  };

  // Calculate calendar ages in hours
  const now = new Date(attemptTimestamp).getTime();
  const checkAgeHours = {
    fullCalendar: fullCalendarTimestamp ? (now - new Date(fullCalendarTimestamp).getTime()) / (1000 * 60 * 60) : undefined,
    gamesCalendar: gamesCalendarTimestamp ? (now - new Date(gamesCalendarTimestamp).getTime()) / (1000 * 60 * 60) : undefined,
  };

  errorSummary.push(...publishErrors);
  const hasAnyPublishedOutput = calendarPublished || gamesOnlyCalendarPublished;

  const state =
    successfulResults.length === 0 || (publishErrors.length > 0 && !hasAnyPublishedOutput)
      ? "failed"
      : failedStatuses.length > 0 || publishErrors.length > 0
        ? "partial"
        : "success";

  // Calculate operational state and degradation reasons
  const degradationReasons: string[] = [];
  let operationalState: "healthy" | "degraded" | "failed";

  if (state === "failed") {
    operationalState = "failed";
    if (successfulResults.length === 0) {
      degradationReasons.push("All feeds failed");
    }
    if (!hasAnyPublishedOutput) {
      degradationReasons.push("No calendars published");
    }
  } else if (state === "partial" || usedLastKnownGood) {
    operationalState = "degraded";

    // Add specific degradation reasons
    if (failedStatuses.length > 0) {
      const failedFeedNames = failedStatuses.map((s) => s.name).join(", ");
      degradationReasons.push(`${failedStatuses.length} feed(s) failed: ${failedFeedNames}`);
    }

    if (usedLastKnownGood) {
      degradationReasons.push("Serving last-known-good data (stale calendar)");
    }

    if (calendarPublished && !gamesOnlyCalendarPublished) {
      degradationReasons.push("Games calendar failed to publish");
    } else if (!calendarPublished && gamesOnlyCalendarPublished) {
      degradationReasons.push("Full calendar failed to publish");
    }

    // Check for 0-event feeds (suspect condition)
    const zeroEventFeeds = successfulResults.filter((r) => r.events.length === 0);
    if (zeroEventFeeds.length > 0) {
      const feedNames = zeroEventFeeds.map((r) => r.source.name).join(", ");
      degradationReasons.push(`${zeroEventFeeds.length} feed(s) returned 0 events: ${feedNames}`);
    }

    // Add feed change alerts to degradation reasons
    const warningAlerts = feedChangeAlerts.filter((a) => a.severity === "warning" || a.severity === "error");
    if (warningAlerts.length > 0) {
      for (const alert of warningAlerts) {
        degradationReasons.push(
          `${alert.feedName}: ${alert.change.replace(/-/g, " ")} (${alert.previousCount} → ${alert.currentCount})`,
        );
      }
    }
  } else if (rescheduledEvents.length > 0) {
    // Reschedules aren't a failure, but worth noting in status
    operationalState = "degraded";
    degradationReasons.push(`${rescheduledEvents.length} event(s) rescheduled (time or location changed)`);
  } else {
    operationalState = "healthy";
  }

  const status: ServiceStatus = {
    serviceName: config.serviceName,
    refreshId, // Include refreshId for tracking
    operationalState,
    degradationReasons: degradationReasons.length > 0 ? degradationReasons : undefined,
    state,
    healthy: operationalState !== "failed", // Updated: based on operational state
    lastAttemptedRefresh: attemptTimestamp,
    lastSuccessfulRefresh, // Legacy field for backward compatibility
    lastSuccessfulCheck, // New per-calendar timestamps
    checkAgeHours, // Age of each calendar in hours
    sourceFeedCount: sourceFeeds.length,
    mergedEventCount,
    gamesOnlyMergedEventCount,
    candidateMergedEventCount:
      state === "partial" || (state === "failed" && candidateEventCount > 0) ? candidateEventCount : undefined,
    calendarPublished,
    gamesOnlyCalendarPublished,
    servedLastKnownGood: usedLastKnownGood,
    sourceStatuses: enhancedSourceResults.map((result) => result.status),
    feedChangeAlerts: feedChangeAlerts.length > 0 ? feedChangeAlerts : undefined,
    suspectFeeds: suspectFeeds.length > 0 ? suspectFeeds : undefined,
    potentialDuplicates: potentialDuplicates.length > 0 ? potentialDuplicates : undefined,
    rescheduledEvents: rescheduledEvents.length > 0 ? rescheduledEvents : undefined,
    cancelledEventsFiltered: cancelledEventsFiltered > 0 ? cancelledEventsFiltered : undefined,
    eventSnapshots: newSnapshots.size > 0 ? Object.fromEntries(newSnapshots) : undefined,
    output: buildOutputPaths(config),
    errorSummary,
  };

  try {
    await store.writeInternalStatus(status);
  } catch (error) {
    const message = `Failed to write internal status: ${errorMessage(error)}`;
    refreshLogger.setCategory("system").error("internal_status_write_failed", { error: message });
    status.operationalState = status.operationalState === "failed" ? "failed" : "degraded";
    status.healthy = status.operationalState !== "failed";
    status.degradationReasons = [
      ...(status.degradationReasons ?? []),
      "Internal diagnostics failed to persist",
    ];
    status.errorSummary = [...status.errorSummary, message];
  }

  try {
    await store.writePublicStatus(status);
  } catch (error) {
    const message = `Failed to write status.json: ${errorMessage(error)}`;
    refreshLogger.setCategory("system").error("status_write_failed", { error: message });
    status.healthy = false;
    status.operationalState = "failed";
    status.degradationReasons = [
      ...(status.degradationReasons ?? []),
      "Public status failed to publish",
    ];
    status.errorSummary = [...status.errorSummary, message];
  }

  refreshLogger.info("refresh_finished", {
    reason,
    state,
    operationalState,
    mergedEventCount: status.mergedEventCount,
    gamesOnlyMergedEventCount: status.gamesOnlyMergedEventCount,
    candidateEventCount,
    calendarPublished,
    gamesOnlyCalendarPublished,
    usedLastKnownGood,
    failures: failedStatuses.length,
    refreshId,
  });

  return {
    status,
    candidateEventCount,
    calendarPublished,
    usedLastKnownGood,
  };
}

/**
 * Generates feed change alerts based on event count changes
 */
function generateFeedChangeAlerts(results: FeedRunResult[], timestamp: string): FeedChangeAlert[] {
  const alerts: FeedChangeAlert[] = [];

  for (const result of results) {
    const currentCount = result.status.eventCount;
    const previousCount = result.status.previousEventCount;

    // Skip if we don't have previous data
    if (previousCount === undefined) {
      continue;
    }

    // Skip if feed failed (no meaningful comparison)
    if (!result.status.ok) {
      continue;
    }

    let changeType: "events-to-zero" | "zero-to-events" | "significant-drop" | "significant-increase" | null = null;
    let severity: "info" | "warning" | "error" = "info";

    // Events to zero (suspect condition)
    if (previousCount > 0 && currentCount === 0) {
      changeType = "events-to-zero";
      severity = "warning";
    }
    // Zero to events (recovery)
    else if (previousCount === 0 && currentCount > 0) {
      changeType = "zero-to-events";
      severity = "info";
    }
    // Significant drop (>50%)
    else if (currentCount < previousCount * 0.5 && previousCount > 0) {
      changeType = "significant-drop";
      severity = "warning";
    }
    // Significant increase (>2x)
    else if (currentCount > previousCount * 2 && previousCount > 0) {
      changeType = "significant-increase";
      severity = "info";
    }

    if (changeType) {
      const percentChange = previousCount > 0 ? ((currentCount - previousCount) / previousCount) * 100 : 100;

      alerts.push({
        feedId: result.source.id,
        feedName: result.source.name,
        change: changeType,
        previousCount,
        currentCount,
        percentChange: Math.round(percentChange),
        timestamp,
        severity,
      });
    }
  }

  return alerts;
}

async function safeReadStatus(store: BlobStore, logger: Logger, serviceName: string) {
  try {
    return await store.readStatusForRefresh();
  } catch (error) {
    logger.warn("status_read_ignored", {
      serviceName,
      error: errorMessage(error),
    });

    return null;
  }
}

async function safeCalendarExists(store: BlobStore, logger: Logger): Promise<boolean> {
  try {
    return await store.calendarExists();
  } catch (error) {
    logger.warn("calendar_exists_check_failed", {
      error: errorMessage(error),
    });

    return false;
  }
}
