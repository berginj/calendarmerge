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

describe("mergeFeedEvents - Day-based Deduplication", () => {
  it("should remove duplicate events with same summary on same day", () => {
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
    const merged = mergeFeedEvents(results);

    expect(merged).toHaveLength(1);
    expect(merged[0].summary).toBe("Team Meeting");
  });

  it("should keep events with same summary on different days", () => {
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
    const merged = mergeFeedEvents(results);

    expect(merged).toHaveLength(2);
  });

  it("should be case-insensitive when matching summaries", () => {
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
    const merged = mergeFeedEvents(results);

    expect(merged).toHaveLength(1);
  });

  it("should prefer non-cancelled events over cancelled ones", () => {
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
    const merged = mergeFeedEvents(results);

    expect(merged).toHaveLength(1);
    expect(merged[0].cancelled).toBe(false);
  });

  it("should prefer events with location over events without", () => {
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
    const merged = mergeFeedEvents(results);

    expect(merged).toHaveLength(1);
    expect(merged[0].location).toBe("Conference Room A");
  });

  it("should prefer events with higher sequence numbers", () => {
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
    const merged = mergeFeedEvents(results);

    expect(merged).toHaveLength(1);
    expect(merged[0].sequence).toBe(3);
  });

  it("should handle all-day events correctly", () => {
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
    const merged = mergeFeedEvents(results);

    expect(merged).toHaveLength(1);
    expect(merged[0].summary).toBe("Holiday");
  });

  it("should handle events from multiple sources", () => {
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
    const merged = mergeFeedEvents(results);

    expect(merged).toHaveLength(1);
  });

  it("should preserve events with different summaries on same day", () => {
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
    const merged = mergeFeedEvents(results);

    expect(merged).toHaveLength(2);
    expect(merged.map((e) => e.summary)).toContain("Morning Meeting");
    expect(merged.map((e) => e.summary)).toContain("Afternoon Meeting");
  });

  it("should trim whitespace when comparing summaries", () => {
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
    const merged = mergeFeedEvents(results);

    expect(merged).toHaveLength(1);
  });
});
