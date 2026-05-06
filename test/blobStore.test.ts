import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfig, ServiceStatus } from "../src/lib/types";

const storageMock = vi.hoisted(() => {
  const blobs = new Map<string, { content: string; contentType?: string }>();
  const createdContainers = new Set<string>();

  return {
    blobs,
    createdContainers,
    reset() {
      blobs.clear();
      createdContainers.clear();
    },
  };
});

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: vi.fn(),
}));

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: class BlobServiceClient {
    static fromConnectionString() {
      return new BlobServiceClient();
    }

    getContainerClient(containerName: string) {
      return {
        createIfNotExists: vi.fn(async () => {
          storageMock.createdContainers.add(containerName);
        }),
        getBlockBlobClient(blobPath: string) {
          const key = `${containerName}/${blobPath}`;
          return {
            exists: vi.fn(async () => storageMock.blobs.has(key)),
            download: vi.fn(async () => ({
              readableStreamBody: Readable.from([storageMock.blobs.get(key)?.content ?? ""]),
            })),
            uploadData: vi.fn(async (data: Buffer, options?: { blobHTTPHeaders?: { blobContentType?: string } }) => {
              storageMock.blobs.set(key, {
                content: data.toString("utf8"),
                contentType: options?.blobHTTPHeaders?.blobContentType,
              });
            }),
          };
        },
      };
    }
  },
}));

import { BlobStore } from "../src/lib/blobStore";

const config: AppConfig = {
  serviceName: "calendarmerge",
  sourceFeeds: [],
  outputStorageAccount: "teststorage",
  outputBaseUrl: "https://teststorage.z13.web.core.windows.net",
  outputContainer: "$web",
  outputBlobPath: "calendar.ics",
  gamesOutputBlobPath: "calendar-games.ics",
  scheduleXFullBlobPath: "schedule-x-full.json",
  scheduleXGamesBlobPath: "schedule-x-games.json",
  statusBlobPath: "status.json",
  internalStatusContainer: "calendarmerge-internal",
  internalStatusBlobPath: "status-internal.json",
  refreshSchedule: "0 */30 * * * *",
  fetchTimeoutMs: 10_000,
  fetchRetryCount: 2,
  fetchRetryDelayMs: 750,
};

function serviceStatus(): ServiceStatus {
  return {
    serviceName: "calendarmerge",
    refreshId: "refresh-1",
    state: "success",
    healthy: true,
    sourceFeedCount: 1,
    mergedEventCount: 1,
    gamesOnlyMergedEventCount: 0,
    calendarPublished: true,
    gamesOnlyCalendarPublished: true,
    servedLastKnownGood: false,
    sourceStatuses: [
      {
        id: "private-feed",
        name: "Private Feed",
        url: "https://example.com/private.ics?token=secret",
        ok: true,
        attemptedAt: "2026-05-06T12:00:00.000Z",
        durationMs: 10,
        eventCount: 1,
      },
    ],
    eventSnapshots: {
      "secret-event": {
        uid: "secret-event",
        summary: "Private appointment",
        sourceId: "private-feed",
        sourceName: "Private Feed",
        startTime: "2026-05-07T13:00:00.000Z",
        location: "Private location",
        capturedAt: "2026-05-06T12:00:00.000Z",
      },
    },
    output: {
      storageAccount: "teststorage",
      container: "$web",
      calendarBlobPath: "calendar.ics",
      gamesCalendarBlobPath: "calendar-games.ics",
      scheduleXFullBlobPath: "schedule-x-full.json",
      scheduleXGamesBlobPath: "schedule-x-games.json",
      statusBlobPath: "status.json",
      blobBaseUrl: "https://teststorage.z13.web.core.windows.net",
      blobCalendarUrl: "https://teststorage.z13.web.core.windows.net/calendar.ics",
      blobGamesCalendarUrl: "https://teststorage.z13.web.core.windows.net/calendar-games.ics",
      blobScheduleXFullUrl: "https://teststorage.z13.web.core.windows.net/schedule-x-full.json",
      blobScheduleXGamesUrl: "https://teststorage.z13.web.core.windows.net/schedule-x-games.json",
      blobStatusUrl: "https://teststorage.z13.web.core.windows.net/status.json",
    },
    errorSummary: [],
  };
}

describe("BlobStore status storage", () => {
  beforeEach(() => {
    storageMock.reset();
  });

  it("writes sanitized public status and full private internal status", async () => {
    const store = new BlobStore(config);

    await store.writeStatus(serviceStatus());

    const publicStatus = storageMock.blobs.get("$web/status.json")?.content ?? "";
    const internalStatus = storageMock.blobs.get("calendarmerge-internal/status-internal.json")?.content ?? "";

    expect(storageMock.createdContainers).toContain("$web");
    expect(storageMock.createdContainers).toContain("calendarmerge-internal");
    expect(publicStatus).not.toContain("sourceStatuses");
    expect(publicStatus).not.toContain("eventSnapshots");
    expect(publicStatus).not.toContain("Private appointment");
    expect(internalStatus).toContain("sourceStatuses");
    expect(internalStatus).toContain("eventSnapshots");
    expect(internalStatus).toContain("Private appointment");
  });

  it("prefers internal status for refresh state", async () => {
    const store = new BlobStore(config);
    await store.writeStatus(serviceStatus());

    const status = await store.readStatusForRefresh();

    expect(status?.sourceStatuses).toHaveLength(1);
    expect(status?.eventSnapshots?.["secret-event"]?.summary).toBe("Private appointment");
  });

  it("falls back to public status and normalizes missing internal arrays", async () => {
    const publicOnlyStatus = {
      serviceName: "calendarmerge",
      state: "success",
      healthy: true,
      sourceFeedCount: 1,
      mergedEventCount: 1,
      gamesOnlyMergedEventCount: 0,
      calendarPublished: true,
      gamesOnlyCalendarPublished: true,
      servedLastKnownGood: false,
      output: serviceStatus().output,
      errorSummary: [],
    };
    storageMock.blobs.set("$web/status.json", {
      content: `${JSON.stringify(publicOnlyStatus)}\n`,
      contentType: "application/json; charset=utf-8",
    });

    const store = new BlobStore(config);
    const status = await store.readStatusForRefresh();

    expect(status?.sourceStatuses).toEqual([]);
    expect(status?.mergedEventCount).toBe(1);
  });
});
