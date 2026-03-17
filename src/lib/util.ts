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
  const baseUrl = `https://${config.outputStorageAccount}.blob.core.windows.net`;

  return {
    storageAccount: config.outputStorageAccount,
    container: config.outputContainer,
    calendarBlobPath: config.outputBlobPath,
    statusBlobPath: config.statusBlobPath,
    blobBaseUrl: baseUrl,
    blobCalendarUrl: `${baseUrl}/${config.outputContainer}/${config.outputBlobPath}`,
    blobStatusUrl: `${baseUrl}/${config.outputContainer}/${config.statusBlobPath}`,
  };
}
