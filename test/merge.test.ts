import { describe, it, expect } from "vitest";
import { mergeFeedEvents } from "../src/lib/merge";
import { FeedRunResult, ParsedEvent } from "../src/lib/types";

function createMockEvent(overrides: Partial<ParsedEvent>): ParsedEvent {
  return {
    sourceId: "test-source",
    sourceName: "Test Source",
    identityKey: "unique-key",
    mergedUid: "merged-uid",
    summary: "Test Event",
    location: "",
    cancelled: false,
    sequence: 0,
    start: {
      kind: "date-time",
      raw: "20240101T100000",
      params: {},
      sortValue: 1704103200000,
      iso: "2024-01-01T10:00:00.000Z",
    },
    end: {
      kind: "date-time",
      raw: "20240101T110000",
      params: {},
      sortValue: 1704106800000,
      iso: "2024-01-01T11:00:00.000Z",
    },
    properties: [],
    ...overrides,
  };
}

function createMockFeedResult(events: ParsedEvent[]): FeedRunResult {
  return {
    source: { id: "test", name: "Test", url: "https://test.com/cal.ics" },
    status: {
      id: "test",
      name: "Test",
      url: "https://test.com/cal.ics",
      ok: true,
      attemptedAt: new Date().toISOString(),
      durationMs: 100,
      eventCount: events.length,
    },
    events,
  };
}

describe("mergeFeedEvents - Duplicate Detection", () => {
  it("should NOT remove duplicate events with same summary on same day, but flag them", () => {
    const event1 = createMockEvent({
      identityKey: "key1",
      summary: "Team Meeting",
      start: {
        kind: "date-time",
        raw: "20240101T100000",
        params: {},
        sortValue: 1704103200000,
        iso: "2024-01-01T10:00:00.000Z",
      },
    });

    const event2 = createMockEvent({
      identityKey: "key2", // Different identity key
      summary: "Team Meeting", // Same summary
      start: {
        kind: "date-time",
        raw: "20240101T140000", // Different time, same day
        params: {},
        sortValue: 1704117600000,
        iso: "2024-01-01T14:00:00.000Z",
      },
    });

    const results = [createMockFeedResult([event1, event2])];
    const result = mergeFeedEvents(results);

    // Both events should be kept
    expect(result.events).toHaveLength(2);
    expect(result.events[0].summary).toBe("Team Meeting");
    expect(result.events[1].summary).toBe("Team Meeting");

    // Should be flagged as potential duplicate
    expect(result.potentialDuplicates).toHaveLength(1);
    expect(result.potentialDuplicates[0].summary).toBe("Team Meeting");
    expect(result.potentialDuplicates[0].date).toBe("2024-01-01");
    expect(result.potentialDuplicates[0].instances).toHaveLength(2);
  });

  it("should keep events with same summary on different days without flagging as duplicates", () => {
    const event1 = createMockEvent({
      identityKey: "key1",
      summary: "Daily Standup",
      start: {
        kind: "date-time",
        raw: "20240101T100000",
        params: {},
        sortValue: 1704103200000,
        iso: "2024-01-01T10:00:00.000Z",
      },
    });

    const event2 = createMockEvent({
      identityKey: "key2",
      summary: "Daily Standup",
      start: {
        kind: "date-time",
        raw: "20240102T100000", // Next day
        params: {},
        sortValue: 1704189600000,
        iso: "2024-01-02T10:00:00.000Z",
      },
    });

    const results = [createMockFeedResult([event1, event2])];
    const result = mergeFeedEvents(results);

    expect(result.events).toHaveLength(2);
    // Should NOT be flagged as duplicates (different days)
    expect(result.potentialDuplicates).toHaveLength(0);
  });

  it("should be case-insensitive when detecting potential duplicates", () => {
    const event1 = createMockEvent({
      identityKey: "key1",
      summary: "Team Meeting",
      start: {
        kind: "date-time",
        raw: "20240101T100000",
        params: {},
        sortValue: 1704103200000,
        iso: "2024-01-01T10:00:00.000Z",
      },
    });

    const event2 = createMockEvent({
      identityKey: "key2",
      summary: "TEAM MEETING", // Different case
      start: {
        kind: "date-time",
        raw: "20240101T140000",
        params: {},
        sortValue: 1704117600000,
        iso: "2024-01-01T14:00:00.000Z",
      },
    });

    const results = [createMockFeedResult([event1, event2])];
    const result = mergeFeedEvents(results);

    // Both events kept
    expect(result.events).toHaveLength(2);
    // Flagged as potential duplicate (case-insensitive)
    expect(result.potentialDuplicates).toHaveLength(1);
    expect(result.potentialDuplicates[0].instances).toHaveLength(2);
  });

  it("should keep both cancelled and active events, but flag as potential duplicates", () => {
    const cancelledEvent = createMockEvent({
      identityKey: "key1",
      summary: "Team Meeting",
      cancelled: true,
      start: {
        kind: "date-time",
        raw: "20240101T100000",
        params: {},
        sortValue: 1704103200000,
        iso: "2024-01-01T10:00:00.000Z",
      },
    });

    const activeEvent = createMockEvent({
      identityKey: "key2",
      summary: "Team Meeting",
      cancelled: false,
      start: {
        kind: "date-time",
        raw: "20240101T140000",
        params: {},
        sortValue: 1704117600000,
        iso: "2024-01-01T14:00:00.000Z",
      },
    });

    const results = [createMockFeedResult([cancelledEvent, activeEvent])];
    const result = mergeFeedEvents(results);

    // Both events kept
    expect(result.events).toHaveLength(2);
    // Verify we have both events
    expect(result.events.some((e) => e.cancelled)).toBe(true);
    expect(result.events.some((e) => !e.cancelled)).toBe(true);
    // Flagged as potential duplicate
    expect(result.potentialDuplicates).toHaveLength(1);
  });

  it("should keep both events with and without location, flag as potential duplicates", () => {
    const eventWithoutLocation = createMockEvent({
      identityKey: "key1",
      summary: "Team Meeting",
      location: "",
      start: {
        kind: "date-time",
        raw: "20240101T100000",
        params: {},
        sortValue: 1704103200000,
        iso: "2024-01-01T10:00:00.000Z",
      },
    });

    const eventWithLocation = createMockEvent({
      identityKey: "key2",
      summary: "Team Meeting",
      location: "Conference Room A",
      start: {
        kind: "date-time",
        raw: "20240101T140000",
        params: {},
        sortValue: 1704117600000,
        iso: "2024-01-01T14:00:00.000Z",
      },
    });

    const results = [createMockFeedResult([eventWithoutLocation, eventWithLocation])];
    const result = mergeFeedEvents(results);

    // Both events kept
    expect(result.events).toHaveLength(2);
    // Flagged as potential duplicate
    expect(result.potentialDuplicates).toHaveLength(1);
    expect(result.potentialDuplicates[0].instances).toHaveLength(2);
  });

  it("should keep both events with different sequence numbers, flag as potential duplicates", () => {
    const olderEvent = createMockEvent({
      identityKey: "key1",
      summary: "Team Meeting",
      sequence: 1,
      start: {
        kind: "date-time",
        raw: "20240101T100000",
        params: {},
        sortValue: 1704103200000,
        iso: "2024-01-01T10:00:00.000Z",
      },
    });

    const newerEvent = createMockEvent({
      identityKey: "key2",
      summary: "Team Meeting",
      sequence: 3,
      start: {
        kind: "date-time",
        raw: "20240101T140000",
        params: {},
        sortValue: 1704117600000,
        iso: "2024-01-01T14:00:00.000Z",
      },
    });

    const results = [createMockFeedResult([olderEvent, newerEvent])];
    const result = mergeFeedEvents(results);

    // Both events kept
    expect(result.events).toHaveLength(2);
    // Flagged as potential duplicate
    expect(result.potentialDuplicates).toHaveLength(1);
  });

  it("should handle all-day events correctly and flag duplicates", () => {
    const allDayEvent1 = createMockEvent({
      identityKey: "key1",
      summary: "Holiday",
      start: {
        kind: "date",
        raw: "20240101",
        params: {},
        sortValue: 1704067200000,
        iso: "2024-01-01",
      },
      end: {
        kind: "date",
        raw: "20240102",
        params: {},
        sortValue: 1704153600000,
        iso: "2024-01-02",
      },
    });

    const allDayEvent2 = createMockEvent({
      identityKey: "key2",
      summary: "Holiday",
      start: {
        kind: "date",
        raw: "20240101",
        params: {},
        sortValue: 1704067200000,
        iso: "2024-01-01",
      },
      end: {
        kind: "date",
        raw: "20240102",
        params: {},
        sortValue: 1704153600000,
        iso: "2024-01-02",
      },
    });

    const results = [createMockFeedResult([allDayEvent1, allDayEvent2])];
    const result = mergeFeedEvents(results);

    // Both events kept
    expect(result.events).toHaveLength(2);
    expect(result.events[0].summary).toBe("Holiday");
    // Flagged as high-confidence duplicate (same time = 0 minutes apart)
    expect(result.potentialDuplicates).toHaveLength(1);
    expect(result.potentialDuplicates[0].confidence).toBe("high");
  });

  it("should handle events from multiple sources and flag cross-source duplicates", () => {
    const event1 = createMockEvent({
      identityKey: "key1",
      sourceId: "source1",
      sourceName: "Source 1",
      summary: "Company Meeting",
      start: {
        kind: "date-time",
        raw: "20240101T100000",
        params: {},
        sortValue: 1704103200000,
        iso: "2024-01-01T10:00:00.000Z",
      },
    });

    const event2 = createMockEvent({
      identityKey: "key2",
      sourceId: "source2",
      sourceName: "Source 2",
      summary: "Company Meeting",
      start: {
        kind: "date-time",
        raw: "20240101T100000", // Same time
        params: {},
        sortValue: 1704103200000,
        iso: "2024-01-01T10:00:00.000Z",
      },
    });

    const results = [
      createMockFeedResult([event1]),
      createMockFeedResult([event2]),
    ];
    const result = mergeFeedEvents(results);

    // Both events kept
    expect(result.events).toHaveLength(2);
    // Flagged as high-confidence duplicate (same time, different sources)
    expect(result.potentialDuplicates).toHaveLength(1);
    expect(result.potentialDuplicates[0].confidence).toBe("high");
    expect(result.potentialDuplicates[0].instances[0].feedId).toBe("source1");
    expect(result.potentialDuplicates[0].instances[1].feedId).toBe("source2");
  });

  it("should preserve events with different summaries on same day without flagging", () => {
    const event1 = createMockEvent({
      identityKey: "key1",
      summary: "Morning Meeting",
      start: {
        kind: "date-time",
        raw: "20240101T100000",
        params: {},
        sortValue: 1704103200000,
        iso: "2024-01-01T10:00:00.000Z",
      },
    });

    const event2 = createMockEvent({
      identityKey: "key2",
      summary: "Afternoon Meeting",
      start: {
        kind: "date-time",
        raw: "20240101T140000",
        params: {},
        sortValue: 1704117600000,
        iso: "2024-01-01T14:00:00.000Z",
      },
    });

    const results = [createMockFeedResult([event1, event2])];
    const result = mergeFeedEvents(results);

    expect(result.events).toHaveLength(2);
    expect(result.events.map((e) => e.summary)).toContain("Morning Meeting");
    expect(result.events.map((e) => e.summary)).toContain("Afternoon Meeting");
    // Should NOT be flagged as duplicates (different summaries)
    expect(result.potentialDuplicates).toHaveLength(0);
  });

  it("should trim whitespace when detecting potential duplicates", () => {
    const event1 = createMockEvent({
      identityKey: "key1",
      summary: "  Team Meeting  ",
      start: {
        kind: "date-time",
        raw: "20240101T100000",
        params: {},
        sortValue: 1704103200000,
        iso: "2024-01-01T10:00:00.000Z",
      },
    });

    const event2 = createMockEvent({
      identityKey: "key2",
      summary: "Team Meeting",
      start: {
        kind: "date-time",
        raw: "20240101T140000",
        params: {},
        sortValue: 1704117600000,
        iso: "2024-01-01T14:00:00.000Z",
      },
    });

    const results = [createMockFeedResult([event1, event2])];
    const result = mergeFeedEvents(results);

    // Both events kept
    expect(result.events).toHaveLength(2);
    // Flagged as potential duplicate (whitespace trimmed)
    expect(result.potentialDuplicates).toHaveLength(1);
  });
});
