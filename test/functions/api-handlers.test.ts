import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";

const azureMocks = vi.hoisted(() => ({
  http: vi.fn(),
  timer: vi.fn(),
}));

const tableMocks = vi.hoisted(() => ({
  store: {
    getFeed: vi.fn(),
    createFeed: vi.fn(),
    updateFeed: vi.fn(),
    softDeleteFeed: vi.fn(),
  },
  generateFeedId: vi.fn(),
}));

const settingsMocks = vi.hoisted(() => ({
  store: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

const refreshMocks = vi.hoisted(() => ({
  runRefresh: vi.fn(),
}));

const blobMocks = vi.hoisted(() => ({
  store: {
    readStatusForRefresh: vi.fn(),
  },
}));

vi.mock("@azure/functions", () => ({
  app: {
    http: azureMocks.http,
    timer: azureMocks.timer,
  },
}));

vi.mock("../../src/lib/tableStore", () => {
  function TableStore() {
    return tableMocks.store;
  }
  Object.assign(TableStore, { generateFeedId: tableMocks.generateFeedId });
  return { TableStore };
});

vi.mock("../../src/lib/settingsStore", () => ({
  SettingsStore: function SettingsStore() {
    return settingsMocks.store;
  },
}));

vi.mock("../../src/lib/refresh", () => ({
  runRefresh: refreshMocks.runRefresh,
  loadCurrentStatus: vi.fn(),
}));

vi.mock("../../src/lib/blobStore", () => ({
  BlobStore: function BlobStore() {
    return blobMocks.store;
  },
}));

import { adminStatusHandler } from "../../src/functions/adminStatus";
import { clearConfigCache } from "../../src/lib/config";
import { createFeedHandler } from "../../src/functions/feedCreate";
import { deleteFeedHandler } from "../../src/functions/feedDelete";
import { listFeedsHandler } from "../../src/functions/feedsList";
import { listFeedsSimpleHandler } from "../../src/functions/feedsSimple";
import { manualRefreshHandler, resetManualRefreshCooldownForTest } from "../../src/functions/manualRefresh";
import { getSettingsHandler } from "../../src/functions/settingsGet";
import { updateSettingsHandler } from "../../src/functions/settingsUpdate";
import { updateFeedHandler } from "../../src/functions/feedUpdate";

const originalEnv = { ...process.env };
const context = { log: vi.fn() } as unknown as InvocationContext & { log: ReturnType<typeof vi.fn> };

function request(body: unknown = undefined, params: Record<string, string> = {}): HttpRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
    params,
  } as unknown as HttpRequest;
}

function refreshResult(state: "success" | "partial" | "failed") {
  return {
    status: {
      refreshId: "refresh-1",
      state,
      operationalState: state === "failed" ? "failed" : "healthy",
      degradationReasons: state === "partial" ? ["one feed failed"] : undefined,
      mergedEventCount: state === "failed" ? 0 : 3,
      gamesOnlyMergedEventCount: state === "failed" ? 0 : 1,
      candidateMergedEventCount: undefined,
      sourceStatuses: [],
      feedChangeAlerts: undefined,
      suspectFeeds: undefined,
      potentialDuplicates: undefined,
      rescheduledEvents: undefined,
      cancelledEventsFiltered: undefined,
      output: {},
      servedLastKnownGood: false,
      calendarPublished: state !== "failed",
      gamesOnlyCalendarPublished: state !== "failed",
      lastAttemptedRefresh: "2026-05-06T00:00:00.000Z",
      lastSuccessfulRefresh: state === "failed" ? undefined : "2026-05-06T00:00:00.000Z",
      lastSuccessfulCheck: {},
      checkAgeHours: {},
      errorSummary: state === "failed" ? ["all feeds failed"] : [],
      healthy: state !== "failed",
    },
    candidateEventCount: state === "failed" ? 0 : 3,
    calendarPublished: state !== "failed",
    usedLastKnownGood: false,
  };
}

describe("HTTP API handlers", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SOURCE_FEEDS_JSON: '[{"id":"json-feed","name":"JSON Feed","url":"https://example.com/cal.ics?token=secret"}]',
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
    };
    clearConfigCache();
    resetManualRefreshCooldownForTest();
    context.log.mockClear();

    tableMocks.store.getFeed.mockReset();
    tableMocks.store.createFeed.mockReset();
    tableMocks.store.updateFeed.mockReset();
    tableMocks.store.softDeleteFeed.mockReset();
    tableMocks.generateFeedId.mockReset().mockReturnValue("generated-feed");

    settingsMocks.store.getSettings.mockReset();
    settingsMocks.store.updateSettings.mockReset();
    refreshMocks.runRefresh.mockReset();
    blobMocks.store.readStatusForRefresh.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
  });

  it("registers feeds-simple as protected instead of anonymous", () => {
    expect(azureMocks.http).toHaveBeenCalledWith("listFeedsSimple", expect.objectContaining({
      authLevel: "function",
      route: "feeds-simple",
    }));
  });

  it("registers admin status as protected", () => {
    expect(azureMocks.http).toHaveBeenCalledWith("adminStatus", expect.objectContaining({
      authLevel: "function",
      route: "status/internal",
    }));
  });

  it("redacts feed URLs from the simplified diagnostic feed endpoint", async () => {
    const response = await listFeedsSimpleHandler(request(), context);

    expect(response.status).toBe(200);
    expect(response.jsonBody.status).toBe("success");
    expect(response.jsonBody.data.feeds[0].url).toBe("https://example.com/[redacted]");
    expect(JSON.stringify(response.jsonBody)).not.toContain("cal.ics");
    expect(JSON.stringify(response.jsonBody)).not.toContain("token=secret");
    expect(JSON.stringify(response.jsonBody)).not.toContain("stack");
  });

  it("returns the standard envelope when listing authenticated feeds", async () => {
    const response = await listFeedsHandler(request(), context);

    expect(response.status).toBe(200);
    expect(response.jsonBody.status).toBe("success");
    expect(response.jsonBody.data.count).toBe(1);
    expect(response.jsonBody.data.feeds[0].url).toContain("token=secret");
  });

  it("returns sanitized admin status diagnostics from internal status", async () => {
    blobMocks.store.readStatusForRefresh.mockResolvedValue({
      serviceName: "calendarmerge",
      refreshId: "refresh-1",
      operationalState: "degraded",
      degradationReasons: ["1 feed(s) failed: Private Feed"],
      state: "partial",
      healthy: true,
      lastAttemptedRefresh: "2026-05-06T00:00:00.000Z",
      lastSuccessfulRefresh: "2026-05-06T00:00:00.000Z",
      lastSuccessfulCheck: {},
      checkAgeHours: {},
      sourceFeedCount: 1,
      mergedEventCount: 3,
      gamesOnlyMergedEventCount: 1,
      calendarPublished: true,
      gamesOnlyCalendarPublished: true,
      servedLastKnownGood: false,
      sourceStatuses: [
        {
          id: "private-feed",
          name: "Private Feed",
          url: "https://calendar.example/private/basic.ics?token=secret",
          ok: true,
          attemptedAt: "2026-05-06T00:00:00.000Z",
          durationMs: 10,
          eventCount: 3,
        },
      ],
      feedChangeAlerts: [
        {
          feedId: "private-feed",
          feedName: "Private Feed",
          change: "significant-drop",
          previousCount: 10,
          currentCount: 3,
          percentChange: -70,
          timestamp: "2026-05-06T00:00:00.000Z",
          severity: "warning",
        },
      ],
      suspectFeeds: ["private-feed"],
      potentialDuplicates: [
        {
          summary: "Practice",
          date: "2026-05-06",
          confidence: "high",
          instances: [
            {
              feedId: "private-feed",
              feedName: "Private Feed",
              time: "2026-05-06T12:00:00.000Z",
              location: "Field 1",
              uid: "event-1",
            },
          ],
        },
      ],
      rescheduledEvents: [
        {
          uid: "event-1",
          summary: "Practice",
          feedId: "private-feed",
          feedName: "Private Feed",
          changes: {
            time: {
              from: "2026-05-06T12:00:00.000Z",
              to: "2026-05-06T13:00:00.000Z",
            },
          },
          detectedAt: "2026-05-06T00:00:00.000Z",
        },
      ],
      cancelledEventsFiltered: 2,
      eventSnapshots: {
        "event-1": {
          uid: "event-1",
          summary: "Practice",
          sourceId: "private-feed",
          sourceName: "Private Feed",
          startTime: "2026-05-06T13:00:00.000Z",
          location: "Field 1",
          capturedAt: "2026-05-06T00:00:00.000Z",
        },
      },
      output: {},
      errorSummary: [],
    });

    const response = await adminStatusHandler(request(), context);
    const serialized = JSON.stringify(response.jsonBody);

    expect(response.status).toBe(200);
    expect(response.jsonBody.status).toBe("success");
    expect(response.jsonBody.data.status.sourceStatuses).toHaveLength(1);
    expect(response.jsonBody.data.status.sourceStatuses[0].url).toBe("https://calendar.example/[redacted]");
    expect(response.jsonBody.data.status.feedChangeAlerts).toHaveLength(1);
    expect(response.jsonBody.data.status.potentialDuplicates).toHaveLength(1);
    expect(response.jsonBody.data.status.rescheduledEvents).toHaveLength(1);
    expect(response.jsonBody.data.status).not.toHaveProperty("eventSnapshots");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("private/basic.ics");
  });

  it("returns starting admin status when no stored status exists", async () => {
    blobMocks.store.readStatusForRefresh.mockResolvedValue(null);

    const response = await adminStatusHandler(request(), context);

    expect(response.status).toBe(200);
    expect(response.jsonBody.status).toBe("success");
    expect(response.jsonBody.data.status.serviceName).toBe("calendarmerge");
    expect(response.jsonBody.data.status.sourceStatuses).toEqual([]);
    expect(response.jsonBody.data.status).not.toHaveProperty("eventSnapshots");
  });

  it("creates feeds through the standard response envelope", async () => {
    tableMocks.store.getFeed.mockResolvedValue(null);
    tableMocks.store.createFeed.mockImplementation(async (feed) => ({
      ...feed,
      createdAt: "2026-05-06T00:00:00.000Z",
      updatedAt: "2026-05-06T00:00:00.000Z",
    }));

    const response = await createFeedHandler(request({
      name: "School",
      url: "https://example.com/school.ics?token=abc",
    }), context);

    expect(response.status).toBe(201);
    expect(response.jsonBody.status).toBe("success");
    expect(response.jsonBody.data.feed.id).toBe("generated-feed");
    expect(response.jsonBody.data.feed.url).toContain("token=abc");
  });

  it("rejects oversized custom feed IDs", async () => {
    const response = await createFeedHandler(request({
      id: "a".repeat(256),
      name: "School",
      url: "https://example.com/school.ics",
    }), context);

    expect(response.status).toBe(400);
    expect(response.jsonBody.status).toBe("error");
    expect(response.jsonBody.error.details).toContain("255 characters or fewer");
    expect(tableMocks.store.getFeed).not.toHaveBeenCalled();
    expect(tableMocks.store.createFeed).not.toHaveBeenCalled();
  });

  it("preserves tokenized URLs on name-only feed updates", async () => {
    const existing = {
      partitionKey: "default",
      rowKey: "school",
      id: "school",
      name: "Old School",
      url: "https://example.com/school.ics?token=abc",
      enabled: true,
      createdAt: "2026-05-06T00:00:00.000Z",
      updatedAt: "2026-05-06T00:00:00.000Z",
    };
    tableMocks.store.getFeed.mockResolvedValue(existing);
    tableMocks.store.updateFeed.mockImplementation(async (_feedId, updates) => ({
      ...existing,
      ...updates,
    }));

    const response = await updateFeedHandler(request({ name: "New School" }, { feedId: "school" }), context);

    expect(response.status).toBe(200);
    expect(tableMocks.store.updateFeed).toHaveBeenCalledWith("school", { name: "New School" });
    expect(response.jsonBody.data.feed.url).toBe(existing.url);
  });

  it("soft-deletes feeds through the standard response envelope", async () => {
    tableMocks.store.getFeed.mockResolvedValue({
      partitionKey: "default",
      rowKey: "school",
      id: "school",
      name: "School",
      url: "https://example.com/school.ics",
      enabled: true,
      createdAt: "2026-05-06T00:00:00.000Z",
      updatedAt: "2026-05-06T00:00:00.000Z",
    });
    tableMocks.store.softDeleteFeed.mockResolvedValue(undefined);

    const response = await deleteFeedHandler(request(undefined, { feedId: "school" }), context);

    expect(response.status).toBe(200);
    expect(response.jsonBody.status).toBe("success");
    expect(response.jsonBody.data.feedId).toBe("school");
  });

  it("gets and updates settings through the standard response envelope", async () => {
    settingsMocks.store.getSettings.mockResolvedValue({
      refreshSchedule: "hourly",
      lastUpdated: "2026-05-06T00:00:00.000Z",
    });
    settingsMocks.store.updateSettings.mockResolvedValue({
      refreshSchedule: "manual-only",
      lastUpdated: "2026-05-06T00:01:00.000Z",
    });

    const getResponse = await getSettingsHandler(request(), context);
    const updateResponse = await updateSettingsHandler(request({ refreshSchedule: "manual-only" }), context);

    expect(getResponse.jsonBody.status).toBe("success");
    expect(getResponse.jsonBody.data.settings.refreshSchedule).toBe("hourly");
    expect(updateResponse.jsonBody.status).toBe("success");
    expect(updateResponse.jsonBody.data.settings.refreshSchedule).toBe("manual-only");
  });

  it("rate limits manual refresh only after a non-failed refresh result", async () => {
    refreshMocks.runRefresh
      .mockResolvedValueOnce(refreshResult("failed"))
      .mockResolvedValueOnce(refreshResult("success"))
      .mockResolvedValueOnce(refreshResult("success"));

    const failed = await manualRefreshHandler(request(), context);
    const retry = await manualRefreshHandler(request(), context);
    const rateLimited = await manualRefreshHandler(request(), context);

    expect(failed.status).toBe(502);
    expect(retry.status).toBe(200);
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.jsonBody.status).toBe("error");
    expect(refreshMocks.runRefresh).toHaveBeenCalledTimes(2);
  });
});
