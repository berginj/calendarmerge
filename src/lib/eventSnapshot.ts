import { ParsedEvent, RescheduledEvent } from "./types";

/**
 * Snapshot of an event for change detection
 */
export interface EventSnapshot {
  uid: string;
  summary: string;
  sourceId: string;
  sourceName: string;
  startTime: string; // ISO timestamp
  endTime?: string;
  location: string;
  capturedAt: string; // When this snapshot was taken
}

/**
 * Creates a snapshot from a parsed event for change tracking
 */
export function createEventSnapshot(event: ParsedEvent, capturedAt: string): EventSnapshot {
  return {
    uid: event.mergedUid,
    summary: event.summary,
    sourceId: event.sourceId,
    sourceName: event.sourceName,
    startTime: event.start.iso,
    endTime: event.end?.iso,
    location: event.location,
    capturedAt,
  };
}

/**
 * Detects rescheduled events by comparing current events against previous snapshots.
 * Only tracks events in the future 7-day window.
 */
export function detectRescheduledEvents(
  currentEvents: ParsedEvent[],
  previousSnapshots: Map<string, EventSnapshot>,
  detectedAt: string,
): RescheduledEvent[] {
  const rescheduled: RescheduledEvent[] = [];
  const now = new Date(detectedAt).getTime();
  const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;

  for (const event of currentEvents) {
    // Only track future events within 7-day window
    const eventTime = event.start.sortValue;
    if (eventTime < now || eventTime > sevenDaysFromNow) {
      continue;
    }

    const previous = previousSnapshots.get(event.mergedUid);
    if (!previous) {
      continue; // New event, not a reschedule
    }

    // Check for time changes
    const timeChanged = event.start.iso !== previous.startTime || event.end?.iso !== previous.endTime;

    // Check for location changes
    const locationChanged = event.location.trim() !== previous.location.trim();

    if (timeChanged || locationChanged) {
      const changes: RescheduledEvent["changes"] = {};

      if (timeChanged) {
        changes.time = {
          from: previous.startTime,
          to: event.start.iso,
        };
      }

      if (locationChanged) {
        changes.location = {
          from: previous.location,
          to: event.location,
        };
      }

      rescheduled.push({
        uid: event.mergedUid,
        summary: event.summary,
        feedId: event.sourceId,
        feedName: event.sourceName,
        changes,
        detectedAt,
      });
    }
  }

  return rescheduled;
}

/**
 * Creates a snapshot map from a list of events
 */
export function createSnapshotMap(events: ParsedEvent[], capturedAt: string): Map<string, EventSnapshot> {
  const map = new Map<string, EventSnapshot>();
  const now = new Date(capturedAt).getTime();
  const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;

  for (const event of events) {
    // Only snapshot future events within 7-day window
    const eventTime = event.start.sortValue;
    if (eventTime >= now && eventTime <= sevenDaysFromNow) {
      map.set(event.mergedUid, createEventSnapshot(event, capturedAt));
    }
  }

  return map;
}

/**
 * Detects LeagueApps reschedule markers in event summaries
 */
export function isLeagueAppsRescheduleMarker(event: ParsedEvent): boolean {
  const summaryLower = event.summary.toLowerCase();
  return summaryLower.includes("rescheduled");
}

/**
 * Enhanced cancellation detection using multiple signals
 */
export function isCancelledEvent(event: ParsedEvent): boolean {
  // Already marked as cancelled
  if (event.cancelled) {
    return true;
  }

  // Check for cancellation keywords in summary
  const summaryLower = event.summary.toLowerCase();
  if (
    summaryLower.includes("cancelled") ||
    summaryLower.includes("canceled") ||
    summaryLower.startsWith("cancelled:") ||
    summaryLower.startsWith("canceled:")
  ) {
    return true;
  }

  // Check description for cancellation (if available)
  const descriptionProp = event.properties.find((p) => p.name === "DESCRIPTION");
  if (descriptionProp) {
    const descLower = descriptionProp.value.toLowerCase();
    if (descLower.includes("cancelled") || descLower.includes("canceled")) {
      return true;
    }
  }

  return false;
}
