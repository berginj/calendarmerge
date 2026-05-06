import { createHash, randomBytes } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { AppConfig, OutputPaths } from "./types";

export const MAX_FEED_ID_LENGTH = 255;
const FEED_ID_PATTERN = /^[a-z0-9-]+$/;

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateId(): string {
  // Generate a UUID v4-like identifier
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function slugifyId(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "feed";
}

export function validateFeedId(input: string): void {
  if (!input.trim()) {
    throw new Error("Feed ID must be a non-empty string");
  }

  if (input.length > MAX_FEED_ID_LENGTH) {
    throw new Error(`Feed ID must be ${MAX_FEED_ID_LENGTH} characters or fewer`);
  }

  if (!FEED_ID_PATTERN.test(input)) {
    throw new Error("Feed ID must contain only lowercase letters, numbers, and hyphens");
  }
}

export function normalizeBlobPath(input: string): string {
  const value = input.trim().replace(/^\/+/, "");
  if (!value) {
    throw new Error("Blob paths must not be empty.");
  }

  // SECURITY: Block path traversal attempts
  if (value.includes("..")) {
    throw new Error("Blob paths cannot contain '..' sequences (path traversal blocked)");
  }

  return value;
}

export function normalizeUrlBase(input: string | undefined): string | undefined {
  const value = input?.trim();
  if (!value) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`OUTPUT_BASE_URL must be a valid absolute URL: ${value}`);
  }

  return parsed.toString().replace(/\/+$/, "");
}

export type FeedDnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

const defaultDnsLookup: FeedDnsLookup = (hostname, options) => dnsLookup(hostname, options);

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function isBlockedIPv4Address(address: string): boolean {
  const octets = address.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second, third] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isBlockedIPv6Address(address: string): boolean {
  const normalized = normalizeHostname(address);
  const ipv4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Mapped) {
    return isBlockedIPv4Address(ipv4Mapped[1]);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("ff") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8:")
  );
}

export function isPrivateOrLocalAddress(hostnameOrAddress: string): boolean {
  const normalized = normalizeHostname(hostnameOrAddress);

  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isBlockedIPv4Address(normalized);
  }

  if (ipVersion === 6) {
    return isBlockedIPv6Address(normalized);
  }

  return false;
}

export function normalizeFeedUrl(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new Error("Feed URL is required.");
  }

  const candidate = value.replace(/^webcals?:\/\//i, "https://");

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Feed URL is not a valid URL: ${value}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Feed URL must use http, https, or webcal: ${value}`);
  }

  // SECURITY: Block localhost and private IPs to prevent SSRF
  if (isPrivateOrLocalAddress(parsed.hostname)) {
    throw new Error(`Feed URL cannot use private or local addresses: ${parsed.hostname}`);
  }

  return parsed.toString();
}

export async function validateFeedUrlTarget(
  input: string,
  lookupAddress: FeedDnsLookup = defaultDnsLookup,
): Promise<string> {
  const normalizedUrl = normalizeFeedUrl(input);
  const parsed = new URL(normalizedUrl);
  const hostname = normalizeHostname(parsed.hostname);

  if (isIP(hostname)) {
    return normalizedUrl;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookupAddress(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(`Feed URL host could not be resolved: ${parsed.hostname}`);
  }

  if (addresses.length === 0) {
    throw new Error(`Feed URL host did not resolve to any addresses: ${parsed.hostname}`);
  }

  const blockedAddress = addresses.find((address) => isPrivateOrLocalAddress(address.address));
  if (blockedAddress) {
    throw new Error(`Feed URL host resolves to private or local address: ${parsed.hostname}`);
  }

  return normalizedUrl;
}

export function deriveFeedIdFromUrl(input: string, fallbackIndex?: number): string {
  const parsed = new URL(normalizeFeedUrl(input));
  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  const pathTail = pathSegments[pathSegments.length - 1];
  const baseId = truncateFeedId(slugifyId(`${parsed.hostname}-${pathTail ?? fallbackIndex ?? 1}`));
  const needsDisambiguation =
    !pathTail || pathSegments.length > 1 || Boolean(parsed.search) || Boolean(parsed.hash);

  if (!needsDisambiguation) {
    return baseId;
  }

  const hash = sha256Hex(parsed.toString()).slice(0, 8);
  const prefix = truncateFeedId(baseId, MAX_FEED_ID_LENGTH - hash.length - 1);
  return `${prefix}-${hash}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function buildOutputPaths(config: AppConfig): OutputPaths {
  const baseUrl = config.outputBaseUrl
    ? config.outputBaseUrl
    : `https://${config.outputStorageAccount}.blob.core.windows.net/${config.outputContainer}`;

  return {
    storageAccount: config.outputStorageAccount,
    container: config.outputContainer,
    calendarBlobPath: config.outputBlobPath,
    gamesCalendarBlobPath: config.gamesOutputBlobPath,
    scheduleXFullBlobPath: config.scheduleXFullBlobPath,
    scheduleXGamesBlobPath: config.scheduleXGamesBlobPath,
    statusBlobPath: config.statusBlobPath,
    blobBaseUrl: baseUrl,
    blobCalendarUrl: joinUrlPath(baseUrl, config.outputBlobPath),
    blobGamesCalendarUrl: joinUrlPath(baseUrl, config.gamesOutputBlobPath),
    blobScheduleXFullUrl: joinUrlPath(baseUrl, config.scheduleXFullBlobPath),
    blobScheduleXGamesUrl: joinUrlPath(baseUrl, config.scheduleXGamesBlobPath),
    blobStatusUrl: joinUrlPath(baseUrl, config.statusBlobPath),
  };
}

export function redactFeedUrl(input: string): string {
  try {
    const parsed = new URL(normalizeFeedUrl(input));
    return `${parsed.origin}/[redacted]`;
  } catch {
    return "[redacted]";
  }
}

export function getStorageConnectionString(storageAccount: string): string {
  // Prefer explicit connection string from environment
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    return connectionString;
  }

  // Fallback: use just the storage account name (will use DefaultAzureCredential)
  return storageAccount;
}

export function isTableStorageEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_TABLE_STORAGE?.trim().toLowerCase() === "true";
}

export function looksLikeConnectionString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return (
    trimmed.includes("UseDevelopmentStorage=") ||
    trimmed.includes("DefaultEndpointsProtocol=") ||
    trimmed.includes("AccountName=") ||
    trimmed.includes("BlobEndpoint=") ||
    trimmed.includes("TableEndpoint=") ||
    (trimmed.includes("=") && trimmed.includes(";"))
  );
}

function joinUrlPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function truncateFeedId(input: string, maxLength = MAX_FEED_ID_LENGTH): string {
  if (input.length <= maxLength) {
    return input;
  }

  return input.slice(0, maxLength).replace(/-+$/g, "") || "feed";
}
