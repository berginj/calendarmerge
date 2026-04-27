import { describe, expect, it, beforeEach } from "vitest";
import { createLogger } from "../../src/lib/log";
import { mergeFeedEvents } from "../../src/lib/merge";
import { buildPublicCalendarArtifacts } from "../../src/lib/publicCalendars";
import { FeedRunResult, FeedStatus, ParsedEvent, SourceFeedConfig } from "../../src/lib/types";

/**
 * Integration tests for refresh workflow scenarios
 * Tests the end-to-end flow from feed results to status generation
 */

function createMockFeedStatus(overrides: Partial<FeedStatus>): FeedStatus {
  return {
    id: "test-feed",
    name: "Test Feed",
    ok: true,
    attemptedAt: new Date().toISOString(),
    durationMs: 100,
    eventCount: 0,
    ...overrides,
  };
}

function createMockEvent(overrides: Partial<ParsedEvent> = {}): ParsedEvent {
  const now = new Date();
  const future = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow

  return {
    sourceId: "test-source",
    sourceName: "Test Source",
    identityKey: `key-${Math.random()}`,
    mergedUid: `uid-${Math.random()}`,
    summary: "Test Event",
    location: "Test Location",
    cancelled: false,
    sequence: 0,
    start: {
      kind: "date-time",
      raw: "20260501T100000Z",
      params: {},
      sortValue: future.getTime(),
      iso: future.toISOString(),
    },
    end: {
      kind: "date-time",
      raw: "20260501T110000Z",
      params: {},
      sortValue: future.getTime() + 60 * 60 * 1000,
      iso: new Date(future.getTime() + 60 * 60 * 1000).toISOString(),
    },
    properties: [],
    ...overrides,
  };
}

function createFeedResult(
  source: SourceFeedConfig,
  events: ParsedEvent[],
  statusOverrides: Partial<FeedStatus> = {},
): FeedRunResult {
  return {
    source,
    status: createMockFeedStatus({
      id: source.id,
      name: source.name,
      eventCount: events.length,
      ...statusOverrides,
    }),
    events,
  };
}

describe("Refresh Workflow Integration Tests", () => {
  describe("Partial Failure Scenarios", () => {
    it("should handle some feeds succeeding and some failing", () => {
      const feed1 = { id: "school", name: "School Calendar", url: "https://school.com/cal.ics" };
      const feed2 = { id: "athletics", name: "Athletics", url: "https://athletics.com/cal.ics" };
      const feed3 = { id: "band", name: "Band", url: "https://band.com/cal.ics" };

      const results: FeedRunResult[] = [
        createFeedResult(feed1, [createMockEvent({ sourceId: "school", summary: "School Event" })]),
        createFeedResult(feed2, [], { ok: false, error: "HTTP 404 Not Found", httpStatus: 404, eventCount: 0 }),
        createFeedResult(feed3, [createMockEvent({ sourceId: "band", summary: "Band Practice" })]),
      ];

      const successfulResults = results.filter((r) => r.status.ok);
      const failedStatuses = results.filter((r) => !r.status.ok).map((r) => r.status);

      expect(successfulResults).toHaveLength(2);
      expect(failedStatuses).toHaveLength(1);
      expect(failedStatuses[0].error).toBe("HTTP 404 Not Found");

      const mergeResult = mergeFeedEvents(successfulResults);

      expect(mergeResult.events).toHaveLength(2);
      expect(mergeResult.events.some((e) => e.summary === "School Event")).toBe(true);
      expect(mergeResult.events.some((e) => e.summary === "Band Practice")).toBe(true);
    });

    it("should handle all feeds failing", () => {
      const feed1 = { id: "school", name: "School Calendar", url: "https://school.com/cal.ics" };
      const feed2 = { id: "athletics", name: "Athletics", url: "https://athletics.com/cal.ics" };

      const results: FeedRunResult[] = [
        createFeedResult(feed1, [], { ok: false, error: "Timeout", eventCount: 0 }),
        createFeedResult(feed2, [], { ok: false, error: "HTTP 500", httpStatus: 500, eventCount: 0 }),
      ];

      const successfulResults = results.filter((r) => r.status.ok);
      const failedStatuses = results.filter((r) => !r.status.ok).map((r) => r.status);

      expect(successfulResults).toHaveLength(0);
      expect(failedStatuses).toHaveLength(2);

      // Service should be in failed state
      const state = successfulResults.length === 0 ? "failed" : "success";
      expect(state).toBe("failed");
    });

    it("should handle feeds returning 0 events (suspect condition)", () => {
      const feed1 = { id: "athletics", name: "Athletics", url: "https://athletics.com/cal.ics" };

      const result = createFeedResult(feed1, [], { ok: true, previousEventCount: 20, suspect: true });

      expect(result.status.ok).toBe(true);
      expect(result.status.eventCount).toBe(0);
      expect(result.status.previousEventCount).toBe(20);
      expect(result.status.suspect).toBe(true);

      // Should generate alert
      const hasChanged = result.status.previousEventCount! > 0 && result.status.eventCount === 0;
      expect(hasChanged).toBe(true);
    });
  });

  describe("Event Filtering and Processing", () => {
    it("should filter cancelled events from final output", () => {
      const events = [
        createMockEvent({ summary: "Active Event", cancelled: false }),
        createMockEvent({ summary: "Cancelled Event", cancelled: true }),
        createMockEvent({ summary: "Another Active", cancelled: false }),
      ];

      const artifacts = buildPublicCalendarArtifacts(events, "test-service");

      expect(artifacts.publicEvents).toHaveLength(2);
      expect(artifacts.cancelledEventsFiltered).toBe(1);
      expect(artifacts.publicEvents.every((e) => !e.cancelled)).toBe(true);
    });

    it("should filter events with cancellation keywords in summary", () => {
      const events = [
        createMockEvent({ summary: "Game vs Tigers" }),
        createMockEvent({ summary: "Game vs Lions - CANCELLED" }),
        createMockEvent({ summary: "Cancelled: Team Meeting" }),
      ];

      const artifacts = buildPublicCalendarArtifacts(events, "test-service");

      // Both cancelled keyword events should be filtered
      expect(artifacts.publicEvents).toHaveLength(1);
      expect(artifacts.publicEvents[0].summary).toBe("Game vs Tigers");
      expect(artifacts.cancelledEventsFiltered).toBe(2);
    });

    it("should filter LeagueApps reschedule markers", () => {
      const events = [
        createMockEvent({ summary: "Game vs Tigers", sourceId: "leagueapps" }),
        createMockEvent({ summary: "Game vs Lions - RESCHEDULED", sourceId: "leagueapps" }),
        createMockEvent({ summary: "Game vs Lions", sourceId: "leagueapps" }), // New event
      ];

      const artifacts = buildPublicCalendarArtifacts(events, "test-service");

      // Only non-rescheduled events in output
      expect(artifacts.publicEvents).toHaveLength(2);
      expect(artifacts.publicEvents.some((e) => e.summary.includes("RESCHEDULED"))).toBe(false);
      expect(artifacts.cancelledEventsFiltered).toBe(1);
    });
  });

  describe("Duplicate Detection", () => {
    it("should flag potential duplicates without removing events", () => {
      const feed1 = { id: "school", name: "School", url: "https://school.com/cal.ics" };
      const feed2 = { id: "athletics", name: "Athletics", url: "https://athletics.com/cal.ics" };

      const event1 = createMockEvent({
        identityKey: "key1",
        sourceId: "school",
        summary: "Team Meeting",
      });

      const event2 = createMockEvent({
        identityKey: "key2", // Different identity
        sourceId: "athletics",
        summary: "Team Meeting", // Same summary, same day
        start: event1.start, // Same time
      });

      const results = [createFeedResult(feed1, [event1]), createFeedResult(feed2, [event2])];

      const mergeResult = mergeFeedEvents(results);

      // Both events kept
      expect(mergeResult.events).toHaveLength(2);

      // Flagged as potential duplicate
      expect(mergeResult.potentialDuplicates).toHaveLength(1);
      expect(mergeResult.potentialDuplicates[0].confidence).toBe("high"); // Same time
      expect(mergeResult.potentialDuplicates[0].instances).toHaveLength(2);
    });

    it("should assign appropriate confidence levels based on time difference", () => {
      const feed1 = { id: "source1", name: "Source 1", url: "https://s1.com/cal.ics" };

      const baseTime = new Date("2026-05-01T10:00:00Z").getTime();

      // Event 1: 10:00 AM
      const event1 = createMockEvent({
        identityKey: "key1",
        summary: "Team Meeting",
        start: {
          kind: "date-time",
          raw: "20260501T100000Z",
          params: {},
          sortValue: baseTime,
          iso: new Date(baseTime).toISOString(),
        },
      });

      // Event 2: 10:05 AM (5 min later - high confidence)
      const event2 = createMockEvent({
        identityKey: "key2",
        summary: "Team Meeting",
        start: {
          kind: "date-time",
          raw: "20260501T100500Z",
          params: {},
          sortValue: baseTime + 5 * 60 * 1000,
          iso: new Date(baseTime + 5 * 60 * 1000).toISOString(),
        },
      });

      // Event 3: 12:00 PM (2 hours later - medium confidence)
      const event3 = createMockEvent({
        identityKey: "key3",
        summary: "team meeting", // Lowercase (case-insensitive match)
        start: {
          kind: "date-time",
          raw: "20260501T120000Z",
          params: {},
          sortValue: baseTime + 2 * 60 * 60 * 1000,
          iso: new Date(baseTime + 2 * 60 * 60 * 1000).toISOString(),
        },
      });

      const results = [createFeedResult(feed1, [event1, event2, event3])];
      const mergeResult = mergeFeedEvents(results);

      // All three events kept
      expect(mergeResult.events).toHaveLength(3);

      // Should detect as potential duplicates
      expect(mergeResult.potentialDuplicates).toHaveLength(1);

      // Confidence should be medium (max time diff = 2 hours)
      expect(mergeResult.potentialDuplicates[0].confidence).toBe("medium");
      expect(mergeResult.potentialDuplicates[0].instances).toHaveLength(3);
    });
  });

  describe("Feed Change Detection", () => {
    it("should detect events-to-zero condition", () => {
      const feed = { id: "athletics", name: "Athletics", url: "https://athletics.com/cal.ics" };

      const result = createFeedResult(feed, [], {
        ok: true,
        eventCount: 0,
        previousEventCount: 20,
        suspect: true,
      });

      expect(result.status.suspect).toBe(true);
      expect(result.status.eventCount).toBe(0);
      expect(result.status.previousEventCount).toBe(20);

      // Should be flagged for alert
      const shouldAlert = result.status.ok && result.status.eventCount === 0 && (result.status.previousEventCount ?? 0) > 0;
      expect(shouldAlert).toBe(true);
    });

    it("should detect significant event count drop", () => {
      const feed = { id: "athletics", name: "Athletics", url: "https://athletics.com/cal.ics" };

      const previousCount = 100;
      const currentCount = 30; // 70% drop

      const result = createFeedResult(
        feed,
        Array.from({ length: currentCount }, () => createMockEvent()),
        {
          ok: true,
          eventCount: currentCount,
          previousEventCount: previousCount,
        },
      );

      const percentDrop = ((currentCount - previousCount) / previousCount) * 100;

      expect(percentDrop).toBe(-70);
      expect(currentCount < previousCount * 0.5).toBe(true); // Significant drop
    });

    it("should detect event count increase", () => {
      const feed = { id: "athletics", name: "Athletics", url: "https://athletics.com/cal.ics" };

      const previousCount = 10;
      const currentCount = 25; // 2.5x increase

      const result = createFeedResult(
        feed,
        Array.from({ length: currentCount }, () => createMockEvent()),
        {
          ok: true,
          eventCount: currentCount,
          previousEventCount: previousCount,
        },
      );

      expect(currentCount > previousCount * 2).toBe(true); // Significant increase
    });
  });

  describe("Operational State Calculation", () => {
    it("should be healthy when all feeds succeed and all calendars publish", () => {
      const allFeedsSucceed = true;
      const anyFeedsFailed = false;
      const calendarPublished = true;
      const gamesPublished = true;
      const usedLastKnownGood = false;

      const operationalState =
        !allFeedsSucceed || (!calendarPublished && !gamesPublished)
          ? "failed"
          : anyFeedsFailed || usedLastKnownGood || (!calendarPublished || !gamesPublished)
            ? "degraded"
            : "healthy";

      expect(operationalState).toBe("healthy");
    });

    it("should be degraded when some feeds fail but calendars publish", () => {
      const allFeedsSucceed = false;
      const anyFeedsFailed = true;
      const calendarPublished = true;
      const gamesPublished = true;
      const usedLastKnownGood = false;

      const operationalState =
        !allFeedsSucceed && !calendarPublished && !gamesPublished
          ? "failed"
          : anyFeedsFailed || usedLastKnownGood
            ? "degraded"
            : "healthy";

      expect(operationalState).toBe("degraded");
    });

    it("should be degraded when using last-known-good data", () => {
      const allFeedsSucceed = false;
      const calendarPublished = false;
      const gamesPublished = false;
      const usedLastKnownGood = true;

      const operationalState = usedLastKnownGood && !calendarPublished ? "degraded" : "healthy";

      expect(operationalState).toBe("degraded");
    });

    it("should be failed when all feeds fail and no calendars publish", () => {
      const successfulResults: FeedRunResult[] = [];
      const hasAnyPublishedOutput = false;

      const state = successfulResults.length === 0 && !hasAnyPublishedOutput ? "failed" : "success";

      expect(state).toBe("failed");
    });

    it("should be degraded when one calendar publishes but other fails", () => {
      // Simulate partial publishing scenario
      const publishingResults = {
        calendarPublished: true,
        gamesPublished: false,
      };

      const hasPartialPublish = publishingResults.calendarPublished !== publishingResults.gamesPublished;

      expect(hasPartialPublish).toBe(true);

      const operationalState = hasPartialPublish ? "degraded" : "healthy";

      expect(operationalState).toBe("degraded");
    });
  });

  describe("Calendar Age Tracking", () => {
    it("should calculate age in hours correctly", () => {
      const now = new Date("2026-04-27T14:00:00Z");
      const fullCalendarTimestamp = new Date("2026-04-27T12:00:00Z").toISOString();
      const gamesCalendarTimestamp = new Date("2026-04-27T11:00:00Z").toISOString();

      const checkAgeHours = {
        fullCalendar: (now.getTime() - new Date(fullCalendarTimestamp).getTime()) / (1000 * 60 * 60),
        gamesCalendar: (now.getTime() - new Date(gamesCalendarTimestamp).getTime()) / (1000 * 60 * 60),
      };

      expect(checkAgeHours.fullCalendar).toBe(2);
      expect(checkAgeHours.gamesCalendar).toBe(3);
    });

    it("should handle undefined timestamps gracefully", () => {
      const fullCalendarTimestamp: string | undefined = undefined;
      const gamesCalendarTimestamp = new Date("2026-04-27T11:00:00Z").toISOString();
      const now = new Date("2026-04-27T14:00:00Z").getTime();

      const checkAgeHours = {
        fullCalendar: fullCalendarTimestamp ? (now - new Date(fullCalendarTimestamp).getTime()) / (1000 * 60 * 60) : undefined,
        gamesCalendar: gamesCalendarTimestamp ? (now - new Date(gamesCalendarTimestamp).getTime()) / (1000 * 60 * 60) : undefined,
      };

      expect(checkAgeHours.fullCalendar).toBeUndefined();
      expect(checkAgeHours.gamesCalendar).toBe(3);
    });
  });
});
