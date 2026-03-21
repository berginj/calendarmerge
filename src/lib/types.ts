export type RefreshState = "starting" | "success" | "partial" | "failed";
export type PublishedEventFilter = "all-events" | "games-only";

export interface SourceFeedConfig {
  id: string;
  name: string;
  url: string;
}

export interface AppConfig {
  serviceName: string;
  sourceFeeds: SourceFeedConfig[];
  outputStorageAccount: string;
  outputBaseUrl?: string;
  outputContainer: string;
  outputBlobPath: string;
  gamesOutputBlobPath: string;
  statusBlobPath: string;
  refreshSchedule: string;
  fetchTimeoutMs: number;
  fetchRetryCount: number;
  fetchRetryDelayMs: number;
}

export interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

export interface ParsedDateValue {
  kind: "date" | "date-time";
  raw: string;
  params: Record<string, string>;
  sortValue: number;
  iso: string;
}

export interface ParsedEvent {
  sourceId: string;
  sourceName: string;
  identityKey: string;
  mergedUid: string;
  rawUid?: string;
  summary: string;
  location: string;
  status?: string;
  cancelled: boolean;
  sequence: number;
  updatedSortValue?: number;
  start: ParsedDateValue;
  end?: ParsedDateValue;
  properties: IcsProperty[];
}

export interface FeedStatus {
  id: string;
  name: string;
  url?: string;
  ok: boolean;
  attemptedAt: string;
  durationMs: number;
  eventCount: number;
  httpStatus?: number;
  error?: string;
}

export interface FeedRunResult {
  source: SourceFeedConfig;
  status: FeedStatus;
  events: ParsedEvent[];
}

export interface OutputPaths {
  storageAccount: string;
  container: string;
  calendarBlobPath: string;
  gamesCalendarBlobPath: string;
  statusBlobPath: string;
  blobBaseUrl: string;
  blobCalendarUrl: string;
  blobGamesCalendarUrl: string;
  blobStatusUrl: string;
}

export interface ServiceStatus {
  serviceName: string;
  state: RefreshState;
  healthy: boolean;
  lastAttemptedRefresh?: string;
  lastSuccessfulRefresh?: string;
  sourceFeedCount: number;
  mergedEventCount: number;
  gamesOnlyMergedEventCount: number;
  candidateMergedEventCount?: number;
  calendarPublished: boolean;
  gamesOnlyCalendarPublished: boolean;
  servedLastKnownGood: boolean;
  sourceStatuses: FeedStatus[];
  output: OutputPaths;
  errorSummary: string[];
}

export interface RefreshResult {
  status: ServiceStatus;
  candidateEventCount: number;
  calendarPublished: boolean;
  usedLastKnownGood: boolean;
}

export type { SourceFeedEntity } from "./tableStore";
