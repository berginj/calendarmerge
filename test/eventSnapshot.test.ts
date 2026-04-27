import { describe, expect, it } from "vitest";

import {
  createSnapshotMap,
  detectRescheduledEvents,
  isCancelledEvent,
  isLeagueAppsRescheduleMarker,
} from "../src/lib/eventSnapshot";
import { ParsedEvent } from "../src/lib/types";

function createMockEvent(overrides: Partial<ParsedEvent> = {}): ParsedEvent {
  return {
    sourceId: "test-source",
    sourceName: "Test Source",
    identityKey: "unique-key",
    mergedUid: "merged-uid",
    summary: "Test Event",
    location: "Test Location",
    cancelled: false,
    sequence: 0,
    start: {
      kind: "date-time",
      raw: "20260501T100000Z",
      params: {},
      sortValue: new Date("2026-05-01T10:00:00Z").getTime(),
      iso: "2026-05-01T10:00:00Z",
    },
    end: {
      kind: "date-time",
      raw: "20260501T110000Z",
      params: {},
      sortValue: new Date("2026-05-01T11:00:00Z").getTime(),
      iso: "2026-05-01T11:00:00Z",
    },
    properties: [],
    ...overrides,
  };
}

describe("eventSnapshot", () => {
  describe("createSnapshotMap", () => {
    it("should only snapshot events within 7-day future window", () => {
      const now = "2026-04-27T12:00:00Z";
      const nowMs = new Date(now).getTime();

      const events = [
        // Past event (should not be snapshotted)
        createMockEvent({
          mergedUid: "past-event",
          start: {
            kind: "date-time",
            raw: "20260426T100000Z",
            params: {},
            sortValue: nowMs - 24 * 60 * 60 * 1000,
            iso: "2026-04-26T10:00:00Z",
          },
        }),
        // Future event within 7 days (should be snapshotted)
        createMockEvent({
          mergedUid: "future-event-1",
          start: {
            kind: "date-time",
            raw: "20260428T100000Z",
            params: {},
            sortValue: nowMs + 24 * 60 * 60 * 1000,
            iso: "2026-04-28T10:00:00Z",
          },
        }),
        // Future event beyond 7 days (should not be snapshotted)
        createMockEvent({
          mergedUid: "future-event-far",
          start: {
            kind: "date-time",
            raw: "20260510T100000Z",
            params: {},
            sortValue: nowMs + 13 * 24 * 60 * 60 * 1000,
            iso: "2026-05-10T10:00:00Z",
          },
        }),
      ];

      const snapshots = createSnapshotMap(events, now);

      expect(snapshots.size).toBe(1);
      expect(snapshots.has("future-event-1")).toBe(true);
      expect(snapshots.has("past-event")).toBe(false);
      expect(snapshots.has("future-event-far")).toBe(false);
    });
  });

  describe("detectRescheduledEvents", () => {
    it("should detect time changes", () => {
      const now = "2026-04-27T12:00:00Z";
      const futureTime = new Date(now).getTime() + 2 * 24 * 60 * 60 * 1000;
      const newFutureTime = futureTime + 4 * 60 * 60 * 1000; // 4 hours later
      const originalTimeIso = new Date(futureTime).toISOString();
      const newTimeIso = new Date(newFutureTime).toISOString();

      const previousSnapshots = new Map([
        [
          "event-1",
          {
            uid: "event-1",
            summary: "Team Meeting",
            sourceId: "source-1",
            sourceName: "Source 1",
            startTime: originalTimeIso,
            endTime: new Date(futureTime + 60 * 60 * 1000).toISOString(),
            location: "Room A",
            capturedAt: "2026-04-26T12:00:00Z",
          },
        ],
      ]);

      const currentEvent = createMockEvent({
        mergedUid: "event-1",
        summary: "Team Meeting",
        start: {
          kind: "date-time",
          raw: "20260429T140000Z",
          params: {},
          sortValue: newFutureTime,
          iso: newTimeIso,
        },
        end: {
          kind: "date-time",
          raw: "20260429T150000Z",
          params: {},
          sortValue: newFutureTime + 60 * 60 * 1000,
          iso: new Date(newFutureTime + 60 * 60 * 1000).toISOString(),
        },
        location: "Room A",
      });

      const rescheduled = detectRescheduledEvents([currentEvent], previousSnapshots, now);

      expect(rescheduled).toHaveLength(1);
      expect(rescheduled[0].uid).toBe("event-1");
      expect(rescheduled[0].changes.time).toBeDefined();
      expect(rescheduled[0].changes.time?.from).toBe(originalTimeIso);
      expect(rescheduled[0].changes.time?.to).toBe(newTimeIso);
      expect(rescheduled[0].changes.location).toBeUndefined();
    });

    it("should detect location changes", () => {
      const now = "2026-04-27T12:00:00Z";
      const futureTime = new Date(now).getTime() + 2 * 24 * 60 * 60 * 1000;
      const futureTimeIso = new Date(futureTime).toISOString();
      const endTimeIso = new Date(futureTime + 60 * 60 * 1000).toISOString();

      const previousSnapshots = new Map([
        [
          "event-1",
          {
            uid: "event-1",
            summary: "Team Meeting",
            sourceId: "source-1",
            sourceName: "Source 1",
            startTime: futureTimeIso,
            endTime: endTimeIso,
            location: "Room A",
            capturedAt: "2026-04-26T12:00:00Z",
          },
        ],
      ]);

      const currentEvent = createMockEvent({
        mergedUid: "event-1",
        summary: "Team Meeting",
        start: {
          kind: "date-time",
          raw: "20260429T100000Z",
          params: {},
          sortValue: futureTime,
          iso: futureTimeIso,
        },
        end: {
          kind: "date-time",
          raw: "20260429T110000Z",
          params: {},
          sortValue: futureTime + 60 * 60 * 1000,
          iso: endTimeIso,
        },
        location: "Room B", // Changed location
      });

      const rescheduled = detectRescheduledEvents([currentEvent], previousSnapshots, now);

      expect(rescheduled).toHaveLength(1);
      expect(rescheduled[0].uid).toBe("event-1");
      expect(rescheduled[0].changes.time).toBeUndefined();
      expect(rescheduled[0].changes.location).toBeDefined();
      expect(rescheduled[0].changes.location?.from).toBe("Room A");
      expect(rescheduled[0].changes.location?.to).toBe("Room B");
    });

    it("should detect both time and location changes", () => {
      const now = "2026-04-27T12:00:00Z";
      const futureTime = new Date(now).getTime() + 2 * 24 * 60 * 60 * 1000;
      const newFutureTime = futureTime + 4 * 60 * 60 * 1000;
      const originalTimeIso = new Date(futureTime).toISOString();
      const newTimeIso = new Date(newFutureTime).toISOString();

      const previousSnapshots = new Map([
        [
          "event-1",
          {
            uid: "event-1",
            summary: "Team Meeting",
            sourceId: "source-1",
            sourceName: "Source 1",
            startTime: originalTimeIso,
            endTime: new Date(futureTime + 60 * 60 * 1000).toISOString(),
            location: "Room A",
            capturedAt: "2026-04-26T12:00:00Z",
          },
        ],
      ]);

      const currentEvent = createMockEvent({
        mergedUid: "event-1",
        summary: "Team Meeting",
        start: {
          kind: "date-time",
          raw: "20260429T140000Z",
          params: {},
          sortValue: newFutureTime,
          iso: newTimeIso,
        },
        end: {
          kind: "date-time",
          raw: "20260429T150000Z",
          params: {},
          sortValue: newFutureTime + 60 * 60 * 1000,
          iso: new Date(newFutureTime + 60 * 60 * 1000).toISOString(),
        },
        location: "Room B",
      });

      const rescheduled = detectRescheduledEvents([currentEvent], previousSnapshots, now);

      expect(rescheduled).toHaveLength(1);
      expect(rescheduled[0].changes.time).toBeDefined();
      expect(rescheduled[0].changes.location).toBeDefined();
      expect(rescheduled[0].changes.location?.from).toBe("Room A");
      expect(rescheduled[0].changes.location?.to).toBe("Room B");
    });

    it("should NOT detect changes for events outside 7-day window", () => {
      const now = "2026-04-27T12:00:00Z";
      const futureTime = new Date(now).getTime() + 10 * 24 * 60 * 60 * 1000; // 10 days out
      const newFutureTime = futureTime + 4 * 60 * 60 * 1000;

      const previousSnapshots = new Map([
        [
          "event-1",
          {
            uid: "event-1",
            summary: "Team Meeting",
            sourceId: "source-1",
            sourceName: "Source 1",
            startTime: new Date(futureTime).toISOString(),
            endTime: new Date(futureTime + 60 * 60 * 1000).toISOString(),
            location: "Room A",
            capturedAt: "2026-04-26T12:00:00Z",
          },
        ],
      ]);

      const currentEvent = createMockEvent({
        mergedUid: "event-1",
        summary: "Team Meeting",
        start: {
          kind: "date-time",
          raw: "20260507T140000Z",
          params: {},
          sortValue: newFutureTime,
          iso: new Date(newFutureTime).toISOString(),
        },
        end: {
          kind: "date-time",
          raw: "20260507T150000Z",
          params: {},
          sortValue: newFutureTime + 60 * 60 * 1000,
          iso: new Date(newFutureTime + 60 * 60 * 1000).toISOString(),
        },
        location: "Room B",
      });

      const rescheduled = detectRescheduledEvents([currentEvent], previousSnapshots, now);

      // Should not detect changes for events >7 days out
      expect(rescheduled).toHaveLength(0);
    });

    it("should NOT detect changes for past events", () => {
      const now = "2026-04-27T12:00:00Z";
      const pastTime = new Date(now).getTime() - 1 * 24 * 60 * 60 * 1000;
      const newPastTime = pastTime + 4 * 60 * 60 * 1000;

      const previousSnapshots = new Map([
        [
          "event-1",
          {
            uid: "event-1",
            summary: "Team Meeting",
            sourceId: "source-1",
            sourceName: "Source 1",
            startTime: new Date(pastTime).toISOString(),
            endTime: new Date(pastTime + 60 * 60 * 1000).toISOString(),
            location: "Room A",
            capturedAt: "2026-04-26T12:00:00Z",
          },
        ],
      ]);

      const currentEvent = createMockEvent({
        mergedUid: "event-1",
        summary: "Team Meeting",
        start: {
          kind: "date-time",
          raw: "20260426T140000Z",
          params: {},
          sortValue: newPastTime,
          iso: new Date(newPastTime).toISOString(),
        },
        end: {
          kind: "date-time",
          raw: "20260426T150000Z",
          params: {},
          sortValue: newPastTime + 60 * 60 * 1000,
          iso: new Date(newPastTime + 60 * 60 * 1000).toISOString(),
        },
        location: "Room B",
      });

      const rescheduled = detectRescheduledEvents([currentEvent], previousSnapshots, now);

      // Should not track past events
      expect(rescheduled).toHaveLength(0);
    });

    it("should ignore events with no previous snapshot", () => {
      const now = "2026-04-27T12:00:00Z";
      const futureTime = new Date(now).getTime() + 2 * 24 * 60 * 60 * 1000;

      const previousSnapshots = new Map(); // Empty

      const currentEvent = createMockEvent({
        mergedUid: "new-event",
        start: {
          kind: "date-time",
          raw: "20260429T100000Z",
          params: {},
          sortValue: futureTime,
          iso: new Date(futureTime).toISOString(),
        },
      });

      const rescheduled = detectRescheduledEvents([currentEvent], previousSnapshots, now);

      expect(rescheduled).toHaveLength(0);
    });
  });

  describe("isCancelledEvent", () => {
    it("should detect cancelled status field", () => {
      const event = createMockEvent({ cancelled: true });
      expect(isCancelledEvent(event)).toBe(true);
    });

    it("should detect 'cancelled' in summary", () => {
      const event = createMockEvent({ summary: "Game vs Tigers - CANCELLED" });
      expect(isCancelledEvent(event)).toBe(true);
    });

    it("should detect 'canceled' (US spelling) in summary", () => {
      const event = createMockEvent({ summary: "Game vs Tigers - CANCELED" });
      expect(isCancelledEvent(event)).toBe(true);
    });

    it("should detect cancellation prefix", () => {
      const event = createMockEvent({ summary: "Cancelled: Team Meeting" });
      expect(isCancelledEvent(event)).toBe(true);
    });

    it("should detect cancellation in description", () => {
      const event = createMockEvent({
        summary: "Game vs Tigers",
        properties: [
          {
            name: "DESCRIPTION",
            params: {},
            value: "This game has been cancelled due to weather",
          },
        ],
      });
      expect(isCancelledEvent(event)).toBe(true);
    });

    it("should NOT detect normal events as cancelled", () => {
      const event = createMockEvent({ summary: "Game vs Tigers" });
      expect(isCancelledEvent(event)).toBe(false);
    });
  });

  describe("isLeagueAppsRescheduleMarker", () => {
    it("should detect 'RESCHEDULED' in summary", () => {
      const event = createMockEvent({ summary: "Game vs Tigers - RESCHEDULED" });
      expect(isLeagueAppsRescheduleMarker(event)).toBe(true);
    });

    it("should detect 'rescheduled' case-insensitive", () => {
      const event = createMockEvent({ summary: "Game vs Tigers - Rescheduled" });
      expect(isLeagueAppsRescheduleMarker(event)).toBe(true);
    });

    it("should NOT detect normal events", () => {
      const event = createMockEvent({ summary: "Game vs Tigers" });
      expect(isLeagueAppsRescheduleMarker(event)).toBe(false);
    });
  });
});
