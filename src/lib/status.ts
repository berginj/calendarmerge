import { AppConfig, PublicServiceStatus, ServiceStatus } from "./types";
import { buildOutputPaths } from "./util";

export function buildStartingStatus(config: AppConfig): ServiceStatus {
  return {
    serviceName: config.serviceName,
    state: "starting",
    healthy: false,
    sourceFeedCount: config.sourceFeeds.length,
    mergedEventCount: 0,
    gamesOnlyMergedEventCount: 0,
    calendarPublished: false,
    gamesOnlyCalendarPublished: false,
    servedLastKnownGood: false,
    sourceStatuses: [],
    output: buildOutputPaths(config),
    errorSummary: [],
  };
}

export function buildPublicStatus(status: ServiceStatus): PublicServiceStatus {
  return {
    serviceName: status.serviceName,
    refreshId: status.refreshId,
    operationalState: status.operationalState,
    degradationReasons: status.degradationReasons,
    state: status.state,
    healthy: status.healthy,
    lastAttemptedRefresh: status.lastAttemptedRefresh,
    lastSuccessfulRefresh: status.lastSuccessfulRefresh,
    lastSuccessfulCheck: status.lastSuccessfulCheck,
    checkAgeHours: status.checkAgeHours,
    sourceFeedCount: status.sourceFeedCount,
    mergedEventCount: status.mergedEventCount,
    gamesOnlyMergedEventCount: status.gamesOnlyMergedEventCount,
    candidateMergedEventCount: status.candidateMergedEventCount,
    calendarPublished: status.calendarPublished,
    gamesOnlyCalendarPublished: status.gamesOnlyCalendarPublished,
    servedLastKnownGood: status.servedLastKnownGood,
    cancelledEventsFiltered: status.cancelledEventsFiltered,
    output: status.output,
    errorSummary: status.errorSummary,
  };
}
