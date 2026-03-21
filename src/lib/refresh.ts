import { BlobStore } from "./blobStore";
import { getConfig } from "./config";
import { applyEventFilter } from "./eventFilter";
import { fetchFeed } from "./fetchFeeds";
import { serializeCalendar } from "./ics";
import { Logger } from "./log";
import { mergeFeedEvents } from "./merge";
import { DEFAULT_SETTINGS, SettingsStore } from "./settingsStore";
import { loadSourceFeeds } from "./sourceFeeds";
import { buildStartingStatus } from "./status";
import { AppConfig, RefreshResult, ServiceStatus, SourceFeedConfig } from "./types";
import { buildOutputPaths, errorMessage, getStorageConnectionString } from "./util";

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
  const config = getConfig();
  const store = new BlobStore(config);
  const attemptTimestamp = new Date().toISOString();
  const previousStatus = await safeReadStatus(store, logger, config.serviceName);
  const settings = await safeLoadSettings(config, logger);
  const sourceFeeds = await loadSourceFeeds(config, logger);
  const sourceResults = await Promise.all(sourceFeeds.map((source) => fetchFeed(source, config, logger)));
  const successfulResults = sourceResults.filter((result) => result.status.ok);
  const failedStatuses = sourceResults.filter((result) => !result.status.ok).map((result) => result.status);
  const candidateEvents = successfulResults.length > 0 ? mergeFeedEvents(successfulResults) : [];
  const candidateEventCount = candidateEvents.length;
  const publishedEvents = applyEventFilter(candidateEvents, settings.eventFilter);
  const publishedEventCount = publishedEvents.length;
  const previousCalendarExists = await safeCalendarExists(store, logger);
  const canPublishPartial = failedStatuses.length > 0 && !previousCalendarExists;
  const shouldPublishCalendar = successfulResults.length > 0 && (failedStatuses.length === 0 || canPublishPartial);
  let calendarPublished = false;
  let usedLastKnownGood = false;
  let mergedEventCount = previousStatus?.mergedEventCount ?? 0;
  let lastSuccessfulRefresh = previousStatus?.lastSuccessfulRefresh;
  const errorSummary = failedStatuses.map((status) => `${status.id}: ${status.error ?? "Unknown feed failure."}`);
  let fatalPublishError: string | undefined;

  logger.info("refresh_started", {
    reason,
    feedCount: sourceFeeds.length,
    eventFilter: settings.eventFilter,
  });

  if (shouldPublishCalendar) {
    try {
      const calendarText = serializeCalendar(publishedEvents, config.serviceName);
      await store.writeCalendar(calendarText);
      calendarPublished = true;
      mergedEventCount = publishedEventCount;
      lastSuccessfulRefresh = attemptTimestamp;
    } catch (error) {
      fatalPublishError = `Failed to write calendar.ics: ${errorMessage(error)}`;
      logger.error("calendar_write_failed", { error: fatalPublishError });
      usedLastKnownGood = previousCalendarExists;
      errorSummary.push(fatalPublishError);
    }
  } else if (successfulResults.length > 0) {
    usedLastKnownGood = previousCalendarExists;
  }

  const state =
    successfulResults.length === 0 || fatalPublishError
      ? "failed"
      : failedStatuses.length > 0
        ? "partial"
        : "success";
  const status: ServiceStatus = {
    serviceName: config.serviceName,
    state,
    healthy: state !== "failed",
    eventFilter: settings.eventFilter,
    lastAttemptedRefresh: attemptTimestamp,
    lastSuccessfulRefresh,
    sourceFeedCount: sourceFeeds.length,
    mergedEventCount,
    unfilteredMergedEventCount:
      settings.eventFilter === "games-only" ? candidateEventCount : undefined,
    candidateMergedEventCount:
      state === "partial" || (state === "failed" && candidateEventCount > 0) ? candidateEventCount : undefined,
    calendarPublished,
    servedLastKnownGood: usedLastKnownGood,
    sourceStatuses: sourceResults.map((result) => result.status),
    output: buildOutputPaths(config),
    errorSummary,
  };

  try {
    await store.writeStatus(status);
  } catch (error) {
    const message = `Failed to write status.json: ${errorMessage(error)}`;
    logger.error("status_write_failed", { error: message });
    status.healthy = false;
    status.errorSummary = [...status.errorSummary, message];
  }

  logger.info("refresh_finished", {
    reason,
    state,
    mergedEventCount: status.mergedEventCount,
    candidateEventCount,
    calendarPublished,
    usedLastKnownGood,
    failures: failedStatuses.length,
  });

  return {
    status,
    candidateEventCount,
    calendarPublished,
    usedLastKnownGood,
  };
}

async function safeReadStatus(store: BlobStore, logger: Logger, serviceName: string) {
  try {
    return await store.readStatus();
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

async function safeLoadSettings(config: AppConfig, logger: Logger) {
  try {
    const settingsStore = new SettingsStore(getStorageConnectionString(config.outputStorageAccount));
    return await settingsStore.getSettings();
  } catch (error) {
    logger.warn("settings_load_failed_defaulting", {
      error: errorMessage(error),
      eventFilter: DEFAULT_SETTINGS.eventFilter,
    });

    return DEFAULT_SETTINGS;
  }
}
