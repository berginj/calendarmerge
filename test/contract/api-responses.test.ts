import { describe, expect, it } from "vitest";

import {
  createErrorResponse,
  createPartialSuccessResponse,
  createSuccessResponse,
  ERROR_CODES,
  toHttpResponse,
} from "../../src/lib/api-types";
import { buildAdminStatus, buildPublicStatus } from "../../src/lib/status";
import type { OutputPaths, ServiceStatus } from "../../src/lib/types";

const output: OutputPaths = {
  storageAccount: "calendarmergeprod01",
  container: "$web",
  calendarBlobPath: "calendar.ics",
  gamesCalendarBlobPath: "calendar-games.ics",
  scheduleXFullBlobPath: "schedule-x-full.json",
  scheduleXGamesBlobPath: "schedule-x-games.json",
  statusBlobPath: "status.json",
  blobBaseUrl: "https://calendarmergeprod01.z13.web.core.windows.net",
  blobCalendarUrl: "https://calendarmergeprod01.z13.web.core.windows.net/calendar.ics",
  blobGamesCalendarUrl: "https://calendarmergeprod01.z13.web.core.windows.net/calendar-games.ics",
  blobScheduleXFullUrl: "https://calendarmergeprod01.z13.web.core.windows.net/schedule-x-full.json",
  blobScheduleXGamesUrl: "https://calendarmergeprod01.z13.web.core.windows.net/schedule-x-games.json",
  blobStatusUrl: "https://calendarmergeprod01.z13.web.core.windows.net/status.json",
};

function serviceStatus(): ServiceStatus {
  return {
    serviceName: "calendarmerge",
    refreshId: "refresh-1",
    operationalState: "degraded",
    degradationReasons: ["1 feed(s) failed: Private Feed"],
    state: "partial",
    healthy: true,
    lastAttemptedRefresh: "2026-05-06T00:00:00.000Z",
    lastSuccessfulRefresh: "2026-05-06T00:00:00.000Z",
    lastSuccessfulCheck: {
      fullCalendar: "2026-05-06T00:00:00.000Z",
      gamesCalendar: "2026-05-06T00:00:00.000Z",
      combined: "2026-05-06T00:00:00.000Z",
    },
    checkAgeHours: {
      fullCalendar: 0,
      gamesCalendar: 0,
    },
    sourceFeedCount: 1,
    mergedEventCount: 10,
    gamesOnlyMergedEventCount: 2,
    calendarPublished: true,
    gamesOnlyCalendarPublished: true,
    servedLastKnownGood: false,
    sourceStatuses: [
      {
        id: "private-feed",
        name: "Private Feed",
        url: "https://calendar.example/private/basic.ics?token=secret",
        ok: false,
        attemptedAt: "2026-05-06T00:00:00.000Z",
        durationMs: 1250,
        eventCount: 0,
        httpStatus: 403,
        error: "Forbidden",
        previousEventCount: 10,
        suspect: true,
        consecutiveFailures: 3,
      },
    ],
    feedChangeAlerts: [
      {
        feedId: "private-feed",
        feedName: "Private Feed",
        change: "events-to-zero",
        previousCount: 10,
        currentCount: 0,
        percentChange: -100,
        timestamp: "2026-05-06T00:00:00.000Z",
        severity: "error",
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
    cancelledEventsFiltered: 4,
    eventSnapshots: {
      "event-1": {
        uid: "event-1",
        summary: "Private appointment",
        sourceId: "private-feed",
        sourceName: "Private Feed",
        startTime: "2026-05-06T13:00:00.000Z",
        location: "Private location",
        capturedAt: "2026-05-06T00:00:00.000Z",
      },
    },
    output,
    errorSummary: ["Private Feed: Forbidden"],
  };
}

function expectSuccessEnvelope(body: unknown): asserts body is { requestId: string; status: string; data: unknown } {
  expect(body).toEqual(expect.objectContaining({
    requestId: expect.any(String),
    status: "success",
    data: expect.any(Object),
  }));
}

describe("API response contracts", () => {
  it("uses the standard success envelope", () => {
    const response = createSuccessResponse("request-1", { ok: true }, "Done", { refreshId: "refresh-1" });

    expect(response).toEqual({
      requestId: "request-1",
      status: "success",
      data: { ok: true },
      message: "Done",
      metadata: { refreshId: "refresh-1" },
    });
  });

  it("uses the standard partial-success envelope", () => {
    const response = createPartialSuccessResponse(
      "request-1",
      { refreshId: "refresh-1" },
      ["one feed failed"],
      "Refresh completed with warnings",
    );

    expect(response).toEqual({
      requestId: "request-1",
      status: "partial-success",
      data: { refreshId: "refresh-1" },
      warnings: ["one feed failed"],
      message: "Refresh completed with warnings",
      metadata: undefined,
    });
  });

  it("uses the standard error envelope and status mapping", () => {
    const error = createErrorResponse(
      "request-1",
      ERROR_CODES.VALIDATION_ERROR,
      "Validation failed",
      "Feed URL is required",
      { url: ["Feed URL is required"] },
    );

    expect(error).toEqual({
      requestId: "request-1",
      status: "error",
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: "Feed URL is required",
        validationErrors: { url: ["Feed URL is required"] },
      },
    });
    expect(toHttpResponse(error).status).toBe(400);
    expect(toHttpResponse(createErrorResponse("request-2", ERROR_CODES.SERVICE_UNAVAILABLE, "Refresh failed")).status).toBe(503);
  });

  it("keeps public status public-safe", () => {
    const publicStatus = buildPublicStatus(serviceStatus());
    const serialized = JSON.stringify(publicStatus);

    expect(publicStatus).toEqual(expect.objectContaining({
      serviceName: "calendarmerge",
      refreshId: "refresh-1",
      operationalState: "degraded",
      sourceFeedCount: 1,
      mergedEventCount: 10,
      gamesOnlyMergedEventCount: 2,
      calendarPublished: true,
      gamesOnlyCalendarPublished: true,
      cancelledEventsFiltered: 4,
      output,
      errorSummary: ["Private Feed: Forbidden"],
    }));
    expect(publicStatus).not.toHaveProperty("sourceStatuses");
    expect(publicStatus).not.toHaveProperty("feedChangeAlerts");
    expect(publicStatus).not.toHaveProperty("suspectFeeds");
    expect(publicStatus).not.toHaveProperty("potentialDuplicates");
    expect(publicStatus).not.toHaveProperty("rescheduledEvents");
    expect(publicStatus).not.toHaveProperty("eventSnapshots");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("Private appointment");
  });

  it("keeps protected admin status diagnostic but sanitized", () => {
    const adminEnvelope = createSuccessResponse("request-1", { status: buildAdminStatus(serviceStatus()) });

    expectSuccessEnvelope(adminEnvelope);
    expect(adminEnvelope.data.status.sourceStatuses).toHaveLength(1);
    expect(adminEnvelope.data.status.sourceStatuses[0]).toEqual(expect.objectContaining({
      id: "private-feed",
      url: "https://calendar.example/[redacted]",
      consecutiveFailures: 3,
    }));
    expect(adminEnvelope.data.status.feedChangeAlerts).toHaveLength(1);
    expect(adminEnvelope.data.status.suspectFeeds).toEqual(["private-feed"]);
    expect(adminEnvelope.data.status.potentialDuplicates).toHaveLength(1);
    expect(adminEnvelope.data.status.rescheduledEvents).toHaveLength(1);
    expect(adminEnvelope.data.status).not.toHaveProperty("eventSnapshots");
    expect(JSON.stringify(adminEnvelope)).not.toContain("token=secret");
    expect(JSON.stringify(adminEnvelope)).not.toContain("private/basic.ics");
  });

  it("documents manual refresh response data shape", () => {
    const response = createPartialSuccessResponse(
      "request-1",
      {
        refreshId: "refresh-1",
        success: true,
        partialFailure: true,
        operationalState: "degraded",
        degradationReasons: ["one feed failed"],
        eventCount: 10,
        gamesOnlyEventCount: 2,
        candidateEventCount: 12,
        sourceStatuses: buildAdminStatus(serviceStatus()).sourceStatuses,
        feedChangeAlerts: serviceStatus().feedChangeAlerts,
        suspectFeeds: serviceStatus().suspectFeeds,
        potentialDuplicates: serviceStatus().potentialDuplicates,
        rescheduledEvents: serviceStatus().rescheduledEvents,
        cancelledEventsFiltered: 4,
        output,
        servedLastKnownGood: false,
        calendarPublished: true,
        gamesOnlyCalendarPublished: true,
        lastAttemptedRefresh: "2026-05-06T00:00:00.000Z",
        lastSuccessfulRefresh: "2026-05-06T00:00:00.000Z",
        lastSuccessfulCheck: serviceStatus().lastSuccessfulCheck,
        checkAgeHours: serviceStatus().checkAgeHours,
        errorSummary: ["one feed failed"],
        state: "partial",
        healthy: true,
      },
      ["one feed failed"],
    );

    expect(response.status).toBe("partial-success");
    expect(response.data).toEqual(expect.objectContaining({
      refreshId: "refresh-1",
      operationalState: "degraded",
      eventCount: 10,
      gamesOnlyEventCount: 2,
      sourceStatuses: expect.any(Array),
      output,
      state: "partial",
      healthy: true,
    }));
  });

  it("documents feed and settings response data shapes", () => {
    const feed = {
      id: "school",
      name: "School Calendar",
      url: "https://example.com/feed.ics?token=secret",
      enabled: true,
    };

    expect(createSuccessResponse("request-1", { feeds: [feed], count: 1 }).data).toEqual({
      feeds: [feed],
      count: 1,
    });
    expect(createSuccessResponse("request-2", { feed }, "Feed created successfully").data).toEqual({ feed });
    expect(createSuccessResponse("request-3", {
      feed,
      validated: true,
      validationDetails: { eventCount: 12, detectedPlatform: "generic" },
      refreshTriggered: true,
    }).data).toEqual(expect.objectContaining({
      feed,
      validated: true,
      refreshTriggered: true,
    }));
    expect(createSuccessResponse("request-4", { feedId: "school" }).data).toEqual({ feedId: "school" });
    expect(createSuccessResponse("request-5", {
      settings: {
        refreshSchedule: "hourly",
        lastUpdated: "2026-05-06T00:00:00.000Z",
      },
    }).data).toEqual({
      settings: {
        refreshSchedule: "hourly",
        lastUpdated: "2026-05-06T00:00:00.000Z",
      },
    });
  });
});
