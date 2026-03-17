export type RefreshState = "starting" | "success" | "partial" | "failed";

export interface SourceFeedConfig {
  id: string;
  name: string;
  url: string;
}

export interface AppConfig {
  serviceName: string;
  sourceFeeds: SourceFeedConfig[];
  outputStorageAccount: string;
  outputContainer: string;
  outputBlobPath: string;
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
  url: string;
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
  statusBlobPath: string;
  blobBaseUrl: string;
  blobCalendarUrl: string;
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
  candidateMergedEventCount?: number;
  calendarPublished: boolean;
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
