import { describe, expect, it } from "vitest";

import { parseIcsCalendar } from "../src/lib/ics";
import { buildPublicCalendarArtifacts, toPublicEvent } from "../src/lib/publicCalendars";
import { SourceFeedConfig } from "../src/lib/types";

function source(id: string, name = id): SourceFeedConfig {
  return {
    id,
    name,
    url: `https://example.com/${id}.ics`,
  };
}

describe("public calendar artifacts", () => {
  it("removes attendee and organizer details from public calendar output", () => {
    const event = parseIcsCalendar(
      `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:game-1
DTSTART:20260512T170000Z
DTEND:20260512T180000Z
SUMMARY:Game vs Tigers
LOCATION:Field 4, 123 Main St, Springfield
ATTENDEE;CN=Pat Coach:mailto:pat@example.com
ORGANIZER;CN=Athletics Office:mailto:office@example.com
CONTACT:555-111-2222
DESCRIPTION:Call Pat for gate access
END:VEVENT
END:VCALENDAR`,
      source("athletics", "Athletics"),
    )[0];

    const publicEvent = toPublicEvent(event!);
    const serialized = buildPublicCalendarArtifacts([event!], "calendarmerge").fullCalendarText;

    expect(publicEvent.properties.some((property) => property.name === "ATTENDEE")).toBe(false);
    expect(publicEvent.properties.some((property) => property.name === "ORGANIZER")).toBe(false);
    expect(publicEvent.properties.some((property) => property.name === "CONTACT")).toBe(false);
    expect(publicEvent.properties.some((property) => property.name === "DESCRIPTION")).toBe(false);
    expect(serialized).toContain("LOCATION:Field 4, 123 Main St, Springfield");
    expect(serialized).not.toContain("ATTENDEE");
    expect(serialized).not.toContain("ORGANIZER");
    expect(serialized).not.toContain("CONTACT");
    expect(serialized).not.toContain("Call Pat");
  });

  it("builds games-only schedule-x output from game-like events", () => {
    const events = parseIcsCalendar(
      `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:game-1
DTSTART:20260512T170000Z
DTEND:20260512T180000Z
SUMMARY:Game vs Tigers
LOCATION:Field 4
END:VEVENT
BEGIN:VEVENT
UID:meeting-1
DTSTART:20260512T190000Z
DTEND:20260512T193000Z
SUMMARY:Booster Club Meeting
LOCATION:Library
END:VEVENT
END:VCALENDAR`,
      source("athletics", "Athletics"),
    );

    const artifacts = buildPublicCalendarArtifacts(events, "calendarmerge");

    expect(artifacts.fullScheduleX.events).toHaveLength(2);
    expect(artifacts.gamesScheduleX.events).toHaveLength(1);
    expect(artifacts.gamesScheduleX.events[0]?.title).toBe("Game vs Tigers");
  });

  it("normalizes schedule-x ids and guarantees timed events end after they start", () => {
    const [event] = parseIcsCalendar(
      `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:practice-1
DTSTART:20260512T170000Z
SUMMARY:Practice
LOCATION:North Field
END:VEVENT
END:VCALENDAR`,
      source("Team Alpha / Varsity", "Team Alpha"),
    );

    const artifacts = buildPublicCalendarArtifacts([event!], "calendarmerge");
    const scheduleXEvent = artifacts.fullScheduleX.events[0];

    expect(scheduleXEvent?.calendarId).toBe("team-alpha-varsity");
    expect(scheduleXEvent?.sourceId).toBe("Team Alpha / Varsity");
    expect(scheduleXEvent?.sourceName).toBe("Team Alpha");
    expect(scheduleXEvent?.start).toBe("2026-05-12 17:00");
    expect(scheduleXEvent?.end).toBe("2026-05-12 17:01");
  });

  it("filters out cancelled events entirely and tracks the count", () => {
    const events = parseIcsCalendar(
      `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:game-1
DTSTART:20260512T170000Z
DTEND:20260512T180000Z
SUMMARY:Game vs Tigers
LOCATION:Field 4
END:VEVENT
BEGIN:VEVENT
UID:game-2
DTSTART:20260513T170000Z
DTEND:20260513T180000Z
SUMMARY:Game vs Lions
LOCATION:Field 5
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:game-3
DTSTART:20260514T170000Z
DTEND:20260514T180000Z
SUMMARY:Game vs Bears
LOCATION:Field 4
END:VEVENT
END:VCALENDAR`,
      source("athletics", "Athletics"),
    );

    const artifacts = buildPublicCalendarArtifacts(events, "calendarmerge");

    // Only 2 active events should be in output (cancelled event filtered)
    expect(artifacts.publicEvents).toHaveLength(2);
    expect(artifacts.fullScheduleX.events).toHaveLength(2);
    expect(artifacts.publicEvents.some((e) => e.summary === "Game vs Lions")).toBe(false);
    expect(artifacts.publicEvents.every((e) => !e.cancelled)).toBe(true);

    // Should track count of filtered cancelled events
    expect(artifacts.cancelledEventsFiltered).toBe(1);

    // Verify the ICS output doesn't contain the cancelled event
    expect(artifacts.fullCalendarText).toContain("Game vs Tigers");
    expect(artifacts.fullCalendarText).toContain("Game vs Bears");
    expect(artifacts.fullCalendarText).not.toContain("Game vs Lions");
  });
});
