import { describe, expect, it } from "vitest";

import { buildPublicStatus } from "../src/lib/status";
import type { ServiceStatus } from "../src/lib/types";

describe("public status", () => {
  it("omits internal feed and event diagnostics from the public status payload", () => {
    const status: ServiceStatus = {
      serviceName: "calendarmerge",
      refreshId: "refresh-1",
      operationalState: "degraded",
      degradationReasons: ["1 event(s) rescheduled (time or location changed)"],
      state: "success",
      healthy: true,
      lastAttemptedRefresh: "2026-05-06T12:00:00.000Z",
      lastSuccessfulRefresh: "2026-05-06T12:00:00.000Z",
      lastSuccessfulCheck: {
        fullCalendar: "2026-05-06T12:00:00.000Z",
        gamesCalendar: "2026-05-06T12:00:00.000Z",
      },
      checkAgeHours: {
        fullCalendar: 0,
        gamesCalendar: 0,
      },
      sourceFeedCount: 1,
      mergedEventCount: 10,
      gamesOnlyMergedEventCount: 2,
      candidateMergedEventCount: 11,
      calendarPublished: true,
      gamesOnlyCalendarPublished: true,
      servedLastKnownGood: false,
      sourceStatuses: [
        {
          id: "private-feed",
          name: "Private Feed",
          url: "https://calendar.example/[redacted]",
          ok: true,
          attemptedAt: "2026-05-06T12:00:00.000Z",
          durationMs: 100,
          eventCount: 11,
        },
      ],
      feedChangeAlerts: [
        {
          feedId: "private-feed",
          feedName: "Private Feed",
          change: "significant-drop",
          previousCount: 100,
          currentCount: 11,
          percentChange: -89,
          timestamp: "2026-05-06T12:00:00.000Z",
          severity: "warning",
        },
      ],
      suspectFeeds: ["private-feed"],
      potentialDuplicates: [
        {
          summary: "Private appointment",
          date: "2026-05-07",
          confidence: "high",
          instances: [
            {
              feedId: "private-feed",
              feedName: "Private Feed",
              time: "2026-05-07T13:00:00.000Z",
              location: "Private location",
              uid: "secret-event",
            },
          ],
        },
      ],
      rescheduledEvents: [
        {
          uid: "secret-event",
          summary: "Private appointment",
          feedId: "private-feed",
          feedName: "Private Feed",
          changes: {
            location: { from: "Old private location", to: "New private location" },
          },
          detectedAt: "2026-05-06T12:00:00.000Z",
        },
      ],
      cancelledEventsFiltered: 3,
      eventSnapshots: {
        "secret-event": {
          uid: "secret-event",
          summary: "Private appointment",
          sourceId: "private-feed",
          sourceName: "Private Feed",
          startTime: "2026-05-07T13:00:00.000Z",
          endTime: "2026-05-07T14:00:00.000Z",
          location: "Private location",
          capturedAt: "2026-05-06T12:00:00.000Z",
        },
      },
      output: {
        storageAccount: "calendarmerge",
        container: "$web",
        calendarBlobPath: "calendar.ics",
        gamesCalendarBlobPath: "calendar-games.ics",
        scheduleXFullBlobPath: "schedule-x-full.json",
        scheduleXGamesBlobPath: "schedule-x-games.json",
        statusBlobPath: "status.json",
        blobBaseUrl: "https://example.com",
        blobCalendarUrl: "https://example.com/calendar.ics",
        blobGamesCalendarUrl: "https://example.com/calendar-games.ics",
        blobScheduleXFullUrl: "https://example.com/schedule-x-full.json",
        blobScheduleXGamesUrl: "https://example.com/schedule-x-games.json",
        blobStatusUrl: "https://example.com/status.json",
      },
      errorSummary: [],
    };

    const publicStatus = buildPublicStatus(status);
    const serialized = JSON.stringify(publicStatus);

    expect(publicStatus).toMatchObject({
      serviceName: "calendarmerge",
      sourceFeedCount: 1,
      mergedEventCount: 10,
      gamesOnlyMergedEventCount: 2,
      calendarPublished: true,
      gamesOnlyCalendarPublished: true,
      cancelledEventsFiltered: 3,
    });
    expect(publicStatus).not.toHaveProperty("sourceStatuses");
    expect(publicStatus).not.toHaveProperty("feedChangeAlerts");
    expect(publicStatus).not.toHaveProperty("suspectFeeds");
    expect(publicStatus).not.toHaveProperty("potentialDuplicates");
    expect(publicStatus).not.toHaveProperty("rescheduledEvents");
    expect(publicStatus).not.toHaveProperty("eventSnapshots");
    expect(serialized).not.toContain("Private appointment");
    expect(serialized).not.toContain("Private location");
    expect(serialized).not.toContain("secret-event");
  });
});
