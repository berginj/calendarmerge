import { describe, expect, it } from "vitest";

import { applyEventFilter, isGameLikeEvent } from "../src/lib/eventFilter";
import { ParsedEvent } from "../src/lib/types";

function createMockEvent(overrides: Partial<ParsedEvent> = {}): ParsedEvent {
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

describe("eventFilter", () => {
  it("should treat category-tagged game events as game-like", () => {
    const event = createMockEvent({
      summary: "Saturday activity",
      properties: [{ name: "CATEGORIES", params: {}, value: "Game,Home" }],
    });

    expect(isGameLikeEvent(event)).toBe(true);
  });

  it("should treat opponent-style summaries as game-like", () => {
    expect(isGameLikeEvent(createMockEvent({ summary: "Tigers vs. Wolves" }))).toBe(true);
    expect(isGameLikeEvent(createMockEvent({ summary: "Tigers @ Wolves" }))).toBe(true);
  });

  it("should treat provider descriptions with event type markers as game-like", () => {
    const event = createMockEvent({
      summary: "Saturday schedule",
      properties: [{ name: "DESCRIPTION", params: {}, value: "Event Type: Game\\nOpponent: Wolves" }],
    });

    expect(isGameLikeEvent(event)).toBe(true);
  });

  it("should leave non-game team events out of games-only mode", () => {
    const practice = createMockEvent({
      identityKey: "practice",
      mergedUid: "practice",
      summary: "Team Practice",
    });
    const meeting = createMockEvent({
      identityKey: "meeting",
      mergedUid: "meeting",
      summary: "Parent Meeting",
    });

    expect(applyEventFilter([practice, meeting], "games-only")).toEqual([]);
  });

  it("should keep only game-like events in games-only mode", () => {
    const game = createMockEvent({
      identityKey: "game",
      mergedUid: "game",
      summary: "Varsity Game vs Central",
    });
    const practice = createMockEvent({
      identityKey: "practice",
      mergedUid: "practice",
      summary: "Team Practice",
    });

    expect(applyEventFilter([game, practice], "games-only")).toEqual([game]);
  });
});
