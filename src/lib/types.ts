export type RefreshState = "starting" | "success" | "partial" | "failed";
export type OperationalState = "healthy" | "degraded" | "failed";
export type PublishedEventFilter = "all-events" | "games-only";
export type FeedChangeType = "events-to-zero" | "zero-to-events" | "significant-drop" | "significant-increase";
export type AlertSeverity = "info" | "warning" | "error";

export interface SourceFeedConfig {
  id: string;
  name: string;
  url: string;
  enabled?: boolean;
}

export interface AppConfig {
  serviceName: string;
  sourceFeeds: SourceFeedConfig[];
  outputStorageAccount: string;
  outputBaseUrl?: string;
  outputContainer: string;
  outputBlobPath: string;
  gamesOutputBlobPath: string;
  scheduleXFullBlobPath: string;
  scheduleXGamesBlobPath: string;
  statusBlobPath: string;
  internalStatusContainer: string;
  internalStatusBlobPath: string;
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
  previousEventCount?: number;
  suspect?: boolean;
  consecutiveFailures?: number;
}

export interface FeedRunResult {
  source: SourceFeedConfig;
  status: FeedStatus;
  events: ParsedEvent[];
}

export interface MergeResult {
  events: ParsedEvent[];
  potentialDuplicates: PotentialDuplicate[];
}

export interface OutputPaths {
  storageAccount: string;
  container: string;
  calendarBlobPath: string;
  gamesCalendarBlobPath: string;
  scheduleXFullBlobPath: string;
  scheduleXGamesBlobPath: string;
  statusBlobPath: string;
  blobBaseUrl: string;
  blobCalendarUrl: string;
  blobGamesCalendarUrl: string;
  blobScheduleXFullUrl: string;
  blobScheduleXGamesUrl: string;
  blobStatusUrl: string;
}

export interface FeedChangeAlert {
  feedId: string;
  feedName: string;
  change: FeedChangeType;
  previousCount: number;
  currentCount: number;
  percentChange: number;
  timestamp: string;
  severity: AlertSeverity;
}

export interface PotentialDuplicateInstance {
  feedId: string;
  feedName: string;
  time: string;
  location: string;
  uid: string;
}

export interface PotentialDuplicate {
  summary: string;
  date: string;
  instances: PotentialDuplicateInstance[];
  confidence: "high" | "medium" | "low";
}

export interface EventChange {
  time?: { from: string; to: string };
  location?: { from: string; to: string };
}

export interface RescheduledEvent {
  uid: string;
  summary: string;
  feedId: string;
  feedName: string;
  changes: EventChange;
  detectedAt: string;
}

export interface CalendarTimestamps {
  fullCalendar?: string;
  gamesCalendar?: string;
  combined?: string;
}

export interface CalendarAges {
  fullCalendar?: number;
  gamesCalendar?: number;
}

export interface EventSnapshot {
  uid: string;
  summary: string;
  sourceId: string;
  sourceName: string;
  startTime: string;
  endTime?: string;
  location: string;
  capturedAt: string;
}

export interface ServiceStatus {
  // Core identification
  serviceName: string;
  refreshId?: string;

  // Operational state (new)
  operationalState?: OperationalState;
  degradationReasons?: string[];

  // Legacy state (backward compatibility)
  state: RefreshState;
  healthy: boolean;

  // Timestamps - enhanced
  lastAttemptedRefresh?: string;
  lastSuccessfulRefresh?: string; // Legacy: combined timestamp (deprecated, use lastSuccessfulCheck)
  lastSuccessfulCheck?: CalendarTimestamps; // New: per-calendar timestamps
  checkAgeHours?: CalendarAges;

  // Event counts
  sourceFeedCount: number;
  mergedEventCount: number;
  gamesOnlyMergedEventCount: number;
  candidateMergedEventCount?: number;

  // Publishing status
  calendarPublished: boolean;
  gamesOnlyCalendarPublished: boolean;
  servedLastKnownGood: boolean;

  // Feed details
  sourceStatuses: FeedStatus[];
  feedChangeAlerts?: FeedChangeAlert[];
  suspectFeeds?: string[];

  // Event insights (new)
  potentialDuplicates?: PotentialDuplicate[];
  rescheduledEvents?: RescheduledEvent[];
  cancelledEventsFiltered?: number;

  // Event snapshots for change detection (internal, not displayed to users)
  eventSnapshots?: Record<string, EventSnapshot>;

  // Output paths
  output: OutputPaths;

  // Errors
  errorSummary: string[];
}

export type PublicServiceStatus = Pick<
  ServiceStatus,
  | "serviceName"
  | "refreshId"
  | "operationalState"
  | "degradationReasons"
  | "state"
  | "healthy"
  | "lastAttemptedRefresh"
  | "lastSuccessfulRefresh"
  | "lastSuccessfulCheck"
  | "checkAgeHours"
  | "sourceFeedCount"
  | "mergedEventCount"
  | "gamesOnlyMergedEventCount"
  | "candidateMergedEventCount"
  | "calendarPublished"
  | "gamesOnlyCalendarPublished"
  | "servedLastKnownGood"
  | "cancelledEventsFiltered"
  | "output"
  | "errorSummary"
>;

export interface RefreshResult {
  status: ServiceStatus;
  candidateEventCount: number;
  calendarPublished: boolean;
  usedLastKnownGood: boolean;
}

export type { SourceFeedEntity } from "./tableStore";
