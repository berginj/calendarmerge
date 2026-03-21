import { AppConfig, ServiceStatus } from "./types";
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
