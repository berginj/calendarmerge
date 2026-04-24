import { applyEventFilter } from "./eventFilter";
import { ParsedEvent } from "./types";
import { serializeCalendar } from "./ics";

const PUBLIC_STRIP_PROPERTY_NAMES = new Set([
  "ATTENDEE",
  "CONTACT",
  "ORGANIZER",
  "X-MS-OLK-CONFTYPE",
  "X-MS-OLK-SENDER",
  "X-MS-OLK-AUTOFILLLOCATION",
]);

export interface ScheduleXEventDocument {
  serviceName: string;
  mode: "full" | "games";
  generatedAt: string;
  timezone: "UTC";
  events: ScheduleXEvent[];
}

interface ScheduleXEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  calendarId: string;
  sourceId: string;
  sourceName: string;
}

export interface PublicCalendarArtifacts {
  fullCalendarText: string;
  gamesCalendarText: string;
  fullScheduleX: ScheduleXEventDocument;
  gamesScheduleX: ScheduleXEventDocument;
  publicEvents: ParsedEvent[];
  publicGamesEvents: ParsedEvent[];
}

export function buildPublicCalendarArtifacts(
  events: ParsedEvent[],
  serviceName: string,
  generatedAt = new Date(),
): PublicCalendarArtifacts {
  const publicEvents = events.map(toPublicEvent);
  const publicGamesEvents = applyEventFilter(publicEvents, "games-only");
  const generatedAtIso = generatedAt.toISOString();

  return {
    fullCalendarText: serializeCalendar(publicEvents, serviceName, generatedAt),
    gamesCalendarText: serializeCalendar(publicGamesEvents, serviceName, generatedAt),
    fullScheduleX: buildScheduleXDocument(publicEvents, serviceName, "full", generatedAtIso),
    gamesScheduleX: buildScheduleXDocument(publicGamesEvents, serviceName, "games", generatedAtIso),
    publicEvents,
    publicGamesEvents,
  };
}

export function toPublicEvent(event: ParsedEvent): ParsedEvent {
  return {
    ...event,
    properties: event.properties
      .filter((property) => !PUBLIC_STRIP_PROPERTY_NAMES.has(property.name))
      .filter((property) => property.name !== "DESCRIPTION"),
  };
}

function buildScheduleXDocument(
  events: ParsedEvent[],
  serviceName: string,
  mode: "full" | "games",
  generatedAt: string,
): ScheduleXEventDocument {
  return {
    serviceName,
    mode,
    generatedAt,
    timezone: "UTC",
    events: events.map(toScheduleXEvent),
  };
}

function toScheduleXEvent(event: ParsedEvent): ScheduleXEvent {
  const start = toScheduleXTime(event.start.iso, event.start.kind);
  const requestedEnd = toScheduleXTime(event.end?.iso ?? event.start.iso, event.end?.kind ?? event.start.kind);

  return {
    id: event.mergedUid,
    title: event.summary || event.sourceName,
    start,
    end: normalizeScheduleXEnd(start, requestedEnd),
    location: event.location || undefined,
    description: buildScheduleXDescription(event),
    calendarId: toScheduleXCalendarId(event.sourceId),
    sourceId: event.sourceId,
    sourceName: event.sourceName,
  };
}

function buildScheduleXDescription(event: ParsedEvent): string | undefined {
  const lines = [event.location, event.cancelled ? "Cancelled" : undefined, `Source: ${event.sourceName}`].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

function toScheduleXTime(iso: string, kind: "date" | "date-time"): string {
  if (kind === "date") {
    return iso.slice(0, 10);
  }

  return iso.slice(0, 16).replace("T", " ");
}

function toScheduleXCalendarId(sourceId: string): string {
  const normalized = sourceId.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || "calendar";
}

function normalizeScheduleXEnd(start: string, end: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return end < start ? start : end;
  }

  const startDate = new Date(start.replace(" ", "T") + "Z");
  const endDate = new Date(end.replace(" ", "T") + "Z");
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return end;
  }

  if (endDate > startDate) {
    return end;
  }

  return new Date(startDate.getTime() + 60_000).toISOString().slice(0, 16).replace("T", " ");
}
