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
});
