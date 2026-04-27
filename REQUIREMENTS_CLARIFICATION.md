# Requirements Clarification & Implementation Plan

**Date:** 2026-04-27
**Context:** Based on user feedback session to clarify contracts, outcomes, and "done" criteria

---

## Critical Requirements Clarified

### 1. Health vs. Operational State

**Definitions:**
- **Healthy**: All components working correctly (all feeds succeed, all calendars publish)
- **Operational**: System is serving data, even if stale or partial
- **Degraded**: Some components failing but system still operational

**Requirements:**
- Distinguish between "operational" (most critical) and "healthy" (ideal state)
- Partial failures should generate alerts with color-coded severity:
  - 🔴 RED: Not operational (no data being served)
  - 🟡 YELLOW: Degraded (partial failures, stale data)
  - 🟢 GREEN: Healthy (all systems working)
- Serving last-known-good data is acceptable (fail-safe) but should flag as degraded
- Status should clearly indicate operational state for monitoring systems

**Implementation Plan:**
- Add new `operationalState` field: `"healthy" | "degraded" | "failed"`
- Keep existing `healthy` boolean for backward compatibility
- Add `degradationReasons` array listing specific issues
- Update monitoring endpoints to expose operational state

---

### 2. Partial Publishing Behavior

**Requirements:**
- Mismatched calendar versions ARE acceptable (full from today, games from yesterday)
- Must flag clear error messages for troubleshooting
- Full calendar is higher priority than games calendar
- Track `lastSuccessfulRefresh` separately for EACH calendar
- Verbose logging for all publishing operations (can be tuned down later)

**Implementation Plan:**
- Change `lastSuccessfulRefresh` to:
  ```typescript
  lastSuccessfulRefresh: {
    fullCalendar?: string;
    gamesCalendar?: string;
    combined?: string; // Only when both succeed
  }
  ```
- Add `calendarAges` showing time since last publish for each
- Add detailed error messages with blob paths, error types, retry info
- Implement separate publishing status tracking per calendar

---

### 3. Last-Known-Good Semantics

**Requirements:**
- "Stale" = last successful CHECK, not last content change
- No threshold for refusing old data (fail-safe design)
- Display `lastCheckAge` in hours/days in status.json
- Consumers do NOT need staleness warnings (games calendar changes infrequently)

**Implementation Plan:**
- Rename `lastSuccessfulRefresh` → `lastSuccessfulCheck`
- Add `checkAgeHours` and `checkAgeDays` computed fields
- Track `lastContentChange` separately (when event count changes)
- Display both check age and content age in status

---

### 4. Feed Success Definition & 0-Event Handling

**Requirements:**
- 0 events = SUSPECT condition (special error category)
- Alert when feed goes from N events → 0 events
- NO minimum event count threshold (off-season is valid)
- Season cycles: ~4 months active, 8 months dormant
- **Priority**: Focus on GameChanger calendar feed integration

**Implementation Plan:**
- Track previous event count per feed
- Add `feedChangeAlerts` array in status:
  ```typescript
  {
    feedId: string;
    change: "events-to-zero" | "zero-to-events" | "significant-drop";
    previousCount: number;
    currentCount: number;
    timestamp: string;
  }
  ```
- Add `suspectFeeds` section for 0-event feeds
- Document GameChanger-specific feed patterns

---

### 5. Duplicate Detection - MAJOR CHANGE

**Current Behavior:**
- Same summary + same day → suppress duplicate (keep "best" one)

**NEW Requirements:**
- **DO NOT suppress events at different times or locations**
- Flag potential duplicates but KEEP all events
- Track and highlight events with changed times/locations (reschedules)
- **Filter out cancelled events entirely** (don't export them)

**Implementation Plan:**
- Add `potentialDuplicates` section in status.json:
  ```typescript
  {
    summary: string;
    date: string;
    instances: Array<{
      feedId: string;
      time: string;
      location: string;
      uid: string;
    }>;
  }
  ```
- Add `rescheduledEvents` tracking:
  ```typescript
  {
    uid: string;
    summary: string;
    changes: {
      time?: { from: string; to: string };
      location?: { from: string; to: string };
    };
    detectedAt: string;
  }
  ```
- Remove same-day deduplication logic from merge.ts
- Add cancelled event filter in publicCalendars.ts
- Keep identity-based deduplication only (same UID across feeds)

---

### 6. Refresh Schedule Changes

**Current:** Business hours (8 AM - 6 PM ET) with 60-min minimum

**NEW Requirements:**
- Remove business hours constraint
- Check at least 4 times per day
- Early morning pull critical (game times change overnight)
- Research throttling limits to avoid being blocked
- Default schedule should be safe for all feed providers

**Implementation Plan:**
- Research GameChanger API rate limits (and other common providers)
- Set default to every 6 hours (4x daily): `0 0 */6 * * *`
- Add configurable per-feed rate limiting
- Log all throttling/429 responses
- Document recommended schedules per provider

---

### 7. Feed Management Enhancements

**Requirements:**
- Feed URL update → immediate validation + refresh
- Validation = attempt to fetch and parse feed before saving
- Support enable/disable without deletion
- Keep existing events from old URL until next refresh

**Implementation Plan:**
- Add `enabled` boolean to SourceFeedConfig
- Add `validateFeed(url)` function called before URL updates
- Add `triggerRefreshAfterUpdate` option (default: true)
- Update feedUpdate.ts to validate before persisting
- Filter disabled feeds in loadSourceFeeds
- Track `disabledAt` timestamp for audit

---

### 8. Concurrent Refresh & Request Tracking

**Requirements:**
- Reusing in-flight refresh is sufficient
- Track request ID to distinguish "same request" vs "duplicate during processing"
- Communicate reuse behavior in response

**Proposed Solution:**
```typescript
{
  refreshId: string; // UUID for this refresh run
  requestId: string; // UUID for this API request
  reusedInFlightRefresh: boolean;
  inFlightSince?: string; // When the reused refresh started
}
```

**Implementation Plan:**
- Generate `refreshId` at start of executeRefresh
- Generate `requestId` per API call
- Track active refreshes with metadata
- Return both IDs in response
- Log request reuse events

---

### 9. Test Coverage Requirements

**Add Tests For:**
- ✅ Partial failure scenarios (some feeds succeed, some fail)
- ✅ Publishing failures (blob write errors)
- ✅ Last-known-good fallback logic
- ✅ Settings validation and refresh schedule logic
- ✅ Feed CRUD operations and validation
- ✅ Concurrent refresh handling
- ✅ Status.json generation with error summaries
- ✅ Contract tests for all API responses
- ✅ End-to-end refresh workflow

**Test Organization:**
```
test/
  integration/
    refresh-workflow.test.ts
    partial-failures.test.ts
    feed-management.test.ts
  contracts/
    api-responses.test.ts
    status-schema.test.ts
  scenarios/
    zero-events.test.ts
    reschedules.test.ts
    cancelled-events.test.ts
```

---

### 10. Completion Criteria ("Done" Definition)

**Manual Refresh Endpoint:**
- ✅ Returns status immediately after refresh completes
- ✅ status.json write succeeds
- ✅ Response includes refreshId and requestId
- ✅ Monitoring notification sent (if configured)

**Feed Creation:**
- ✅ Returns 201 after persisting to TableStore
- ❌ NO validation on creation (validate on first refresh)
- ✅ Appears in merged output on next scheduled refresh
- ✅ Logs creation event with timestamp

**Feed Update:**
- ✅ URL validation completes successfully
- ✅ Update persisted to TableStore
- ✅ Automatic refresh triggered (unless disabled)
- ✅ Response includes validation results

**Timer-Triggered Refresh:**
- ✅ Runs on schedule
- ✅ Settings check succeeds (or uses fail-safe defaults)
- ✅ status.json write succeeds
- ✅ Skipped refreshes logged with reason
- ✅ Monitoring notification sent on completion

---

## Logging & Monitoring Requirements

### Verbose Logging (Initial Phase)

**Log Everything:**
- Every feed fetch attempt (URL, duration, HTTP status, event count)
- Every deduplication decision with reason
- Every publishing operation (blob path, size, success/failure)
- Every state transition with before/after values
- Every API call with request/response summary
- Every setting check and schedule decision

**Log Format:**
```typescript
{
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  category: string; // "refresh", "feed", "publish", "api", etc.
  message: string;
  context: Record<string, any>;
  refreshId?: string;
  requestId?: string;
}
```

**Portal Accessibility:**
- Logs stored in Azure Blob Storage (append blobs)
- Endpoint: `/api/logs?hours=24&level=error&category=refresh`
- UI component in management portal showing recent logs
- Download logs as JSON or text
- Search/filter by timestamp, level, category, refreshId

### Monitoring Integration

**Metrics to Expose:**
- Operational state (healthy/degraded/failed)
- Feed success rates (per feed, last 24h)
- Calendar publish success rates
- Event count trends per feed
- Refresh duration percentiles
- Error rates by category

**Alert Triggers:**
- 🔴 System not operational (no successful refresh in 6 hours)
- 🟡 Feed changed from N events to 0
- 🟡 Feed failing for 2+ consecutive attempts
- 🟡 Publishing partially failing
- 🔴 All feeds failing
- 🟡 Significant event count drop (>50% from average)

---

## Implementation Priority

**Approach:** Full implementation with tests built alongside (not TDD, but concurrent)

### Phase 1: Critical Changes (Week 1)
1. ✅ Document requirements (this file)
2. ✅ Create state machine documentation
3. 🔄 Update duplicate detection (remove same-day suppression, add flagging)
   - Update merge.ts logic
   - Add potentialDuplicates tracking
   - Write tests for new behavior
4. 🔄 Filter cancelled events entirely
   - Update publicCalendars.ts
   - Add filter before export
   - Write tests
5. 🔄 Add operational state tracking
   - Extend ServiceStatus type
   - Add operationalState calculation
   - Add degradationReasons
   - Write tests
6. 🔄 Implement separate calendar refresh timestamps
   - Change lastSuccessfulRefresh structure
   - Add checkAgeHours calculation
   - Update refresh.ts logic
   - Write tests
7. 🔄 Add verbose logging infrastructure
   - Create structured logging system
   - Add log storage to blob
   - Create log API endpoint

### Phase 2: Feed Management (Week 2)
8. Add enable/disable capability + tests
9. Implement feed validation on update + tests
10. Trigger refresh on feed updates + tests
11. Add feed change detection (0 events, drops) + tests

### Phase 3: Monitoring & UX (Week 3)
12. Build log viewing UI in management portal
13. Add potential duplicate highlighting in status
14. Add reschedule detection (7-day window) + tests
15. Implement request ID tracking + tests
16. Update refresh schedule (4x daily, no business hours)

### Phase 4: Testing & Documentation (Week 4)
17. Create integration test suite (failure scenarios)
18. Add contract tests (API responses)
19. Write monitoring guidelines
20. Update CLAUDE.md with new contracts
21. Add state machine diagram to docs

**Status Legend:**
- ✅ Complete
- 🔄 In Progress
- ⏳ Pending

---

## Questions for Future Consideration

1. **GameChanger Integration:** 🔍 RESEARCH NEEDED
   - See RESEARCH_PROMPT.md for comprehensive research guide
   - User will research platforms and provide findings
   - Focus on: feed URL format, auth, rate limits, ICS quirks
   - Priority: GameChanger first, then TeamSnap, SportsEngine, etc.

2. **Reschedule Detection:** ✅ CLARIFIED
   - Track changes for future events within 7 days (calendars are forward-looking)
   - Store comparison data in memory during refresh (no separate table needed initially)
   - Focus on detecting changes between current refresh and previous refresh

3. **User Notifications:**
   - Should users get email/SMS alerts for reschedules?
   - Should there be a "changes since last viewed" feature?

4. **Performance:**
   - At what feed count do we need pagination?
   - Should we cache parsed events?

---

## Success Metrics

**After Implementation:**
- [ ] Zero false-positive duplicate suppressions
- [ ] All cancelled events filtered out
- [ ] Operational state accurate 100% of time
- [ ] Log viewing UI accessible within 3 clicks
- [ ] All API responses have contract tests
- [ ] Integration test coverage >80%
- [ ] Monitoring alerts working end-to-end
- [ ] Documentation complete and accurate

---

## Notes

- User context: Family sports calendar system
- Primary use case: Youth sports team schedules
- Season pattern: ~4 months active, 8 months dormant per team
- Key pain point: Game time/location changes need to be visible
- Priority: GameChanger calendar integration
