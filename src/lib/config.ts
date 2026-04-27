import { AppConfig, SourceFeedConfig } from "./types";
import {
  deriveFeedIdFromUrl,
  errorMessage,
  isTableStorageEnabled,
  normalizeBlobPath,
  normalizeFeedUrl,
  normalizeUrlBase,
  slugifyId,
} from "./util";

export const DEFAULT_SERVICE_NAME = "calendarmerge";
export const DEFAULT_OUTPUT_CONTAINER = "$web";
export const DEFAULT_OUTPUT_BLOB_PATH = "calendar.ics";
export const DEFAULT_GAMES_OUTPUT_BLOB_PATH = "calendar-games.ics";
export const DEFAULT_SCHEDULE_X_FULL_BLOB_PATH = "schedule-x-full.json";
export const DEFAULT_SCHEDULE_X_GAMES_BLOB_PATH = "schedule-x-games.json";
export const DEFAULT_STATUS_BLOB_PATH = "status.json";
// Updated from 15 to 30 minutes based on platform research (see PLATFORM_INTEGRATION_NOTES.md)
// Most sports platforms (GameChanger, TeamSnap, etc.) refresh around 30-60 minutes
export const DEFAULT_REFRESH_SCHEDULE = "0 */30 * * * *";
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
export const DEFAULT_FETCH_RETRY_COUNT = 2;
export const DEFAULT_FETCH_RETRY_DELAY_MS = 750;

type RawSourceFeed =
  | string
  | {
      id?: string;
      name?: string;
      url?: string;
      enabled?: boolean;
    };

let cachedConfig: AppConfig | undefined;

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env === process.env && cachedConfig) {
    return cachedConfig;
  }

  const config = loadConfig(env);

  if (env === process.env) {
    cachedConfig = config;
  }

  return config;
}

export function clearConfigCache(): void {
  cachedConfig = undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const enableTableStorage = isTableStorageEnabled(env);
  const sourceFeeds = parseSourceFeeds(env.SOURCE_FEEDS_JSON, !enableTableStorage);
  const outputStorageAccount = required(env.OUTPUT_STORAGE_ACCOUNT, "OUTPUT_STORAGE_ACCOUNT");
  const outputBaseUrl = normalizeUrlBase(env.OUTPUT_BASE_URL);
  const outputContainer = (env.OUTPUT_CONTAINER ?? DEFAULT_OUTPUT_CONTAINER).trim();
  const outputBlobPath = normalizeBlobPath(env.OUTPUT_BLOB_PATH ?? DEFAULT_OUTPUT_BLOB_PATH);
  const gamesOutputBlobPath = normalizeBlobPath(
    env.OUTPUT_GAMES_BLOB_PATH ?? DEFAULT_GAMES_OUTPUT_BLOB_PATH,
  );
  const scheduleXFullBlobPath = normalizeBlobPath(
    env.SCHEDULE_X_FULL_BLOB_PATH ?? DEFAULT_SCHEDULE_X_FULL_BLOB_PATH,
  );
  const scheduleXGamesBlobPath = normalizeBlobPath(
    env.SCHEDULE_X_GAMES_BLOB_PATH ?? DEFAULT_SCHEDULE_X_GAMES_BLOB_PATH,
  );
  const statusBlobPath = normalizeBlobPath(env.STATUS_BLOB_PATH ?? DEFAULT_STATUS_BLOB_PATH);
  const refreshSchedule = (env.REFRESH_SCHEDULE ?? DEFAULT_REFRESH_SCHEDULE).trim();
  const fetchTimeoutMs = parsePositiveInteger(
    env.FETCH_TIMEOUT_MS,
    DEFAULT_FETCH_TIMEOUT_MS,
    "FETCH_TIMEOUT_MS",
  );
  const fetchRetryCount = parseNonNegativeInteger(
    env.FETCH_RETRY_COUNT,
    DEFAULT_FETCH_RETRY_COUNT,
    "FETCH_RETRY_COUNT",
  );
  const fetchRetryDelayMs = parseNonNegativeInteger(
    env.FETCH_RETRY_DELAY_MS,
    DEFAULT_FETCH_RETRY_DELAY_MS,
    "FETCH_RETRY_DELAY_MS",
  );

  validateStorageAccountName(outputStorageAccount);
  validateSchedule(refreshSchedule);

  return {
    serviceName: (env.SERVICE_NAME ?? DEFAULT_SERVICE_NAME).trim() || DEFAULT_SERVICE_NAME,
    sourceFeeds,
    outputStorageAccount,
    outputBaseUrl,
    outputContainer,
    outputBlobPath,
    gamesOutputBlobPath,
    scheduleXFullBlobPath,
    scheduleXGamesBlobPath,
    statusBlobPath,
    refreshSchedule,
    fetchTimeoutMs,
    fetchRetryCount,
    fetchRetryDelayMs,
  };
}

function parseSourceFeeds(raw: string | undefined, required: boolean): SourceFeedConfig[] {
  if (!raw || !raw.trim()) {
    if (required) {
      throw new Error("SOURCE_FEEDS_JSON must be set to a JSON array of ICS feed objects.");
    }

    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`SOURCE_FEEDS_JSON is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("SOURCE_FEEDS_JSON must decode to an array.");
  }

  const feeds = parsed
    .map((entry, index) => normalizeSourceFeed(entry as RawSourceFeed, index))
    .filter((entry): entry is SourceFeedConfig => entry !== null);

  if (required && feeds.length === 0) {
    throw new Error("SOURCE_FEEDS_JSON must contain at least one enabled source feed.");
  }

  const ids = new Set<string>();
  for (const feed of feeds) {
    if (ids.has(feed.id)) {
      throw new Error(`SOURCE_FEEDS_JSON contains a duplicate feed id: ${feed.id}`);
    }

    ids.add(feed.id);
  }

  return feeds;
}

function normalizeSourceFeed(entry: RawSourceFeed, index: number): SourceFeedConfig | null {
  if (typeof entry === "string") {
    const url = parseFeedUrl(entry, index);
    const id = deriveFeedId(url, index);

    return {
      id,
      name: id,
      url,
    };
  }

  if (!entry || typeof entry !== "object") {
    throw new Error(`SOURCE_FEEDS_JSON entry ${index + 1} must be a string or object.`);
  }

  if (entry.enabled === false) {
    return null;
  }

  const url = parseFeedUrl(entry.url, index);
  const id = (entry.id?.trim() ? slugifyId(entry.id) : deriveFeedId(url, index)) || `feed-${index + 1}`;
  const name = entry.name?.trim() || id;

  return {
    id,
    name,
    url,
  };
}

function parseFeedUrl(rawUrl: string | undefined, index: number): string {
  const candidate = rawUrl?.trim();
  if (!candidate) {
    throw new Error(`SOURCE_FEEDS_JSON entry ${index + 1} is missing a url.`);
  }

  try {
    return normalizeFeedUrl(candidate);
  } catch (error) {
    const message = errorMessage(error);
    if (message.startsWith("Feed URL must use")) {
      throw new Error(`SOURCE_FEEDS_JSON entry ${index + 1} must use http, https, or webcal: ${candidate}`);
    }

    throw new Error(`SOURCE_FEEDS_JSON entry ${index + 1} has an invalid url: ${candidate}`);
  }
}

function deriveFeedId(url: string, index: number): string {
  return deriveFeedIdFromUrl(url, index + 1);
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} must be set.`);
  }

  return trimmed;
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number, name: string): number {
  if (!rawValue?.trim()) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function parseNonNegativeInteger(rawValue: string | undefined, fallback: number, name: string): number {
  if (!rawValue?.trim()) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return value;
}

function validateStorageAccountName(name: string): void {
  if (!/^[a-z0-9]{3,24}$/.test(name)) {
    throw new Error(
      "OUTPUT_STORAGE_ACCOUNT must be a valid Azure storage account name (3-24 lowercase letters or digits).",
    );
  }
}

function validateSchedule(schedule: string): void {
  if (schedule.split(/\s+/).length !== 6) {
    throw new Error("REFRESH_SCHEDULE must be a 6-field NCRONTAB expression.");
  }
}
