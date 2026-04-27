# Calendar Merge Service - State Machine

This document defines the complete state machine for the calendar merge service, including all possible states, transitions, and conditions.

---

## Service Operational States

### Three-Level State Model

```
┌─────────────────────────────────────────────────────────┐
│                    OPERATIONAL STATE                    │
│  (Most Critical - determines if system is usable)       │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
    ┌───▼───┐        ┌────▼────┐      ┌────▼────┐
    │HEALTHY│        │DEGRADED │      │ FAILED  │
    │ 🟢    │        │  🟡     │      │  🔴     │
    └───────┘        └─────────┘      └─────────┘
```

### State Definitions

#### 🟢 HEALTHY
- **Condition:** All systems functioning correctly
- **Criteria:**
  - All feeds fetched successfully
  - All events merged without issues
  - Both calendars (full + games) published successfully
  - status.json written successfully
- **Alert Level:** None
- **User Impact:** None - system working as designed

#### 🟡 DEGRADED
- **Condition:** System operational but with some issues
- **Criteria (any of):**
  - Some feeds failed (but at least 1 succeeded)
  - One calendar published, one failed
  - Using last-known-good data (servedLastKnownGood = true)
  - Feed returned 0 events (suspect condition)
  - Significant event count drop detected
- **Alert Level:** Warning
- **User Impact:** Data may be incomplete or stale but usable

#### 🔴 FAILED
- **Condition:** System not operational
- **Criteria (any of):**
  - All feeds failed to fetch
  - Publishing failed completely (no calendars updated)
  - status.json write failed (can't report status)
  - No successful refresh in last 6 hours
- **Alert Level:** Critical
- **User Impact:** No data available or severely outdated

---

## Refresh State Machine

### States

```
      START
        │
        ▼
   ┌─────────┐
   │TRIGGERED│ ── settings check fails ─> [continue with defaults]
   └────┬────┘
        │
        ▼
   ┌─────────┐
   │ PENDING │ ── concurrent request ──> [reuse in-flight]
   └────┬────┘
        │
        ▼
   ┌──────────┐
   │ FETCHING │ ─┬─> Feed 1: success ─┐
   └──────────┘  ├─> Feed 2: failed   ├─> Aggregate
                 └─> Feed N: success ─┘
                            │
                            ▼
                     ┌─────────────┐
                     │   MERGING   │
                     └──────┬──────┘
                            │
                ┌───────────┼───────────┐
                │                       │
            All feeds          Some/all feeds
            failed             succeeded
                │                       │
                ▼                       ▼
         ┌──────────┐          ┌───────────────┐
         │PUBLISHING│          │  PUBLISHING   │
         │  SKIPPED │          │   PARTIAL/    │
         └─────┬────┘          │   COMPLETE    │
               │               └───────┬───────┘
               │                       │
               └───────┬───────────────┘
                       │
                       ▼
                ┌─────────────┐
                │   WRITING   │
                │  STATUS.JSON│
                └──────┬──────┘
                       │
            ┌──────────┼──────────┐
            │                     │
        Success                Failed
            │                     │
            ▼                     ▼
       ┌────────┐           ┌────────┐
       │COMPLETE│           │ ERROR  │
       │  🟢    │           │  🔴    │
       └────────┘           └────────┘
```

### State Transitions

#### 1. TRIGGERED → PENDING
- **Trigger:** Timer fires OR manual refresh API call
- **Actions:**
  - Check settings (schedule, minimum interval)
  - Generate refreshId (UUID)
  - Generate requestId (UUID)
  - Check for in-flight refresh
- **Next State:**
  - If in-flight exists → REUSING
  - If settings block → SKIPPED
  - Else → FETCHING

#### 2. PENDING → REUSING
- **Condition:** `activeRefresh` promise exists
- **Actions:**
  - Log reuse event
  - Return existing promise
  - Include original refreshId in response
- **Next State:** Wait for existing refresh to complete

#### 3. PENDING → SKIPPED
- **Condition:** Settings minimum interval not met
- **Actions:**
  - Log skip reason
  - Update `lastSkippedRefresh` timestamp
  - Return cached status
- **Next State:** COMPLETE (no-op)

#### 4. FETCHING → MERGING
- **Always transitions** regardless of feed success/failure
- **Actions:**
  - Collect all feed results (success + failed)
  - Calculate successfulResults and failedStatuses
  - Track per-feed event counts
  - Detect 0-event conditions
  - Compare with previous event counts
- **Data Collected:**
  ```typescript
  {
    successfulResults: FeedRunResult[];
    failedStatuses: FeedStatus[];
    feedChangeAlerts: FeedChangeAlert[];
  }
  ```

#### 5. MERGING → PUBLISHING
- **Condition:** `successfulResults.length > 0`
- **Actions:**
  - Identity-based deduplication
  - Flag potential duplicates (same summary + day)
  - Detect reschedules (UID match with changed time/location)
  - Filter cancelled events
  - Generate public artifacts
- **Next State:**
  - If `successfulResults.length === 0` → PUBLISHING SKIPPED
  - Else → PUBLISHING

#### 6. PUBLISHING → WRITING STATUS
- **Always transitions** regardless of publish success/failure
- **Actions:**
  - Attempt to write full calendar + JSON
  - Attempt to write games calendar + JSON
  - Track individual success/failure per artifact
  - Set `calendarPublished` flags
  - Calculate operational state
- **Artifacts Written:**
  - `calendar.ics` (conditional)
  - `schedule-x-full.json` (conditional)
  - `calendar-games.ics` (conditional)
  - `schedule-x-games.json` (conditional)

#### 7. WRITING STATUS → COMPLETE/ERROR
- **Actions:**
  - Build ServiceStatus object
  - Calculate operational state
  - Write status.json
  - Send monitoring notifications
- **Next State:**
  - If status.json write succeeds → COMPLETE
  - If status.json write fails → ERROR

---

## Feed States

Each feed goes through its own lifecycle during FETCHING phase:

```
   START
     │
     ▼
┌─────────┐
│FETCHING │
└────┬────┘
     │
     ├─> Attempt 1 ─┬─> Success ──────> PARSING
     │              │
     │              └─> Fail ─> Wait ─> Attempt 2 ─┬─> Success ──> PARSING
     │                                              │
     │                                              └─> Fail ─> FAILED
     │
     ▼
┌─────────┐
│ PARSING │
└────┬────┘
     │
     ├─> Valid ICS ──────> SUCCESS (eventCount >= 0)
     │
     └─> Invalid ICS ────> FAILED
```

### Feed Success Conditions
```typescript
{
  ok: true,
  httpStatus: 200-299,
  eventCount: number, // Can be 0!
  durationMs: number,
  attemptedAt: string
}
```

### Feed Failure Conditions
```typescript
{
  ok: false,
  error: string,
  httpStatus?: number, // May be undefined for network errors
  attemptedAt: string,
  durationMs: number,
  eventCount: 0
}
```

### Special Feed Conditions

#### Zero Events (Suspect)
```typescript
{
  ok: true,
  eventCount: 0,
  suspect: true, // NEW FIELD
  previousEventCount: number, // From last successful check
  message: "Feed returned 0 events (previously had X events)"
}
```

---

## Publishing State Machine

Publishing happens in parallel for two calendar types:

```
   PUBLISHING START
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Full Cal   Games Cal
    │         │
    ├─> ICS   ├─> ICS
    │         │
    ├─> JSON  ├─> JSON
    │         │
    ▼         ▼
 Success?  Success?
```

### Publishing Outcomes Matrix

| Full Cal | Games Cal | Operational State | lastSuccessfulRefresh         |
|----------|-----------|-------------------|-------------------------------|
| ✅        | ✅         | HEALTHY           | Both timestamps updated       |
| ✅        | ❌         | DEGRADED          | Full updated, games unchanged |
| ❌        | ✅         | DEGRADED          | Games updated, full unchanged |
| ❌        | ❌         | FAILED            | Neither updated               |

### Atomic Publishing Semantics

**Current Behavior (to be improved):**
- ICS write succeeds, JSON write fails → Inconsistent state (orphaned ICS)

**Proposed Behavior:**
- Write ICS to temp location
- Write JSON to temp location
- If both succeed → Move both to final locations (atomic-ish)
- If either fails → Clean up temps, use last-known-good

**Implementation:**
```typescript
async function publishCalendarAtomically(
  ics: string,
  json: object,
  icsPath: string,
  jsonPath: string
): Promise<PublishResult> {
  const tempIcs = `${icsPath}.temp-${Date.now()}`;
  const tempJson = `${jsonPath}.temp-${Date.now()}`;

  try {
    await writeBlob(tempIcs, ics);
    await writeBlob(tempJson, JSON.stringify(json));

    // Both succeeded, commit
    await copyBlob(tempIcs, icsPath);
    await copyBlob(tempJson, jsonPath);

    return { success: true };
  } catch (error) {
    // Cleanup temps
    await safeDeleteBlob(tempIcs);
    await safeDeleteBlob(tempJson);

    return {
      success: false,
      error: errorMessage(error),
      usedLastKnownGood: await blobExists(icsPath)
    };
  } finally {
    // Always cleanup temps
    await safeDeleteBlob(tempIcs);
    await safeDeleteBlob(tempJson);
  }
}
```

---

## Status.json State Schema

### Enhanced Status Structure

```typescript
interface EnhancedServiceStatus {
  // Core identification
  serviceName: string;
  refreshId: string; // NEW: UUID for this refresh run

  // Operational state (NEW)
  operationalState: "healthy" | "degraded" | "failed";
  degradationReasons: string[]; // Why we're degraded

  // Legacy compatibility
  state: "success" | "partial" | "failed";
  healthy: boolean; // Deprecated, use operationalState

  // Timestamps - Enhanced
  lastAttemptedRefresh: string;
  lastSuccessfulCheck: {
    fullCalendar?: string;
    gamesCalendar?: string;
    combined?: string; // Only when both succeed
  };
  checkAgeHours: {
    fullCalendar?: number;
    gamesCalendar?: number;
  };

  // Event counts
  sourceFeedCount: number;
  mergedEventCount: number;
  gamesOnlyMergedEventCount: number;
  candidateMergedEventCount?: number; // On partial/failed

  // Publishing status
  calendarPublished: boolean;
  gamesOnlyCalendarPublished: boolean;
  servedLastKnownGood: boolean;

  // Feed details
  sourceStatuses: EnhancedFeedStatus[];
  feedChangeAlerts: FeedChangeAlert[]; // NEW
  suspectFeeds: string[]; // NEW: Feed IDs with 0 events

  // Event insights (NEW)
  potentialDuplicates: PotentialDuplicate[];
  rescheduledEvents: RescheduledEvent[];
  cancelledEventsFiltered: number; // Count of filtered cancelled events

  // Output paths
  output: OutputPaths;

  // Errors
  errorSummary: string[];
}

interface EnhancedFeedStatus extends FeedStatus {
  previousEventCount?: number; // NEW
  suspect: boolean; // NEW: true if eventCount = 0 but previousEventCount > 0
  consecutiveFailures: number; // NEW: Track failure streaks
}

interface FeedChangeAlert {
  feedId: string;
  feedName: string;
  change: "events-to-zero" | "zero-to-events" | "significant-drop" | "significant-increase";
  previousCount: number;
  currentCount: number;
  percentChange: number;
  timestamp: string;
  severity: "info" | "warning" | "error";
}

interface PotentialDuplicate {
  summary: string;
  date: string; // YYYY-MM-DD
  instances: Array<{
    feedId: string;
    feedName: string;
    time: string;
    location: string;
    uid: string;
  }>;
  confidence: "high" | "medium" | "low"; // Based on similarity
}

interface RescheduledEvent {
  uid: string;
  summary: string;
  feedId: string;
  feedName: string;
  changes: {
    time?: { from: string; to: string };
    location?: { from: string; to: string };
  };
  detectedAt: string;
}
```

---

## State Transition Examples

### Example 1: Healthy Refresh

```
Input: 3 feeds, all succeed
Flow:
  TRIGGERED
  → PENDING (no in-flight)
  → FETCHING (all feeds succeed)
  → MERGING (50 events merged)
  → PUBLISHING (both calendars succeed)
  → WRITING STATUS (success)
  → COMPLETE

Output:
  operationalState: "healthy"
  state: "success"
  healthy: true
  calendarPublished: true
  gamesOnlyCalendarPublished: true
  mergedEventCount: 50
  gamesOnlyMergedEventCount: 15
```

### Example 2: Degraded (Partial Failure)

```
Input: 3 feeds, 1 fails
Flow:
  TRIGGERED
  → PENDING
  → FETCHING (Feed 1: success, Feed 2: fail, Feed 3: success)
  → MERGING (35 events from 2 feeds)
  → PUBLISHING (both calendars succeed with partial data)
  → WRITING STATUS (success)
  → COMPLETE

Output:
  operationalState: "degraded"
  degradationReasons: ["Feed 'School Calendar' failed: HTTP 404"]
  state: "partial"
  healthy: false (CHANGED FROM OLD BEHAVIOR)
  calendarPublished: true
  gamesOnlyCalendarPublished: true
  mergedEventCount: 35
  candidateMergedEventCount: 35
  errorSummary: ["School Calendar: HTTP 404 Not Found"]
```

### Example 3: Degraded (0 Events)

```
Input: 1 feed returns 0 events (previously had 20)
Flow:
  TRIGGERED
  → PENDING
  → FETCHING (Feed 1: success, eventCount=0)
  → MERGING (0 events)
  → PUBLISHING SKIPPED (but lastCalendar exists)
  → WRITING STATUS (success)
  → COMPLETE

Output:
  operationalState: "degraded"
  degradationReasons: ["Feed 'Athletics' returned 0 events (previously 20)"]
  state: "partial"
  calendarPublished: false
  servedLastKnownGood: true
  suspectFeeds: ["athletics"]
  feedChangeAlerts: [{
    feedId: "athletics",
    change: "events-to-zero",
    previousCount: 20,
    currentCount: 0,
    severity: "warning"
  }]
```

### Example 4: Failed (All Feeds Fail)

```
Input: 3 feeds, all fail
Flow:
  TRIGGERED
  → PENDING
  → FETCHING (all timeout)
  → MERGING (0 events)
  → PUBLISHING SKIPPED
  → WRITING STATUS (success)
  → COMPLETE

Output:
  operationalState: "failed"
  degradationReasons: [
    "All feeds failed",
    "No calendars published"
  ]
  state: "failed"
  healthy: false
  calendarPublished: false
  gamesOnlyCalendarPublished: false
  servedLastKnownGood: true
  errorSummary: [
    "Feed1: Request timeout",
    "Feed2: Request timeout",
    "Feed3: Request timeout"
  ]
```

### Example 5: Failed (status.json Write Fails)

```
Input: All feeds succeed, calendars publish, but status write fails
Flow:
  TRIGGERED
  → PENDING
  → FETCHING (all succeed)
  → MERGING (50 events)
  → PUBLISHING (success)
  → WRITING STATUS (FAILS - blob storage error)
  → ERROR

Output:
  operationalState: "failed"
  degradationReasons: ["Unable to write status"]
  state: "failed"
  healthy: false
  calendarPublished: true
  gamesOnlyCalendarPublished: true
  errorSummary: ["Failed to write status.json: BlobStorageError"]
```

---

## Monitoring Alert Rules

### 🔴 Critical Alerts (Page Immediately)

1. **System Not Operational**
   - Condition: `operationalState === "failed"`
   - Duration: Immediate
   - Action: Page on-call

2. **No Successful Refresh in 6 Hours**
   - Condition: `Date.now() - lastSuccessfulCheck.combined > 6 * 60 * 60 * 1000`
   - Duration: Sustained 10 minutes
   - Action: Page on-call

3. **Status.json Write Failures**
   - Condition: `errorSummary.includes("status.json")`
   - Duration: 2 consecutive failures
   - Action: Page on-call

### 🟡 Warning Alerts (Investigate During Business Hours)

4. **Degraded State**
   - Condition: `operationalState === "degraded"`
   - Duration: Sustained 1 hour
   - Action: Create ticket

5. **Feed Failures**
   - Condition: `feed.consecutiveFailures >= 3`
   - Duration: Sustained 30 minutes
   - Action: Notify team

6. **Events to Zero**
   - Condition: `feedChangeAlerts includes "events-to-zero"`
   - Duration: Immediate
   - Action: Notify team

7. **Significant Event Drop**
   - Condition: `percentChange < -50%`
   - Duration: Sustained 2 refreshes
   - Action: Notify team

8. **Partial Publishing**
   - Condition: `calendarPublished XOR gamesOnlyCalendarPublished`
   - Duration: Sustained 3 refreshes
   - Action: Create ticket

### 🟢 Info Alerts (Log Only)

9. **Potential Duplicates Detected**
   - Condition: `potentialDuplicates.length > 0`
   - Action: Log for review

10. **Reschedules Detected**
    - Condition: `rescheduledEvents.length > 0`
    - Action: Log and display to users

---

## Next Steps

1. ✅ Document state machine (this file)
2. ⏳ Implement EnhancedServiceStatus types
3. ⏳ Update refresh.ts with new state tracking
4. ⏳ Add feed change detection
5. ⏳ Implement duplicate flagging
6. ⏳ Add reschedule detection
7. ⏳ Build monitoring dashboard
8. ⏳ Create integration tests for all states

---

## Changelog

- **2026-04-27**: Initial state machine definition based on requirements clarification
