# Duplicate Event Detection

The calendar merge system includes intelligent duplicate detection with two distinct behaviors:
1. **Identity-based deduplication** - Removes true duplicates (same UID or same exact details)
2. **Potential duplicate flagging** - Detects and flags likely duplicates but KEEPS all events

**Important Change (2026-04-27):** The system NO LONGER automatically removes events with the same summary on the same day. Instead, all such events are kept and flagged as "potential duplicates" for review.

## Two-Stage Process

### Stage 1: Identity-Based Deduplication (Removes Duplicates)

Events are deduplicated by their `identityKey`, which is a SHA256 hash of:

**If the event has a UID:**
```
${sourceId}\nuid\n${rawUid}
```

**If no UID (fallback):**
```
${sourceId}\nfallback\n${summary}\n${startTime}\n${endTime}\n${location}
```

**This REMOVES duplicates:**
- ✅ Exact duplicates from the same source (same UID)
- ✅ Events with identical details (same summary, time, location, and source)

**Prioritization** (when multiple events share an identity key):
1. Higher sequence number (more recent update)
2. Later updated timestamp
3. Non-cancelled over cancelled
4. More properties (richer data)

### Stage 2: Potential Duplicate Detection (Flags But Keeps Events)

Events with the same normalized summary on the same day are flagged as potential duplicates but ALL are kept in the output.

**Detection Key:**
```
${eventDate}|${normalizedSummary}
```

Where:
- `eventDate` = YYYY-MM-DD (date portion only)
- `normalizedSummary` = trimmed, lowercase summary

**This DETECTS but does NOT remove:**
- 🔍 Same event from multiple sources on same day
- 🔍 Events with different times on same day (10:00 AM vs 2:00 PM)
- 🔍 Case variations ("Team Meeting" vs "TEAM MEETING")
- 🔍 Whitespace variations ("  Team Meeting  " vs "Team Meeting")

**Confidence Levels:**
- **High** (<15 min apart): Very likely true duplicate - same event, slightly different times
- **Medium** (15 min - 2 hrs apart): Possibly same event or different sessions
- **Low** (>2 hrs apart): Likely different events with same name

## Why This Change?

**Old Behavior (Removed):** Automatically suppressed one event when multiple had same summary + date.

**Problem:** Could suppress legitimate events:
- Team photo at 10 AM and 2 PM for different groups
- Morning practice and afternoon game
- Rescheduled events that appear on same day

**New Behavior:** Keep ALL events, flag potential duplicates in `status.json`

**Benefits:**
- No legitimate events are hidden
- Users can review flagged duplicates manually
- Time/location changes are preserved (reschedule tracking coming in Phase 2)

## Examples

### Example 1: Different Times, Same Day (NEW BEHAVIOR)

**Input:**
- Feed A: "Team Meeting" at 10:00 AM on Jan 1
- Feed B: "Team Meeting" at 2:00 PM on Jan 1

**Output:**
- ✅ TWO events: Both kept in calendar
- 🔍 Flagged as potential duplicate with confidence: "medium" (4 hours apart)
- 📊 status.json includes:
  ```json
  {
    "potentialDuplicates": [{
      "summary": "Team Meeting",
      "date": "2024-01-01",
      "confidence": "medium",
      "instances": [
        {"feedId": "feed-a", "time": "2024-01-01T10:00:00Z", "location": "..."},
        {"feedId": "feed-b", "time": "2024-01-01T14:00:00Z", "location": "..."}
      ]
    }]
  }
  ```

### Example 2: Case Variations (NEW BEHAVIOR)

**Input:**
- Feed A: "daily standup" at 9:00 AM
- Feed B: "Daily Standup" at 9:00 AM
- Feed C: "DAILY STANDUP" at 9:15 AM

**Output:**
- ✅ THREE events: All kept in calendar
- 🔍 Flagged as potential duplicate with confidence: "high" (15 min window)
- 📊 User can review and decide if these are truly the same

### Example 3: Multi-Day Events Stay Separate (NO CHANGE)

**Input:**
- "Daily Standup" on Jan 1
- "Daily Standup" on Jan 2
- "Daily Standup" on Jan 3

**Output:**
- ✅ Three events (one per day)
- 🔍 NOT flagged as duplicates (different days)

### Example 4: Different Events Same Day (NO CHANGE)

**Input:**
- "Morning Meeting" at 10:00 AM on Jan 1
- "Afternoon Meeting" at 2:00 PM on Jan 1

**Output:**
- ✅ Two events (different summaries)
- 🔍 NOT flagged as duplicates (different names)

### Example 5: True Cross-Source Duplicate

**Input:**
- Feed A: UID=event123, "Game vs Tigers" at 7:00 PM
- Feed B: Same event with UID=event123

**Output:**
- ✅ ONE event (identity-based dedup removes true duplicate)
- 🔍 NOT flagged (was properly deduplicated, not kept)

### Example 6: Cancelled Events (NEW BEHAVIOR)

**Input:**
- Feed A: "Team Meeting" at 10:00 AM (active)
- Feed B: "Team Meeting" at 10:00 AM (STATUS:CANCELLED)

**Output:**
- ✅ ONE event: Only the active event (cancelled event filtered out entirely)
- 🔍 NOT flagged as duplicate (cancelled events removed before detection)

## Configuration

No configuration needed - duplicate detection and flagging runs automatically on every merge.

### Viewing Potential Duplicates

Potential duplicates are reported in `status.json`:

```json
{
  "potentialDuplicates": [
    {
      "summary": "Team Meeting",
      "date": "2024-01-15",
      "confidence": "high",
      "instances": [
        {
          "feedId": "school-calendar",
          "feedName": "School Calendar",
          "time": "2024-01-15T10:00:00Z",
          "location": "Room 101",
          "uid": "event-12345"
        },
        {
          "feedId": "athletics",
          "feedName": "Athletics",
          "time": "2024-01-15T10:05:00Z",
          "location": "Gym",
          "uid": "event-67890"
        }
      ]
    }
  ]
}
```

Access at: `https://<storage-account>.z13.web.core.windows.net/status.json`

## Testing

The duplicate detection logic is fully tested in `test/merge.test.ts` with coverage for:

- ✅ Potential duplicate flagging (keeps all events)
- ✅ Identity-based deduplication (removes true duplicates)
- ✅ Different-day preservation (not flagged)
- ✅ Case-insensitive matching
- ✅ Confidence level calculation (high/medium/low)
- ✅ Cross-source detection
- ✅ Whitespace trimming
- ✅ All-day event handling

## Impact on Existing Deployments

**This change may increase event count in merged calendars:**

- ❗ **BREAKING**: Events previously suppressed will now appear
- ✅ Calendars will have ALL events (including potential duplicates)
- ✅ status.json will include `potentialDuplicates` array
- ✅ Users can review flagged duplicates manually
- ⚠️ If you were relying on automatic suppression, you may see "duplicate" events

### Migration

No migration needed, but be aware:
1. Merged event count may increase after update
2. Review `potentialDuplicates` in status.json to identify duplicates
3. Consider updating source feeds to remove true duplicates at the source

## Future Enhancements

Coming in Phase 2:

1. **Reschedule Detection** - Track when event times/locations change (7-day window)
2. **Feed Change Alerts** - Alert when feeds go from N events to 0 events
3. **Manual Duplicate Management** - UI for marking events as "not a duplicate"

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
- `mergeFeedEvents()` - Main merge orchestrator, returns `MergeResult`
- `detectPotentialDuplicates()` - Flags duplicates without removing
- `calculateDuplicateConfidence()` - Determines high/medium/low confidence
- `comparePriority()` - Identity-based deduplication prioritization
- `compareEventOrder()` - Chronological sorting
- `getEventDate()` - Date extraction helper

**Return Type:**
```typescript
interface MergeResult {
  events: ParsedEvent[];           // All events (deduplicated by identity only)
  potentialDuplicates: PotentialDuplicate[];  // Flagged for review
}
```

**Performance:** O(n) time complexity where n = number of events after identity deduplication

**Memory:** Two hash maps (identity map + potential duplicate map), proportional to event count

---

## Changelog

### 2026-04-27: Major Behavior Change
- **Removed:** Automatic same-day suppression (Stage 2 deduplication)
- **Added:** Potential duplicate detection and flagging
- **Added:** Confidence levels (high/medium/low)
- **Added:** potentialDuplicates field in status.json
- **Changed:** Cancelled events now filtered entirely (never exported)
- **Impact:** Merged calendars will contain more events, but all legitimate events preserved
