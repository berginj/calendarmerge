import { createHash } from "node:crypto";

import { AppConfig, OutputPaths } from "./types";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function slugifyId(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "feed";
}

export function normalizeBlobPath(input: string): string {
  const value = input.trim().replace(/^\/+/, "");
  if (!value) {
    throw new Error("Blob paths must not be empty.");
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
    statusBlobPath: config.statusBlobPath,
    blobBaseUrl: baseUrl,
    blobCalendarUrl: joinUrlPath(baseUrl, config.outputBlobPath),
    blobStatusUrl: joinUrlPath(baseUrl, config.statusBlobPath),
  };
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
