import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfig, ServiceStatus } from "../src/lib/types";
import type { Logger } from "../src/lib/log";

const dedupeMocks = vi.hoisted(() => ({
  filterDueKeys: vi.fn(),
  recordSent: vi.fn(),
}));

vi.mock("../src/lib/alertDedupeStore", () => ({
  AlertDedupeStore: function AlertDedupeStore() {
    return dedupeMocks;
  },
}));

import { collectOperationalAlerts, deliverOperationalAlerts } from "../src/lib/alertDelivery";

const logger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  withContext: vi.fn(() => logger),
  setCategory: vi.fn(() => logger),
};

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    serviceName: "calendarmerge",
    sourceFeeds: [],
    outputStorageAccount: "teststorage",
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
    alertStaleHours: 2,
    alertConsecutiveFailureThreshold: 3,
    alertDedupeCooldownMinutes: 360,
    adminAccessCode: "test-admin-code",
    adminSessionTtlHours: 12,
    adminCookieSecure: false,
    ...overrides,
  };
}

function status(overrides: Partial<ServiceStatus> = {}): ServiceStatus {
  return {
    serviceName: "calendarmerge",
    refreshId: "refresh-1",
    operationalState: "degraded",
    degradationReasons: ["1 feed(s) failed: Sports"],
    state: "partial",
    healthy: true,
    lastAttemptedRefresh: "2026-05-08T01:00:00.000Z",
    lastSuccessfulCheck: {
      fullCalendar: "2026-05-08T00:00:00.000Z",
      gamesCalendar: "2026-05-07T21:00:00.000Z",
    },
    checkAgeHours: {
      fullCalendar: 1,
      gamesCalendar: 4,
    },
    sourceFeedCount: 1,
    mergedEventCount: 10,
    gamesOnlyMergedEventCount: 3,
    calendarPublished: true,
    gamesOnlyCalendarPublished: true,
    servedLastKnownGood: false,
    sourceStatuses: [
      {
        id: "sports",
        name: "Sports",
        ok: false,
        attemptedAt: "2026-05-08T01:00:00.000Z",
        durationMs: 500,
        eventCount: 0,
        error: "HTTP 403",
        consecutiveFailures: 3,
      },
    ],
    feedChangeAlerts: [
      {
        feedId: "sports",
        feedName: "Sports",
        change: "events-to-zero",
        previousCount: 12,
        currentCount: 0,
        percentChange: -100,
        timestamp: "2026-05-08T01:00:00.000Z",
        severity: "warning",
      },
    ],
    rescheduledEvents: [
      {
        uid: "event-1",
        summary: "Game vs Tigers",
        feedId: "sports",
        feedName: "Sports",
        changes: {
          time: {
            from: "2026-05-08T18:00:00.000Z",
            to: "2026-05-08T19:00:00.000Z",
          },
        },
        detectedAt: "2026-05-08T01:00:00.000Z",
      },
    ],
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
    ...overrides,
  };
}

describe("alertDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dedupeMocks.filterDueKeys.mockReset();
    dedupeMocks.recordSent.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
  });

  it("collects configured operational alert triggers", () => {
    const alerts = collectOperationalAlerts(status(), config());

    expect(alerts.map((alert) => alert.kind)).toEqual(expect.arrayContaining([
      "stale-calendar",
      "feed-events-to-zero",
      "repeated-feed-failure",
      "reschedule-detected",
    ]));
    expect(alerts.find((alert) => alert.kind === "repeated-feed-failure")?.severity).toBe("error");
  });

  it("does not deliver when no webhook URL is configured", async () => {
    await deliverOperationalAlerts(status(), config(), logger);

    expect(fetch).not.toHaveBeenCalled();
    expect(dedupeMocks.filterDueKeys).not.toHaveBeenCalled();
  });

  it("posts only due alerts and records sent keys", async () => {
    const alerts = collectOperationalAlerts(status(), config());
    const dueKeys = alerts.slice(0, 2).map((alert) => alert.key);
    dedupeMocks.filterDueKeys.mockResolvedValue(dueKeys);
    dedupeMocks.recordSent.mockResolvedValue(undefined);

    await deliverOperationalAlerts(
      status(),
      config({ alertWebhookUrl: "https://hooks.example.com/calendarmerge" }),
      logger,
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(fetch).mock.calls[0];
    const payload = JSON.parse(String(request?.body));
    expect(payload.refreshId).toBe("refresh-1");
    expect(payload.alerts).toHaveLength(2);
    expect(dedupeMocks.recordSent).toHaveBeenCalledWith(dueKeys);
  });

  it("suppresses alerts when all keys are inside the dedupe cooldown", async () => {
    dedupeMocks.filterDueKeys.mockResolvedValue([]);

    await deliverOperationalAlerts(
      status(),
      config({ alertWebhookUrl: "https://hooks.example.com/calendarmerge" }),
      logger,
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(dedupeMocks.recordSent).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("alerts_suppressed_by_dedupe", expect.any(Object));
  });

  it("does not record sent keys when webhook delivery fails", async () => {
    dedupeMocks.filterDueKeys.mockImplementation(async (keys: string[]) => keys);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));

    await deliverOperationalAlerts(
      status(),
      config({ alertWebhookUrl: "https://hooks.example.com/calendarmerge" }),
      logger,
    );

    expect(dedupeMocks.recordSent).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("alert_webhook_failed", expect.any(Object));
  });
});
