import { FeedRunResult, MergeResult, ParsedEvent, PotentialDuplicate, PotentialDuplicateInstance } from "./types";

/**
 * Merges events from multiple feed results with identity-based deduplication.
 * Also detects potential duplicates (same summary + date) but keeps all events.
 *
 * Identity-based deduplication: Events with same identityKey are deduplicated (same UID or same summary+time+location).
 * Duplicate detection: Events with same normalized summary on same date are flagged but NOT removed.
 */
export function mergeFeedEvents(results: FeedRunResult[]): MergeResult {
  // Identity-based deduplication: Only one event per identityKey
  const deduped = new Map<string, ParsedEvent>();

  for (const result of results) {
    for (const event of result.events) {
      const existing = deduped.get(event.identityKey);
      if (!existing || comparePriority(event, existing) > 0) {
        deduped.set(event.identityKey, event);
      }
    }
  }

  const events = Array.from(deduped.values()).sort(compareEventOrder);

  // Detect potential duplicates (same summary + date) but keep all events
  const potentialDuplicates = detectPotentialDuplicates(events);

  return {
    events,
    potentialDuplicates,
  };
}

/**
 * Detects events that might be duplicates based on summary and date.
 * Does NOT remove events - just flags them for review.
 *
 * Confidence levels:
 * - High: Same summary, same date, same time (within 15 minutes)
 * - Medium: Same summary, same date, different times (>15 minutes apart)
 * - Low: Similar summary, same date
 */
function detectPotentialDuplicates(events: ParsedEvent[]): PotentialDuplicate[] {
  // Group events by normalized summary + date
  const dayGroups = new Map<string, ParsedEvent[]>();

  for (const event of events) {
    const normalizedSummary = event.summary.trim().toLowerCase();
    const eventDate = getEventDate(event.start.iso);
    const dayKey = `${eventDate}|${normalizedSummary}`;

    const group = dayGroups.get(dayKey) || [];
    group.push(event);
    dayGroups.set(dayKey, group);
  }

  // Find groups with multiple events (potential duplicates)
  const duplicates: PotentialDuplicate[] = [];

  for (const [dayKey, group] of dayGroups) {
    if (group.length < 2) {
      continue; // Not a duplicate if only one event
    }

    const [date, ...summaryParts] = dayKey.split("|");
    const normalizedSummary = summaryParts.join("|");

    // Determine confidence level
    const confidence = calculateDuplicateConfidence(group);

    const instances: PotentialDuplicateInstance[] = group.map((event) => ({
      feedId: event.sourceId,
      feedName: event.sourceName,
      time: event.start.iso,
      location: event.location || "",
      uid: event.mergedUid,
    }));

    duplicates.push({
      summary: group[0].summary, // Use original summary from first event
      date: date,
      instances,
      confidence,
    });
  }

  return duplicates;
}

/**
 * Calculate confidence level for potential duplicates
 */
function calculateDuplicateConfidence(events: ParsedEvent[]): "high" | "medium" | "low" {
  // If all events have same or very similar times (within 15 minutes), high confidence
  const times = events.map((e) => e.start.sortValue);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeDiffMinutes = (maxTime - minTime) / (1000 * 60);

  if (timeDiffMinutes <= 15) {
    return "high"; // Same time = likely true duplicate
  }

  if (timeDiffMinutes <= 120) {
    return "medium"; // Within 2 hours = possibly same event, possibly different
  }

  return "low"; // Different times = possibly different events with same name
}

/**
 * Extracts the date portion (YYYY-MM-DD) from an ISO timestamp
 */
function getEventDate(isoTimestamp: string): string {
  return isoTimestamp.split("T")[0];
}

/**
 * Determines priority for identity-based deduplication.
 * Higher sequence number wins, then more recent update, then non-cancelled, then more detailed.
 */
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

/**
 * Sorts events chronologically by start time, then by other properties for consistency.
 */
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
