import { FeedRunResult, ParsedEvent } from "./types";

export function mergeFeedEvents(results: FeedRunResult[]): ParsedEvent[] {
  // First pass: deduplicate by identity key (UID or summary+time+location)
  const deduped = new Map<string, ParsedEvent>();

  for (const result of results) {
    for (const event of result.events) {
      const existing = deduped.get(event.identityKey);
      if (!existing || comparePriority(event, existing) > 0) {
        deduped.set(event.identityKey, event);
      }
    }
  }

  // Second pass: deduplicate by same day + summary (cross-source duplicates)
  const dayDeduped = dedupeSameDayEvents(Array.from(deduped.values()));

  return dayDeduped.sort(compareEventOrder);
}

/**
 * Removes duplicate events that have the same summary and occur on the same day.
 * This catches duplicates across different sources that might have slightly different times.
 */
function dedupeSameDayEvents(events: ParsedEvent[]): ParsedEvent[] {
  const dayMap = new Map<string, ParsedEvent>();

  for (const event of events) {
    // Create a key based on normalized summary and the date (without time)
    const normalizedSummary = event.summary.trim().toLowerCase();
    const eventDate = getEventDate(event.start.iso);
    const dayKey = `${eventDate}|${normalizedSummary}`;

    const existing = dayMap.get(dayKey);
    if (!existing || compareSameDayPriority(event, existing) > 0) {
      dayMap.set(dayKey, event);
    }
  }

  return Array.from(dayMap.values());
}

/**
 * Extracts the date portion (YYYY-MM-DD) from an ISO timestamp
 */
function getEventDate(isoTimestamp: string): string {
  // Extract date portion (YYYY-MM-DD) from ISO string
  return isoTimestamp.split("T")[0];
}

/**
 * Determines priority for same-day events with same summary.
 * Prefers: non-cancelled > has location > has more properties > earlier start time
 */
function compareSameDayPriority(left: ParsedEvent, right: ParsedEvent): number {
  // Prefer non-cancelled events
  if (left.cancelled !== right.cancelled) {
    return left.cancelled ? -1 : 1;
  }

  // Prefer events with location information
  const leftHasLocation = Boolean(left.location.trim());
  const rightHasLocation = Boolean(right.location.trim());
  if (leftHasLocation !== rightHasLocation) {
    return leftHasLocation ? 1 : -1;
  }

  // Prefer events with more properties (more detailed)
  if (left.properties.length !== right.properties.length) {
    return left.properties.length - right.properties.length;
  }

  // Prefer events with higher sequence number (more recent update)
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }

  // Prefer earlier start time (likely the canonical time)
  if (left.start.sortValue !== right.start.sortValue) {
    return right.start.sortValue - left.start.sortValue;
  }

  return 0;
}

function comparePriority(left: ParsedEvent, right: ParsedEvent): number {
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }

  if ((left.updatedSortValue ?? 0) !== (right.updatedSortValue ?? 0)) {
    return (left.updatedSortValue ?? 0) - (right.updatedSortValue ?? 0);
  }

  if (left.cancelled !== right.cancelled) {
    return left.cancelled ? 1 : -1;
  }

  return left.properties.length - right.properties.length;
}

function compareEventOrder(left: ParsedEvent, right: ParsedEvent): number {
  if (left.start.sortValue !== right.start.sortValue) {
    return left.start.sortValue - right.start.sortValue;
  }

  if (left.start.kind !== right.start.kind) {
    return left.start.kind === "date" ? -1 : 1;
  }

  const leftEnd = left.end?.sortValue ?? Number.MAX_SAFE_INTEGER;
  const rightEnd = right.end?.sortValue ?? Number.MAX_SAFE_INTEGER;
  if (leftEnd !== rightEnd) {
    return leftEnd - rightEnd;
  }

  const summaryCompare = left.summary.localeCompare(right.summary);
  if (summaryCompare !== 0) {
    return summaryCompare;
  }

  return left.mergedUid.localeCompare(right.mergedUid);
}
