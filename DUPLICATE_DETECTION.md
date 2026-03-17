# Duplicate Event Detection

The calendar merge system includes intelligent duplicate detection to ensure only one copy of each event appears in the merged calendar.

## Two-Stage Deduplication Process

### Stage 1: Identity-Based Deduplication

Events are first deduplicated by their `identityKey`, which is a SHA256 hash of:

**If the event has a UID:**
```
${sourceId}\nuid\n${rawUid}
```

**If no UID (fallback):**
```
${sourceId}\nfallback\n${summary}\n${startTime}\n${endTime}\n${location}
```

This catches:
- ✅ Exact duplicates from the same source
- ✅ Events with identical details (summary, time, location)

### Stage 2: Same-Day Deduplication

Events are then deduplicated by day and summary to catch cross-source duplicates:

**Deduplication Key:**
```
${eventDate}|${normalizedSummary}
```

Where:
- `eventDate` = YYYY-MM-DD (date portion only, ignoring time)
- `normalizedSummary` = trimmed, lowercase summary

This catches:
- ✅ Same event from multiple sources on the same day
- ✅ Events with slightly different times (10:00 AM vs 2:00 PM)
- ✅ Case variations ("Team Meeting" vs "TEAM MEETING")

## Prioritization Logic

When multiple events match the same day + summary, the system chooses the "best" one based on:

1. **Non-cancelled over cancelled** - Active events win
2. **Has location over no location** - More detailed events win
3. **More properties** - Events with richer data win
4. **Higher sequence number** - More recent updates win
5. **Earlier start time** - Likely the canonical time

## Examples

### Example 1: Different Times, Same Day

**Input:**
- Feed A: "Team Meeting" at 10:00 AM on Jan 1
- Feed B: "Team Meeting" at 2:00 PM on Jan 1

**Output:**
- One event: "Team Meeting" (with the most detailed information)

### Example 2: Case Variations

**Input:**
- Feed A: "daily standup" at 9:00 AM
- Feed B: "Daily Standup" at 9:00 AM
- Feed C: "DAILY STANDUP" at 9:15 AM

**Output:**
- One event: "Daily Standup" (the most detailed/recent one)

### Example 3: Multi-Day Events Stay Separate

**Input:**
- "Daily Standup" on Jan 1
- "Daily Standup" on Jan 2
- "Daily Standup" on Jan 3

**Output:**
- Three events (one per day)

### Example 4: Different Events Same Day

**Input:**
- "Morning Meeting" at 10:00 AM on Jan 1
- "Afternoon Meeting" at 2:00 PM on Jan 1

**Output:**
- Two events (different summaries)

## Configuration

No configuration needed - duplicate detection runs automatically on every merge.

## Testing

The duplicate detection logic is fully tested in `test/merge.test.ts` with coverage for:

- ✅ Same-day duplicate removal
- ✅ Different-day preservation
- ✅ Case-insensitive matching
- ✅ Cancelled vs active prioritization
- ✅ Location-based prioritization
- ✅ Sequence number prioritization
- ✅ All-day event handling
- ✅ Cross-source deduplication
- ✅ Whitespace trimming

## Impact on Existing Deployments

**This change is non-breaking and automatic:**

- Existing merged calendars will have fewer duplicate events
- No configuration changes required
- No migration needed
- Works with both environment variable and table storage feed sources

## Opting Out

If you need to disable same-day deduplication (not recommended), you would need to modify `src/lib/merge.ts` to skip the `dedupeSameDayEvents()` step. However, this is not recommended as it will result in duplicate events in the merged calendar.

## Future Enhancements

Possible future improvements:

1. **Fuzzy matching** - Detect similar summaries ("Team Mtg" vs "Team Meeting")
2. **Time tolerance** - Deduplicate events within X hours of each other
3. **Configurable rules** - Per-feed deduplication preferences
4. **Smart location merging** - Combine location info from multiple sources
5. **Description comparison** - Use event descriptions for better matching

## Technical Details

**File:** `src/lib/merge.ts`

**Functions:**
- `mergeFeedEvents()` - Main merge orchestrator
- `dedupeSameDayEvents()` - Day-based deduplication
- `compareSameDayPriority()` - Prioritization logic
- `getEventDate()` - Date extraction helper

**Performance:** O(n) time complexity where n = number of events after identity deduplication

**Memory:** Two hash maps (identity map + day map), proportional to event count
