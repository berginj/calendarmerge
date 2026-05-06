# Design Contracts & Code Standards

**Version:** 1.0
**Date:** 2026-04-27
**Status:** Authoritative - All code must follow these contracts

This document establishes the design contracts, coding standards, and patterns that MUST be followed throughout this codebase. These contracts were established based on comprehensive requirements clarification and codebase review.

---

## Core Principles

1. **Explicit Over Implicit** - State intent clearly in types and code
2. **Consistency Over Cleverness** - Predictable patterns over clever solutions
3. **Contracts Over Comments** - Types and interfaces define behavior
4. **Fail-Safe Over Fail-Fast** - Degrade gracefully, serve stale data over nothing
5. **Observable Over Opaque** - Everything should be traceable and debuggable

---

## Contract 1: API Response Format

### Standard Response Envelope

**ALL API endpoints MUST return this structure:**

```typescript
// Success Response
interface SuccessResponse<T> {
  requestId: string;              // REQUIRED - UUID for tracing
  status: "success";              // REQUIRED - Always "success" for 2xx
  data: T;                        // REQUIRED - Operation-specific payload
  message?: string;               // OPTIONAL - Human-readable summary
  metadata?: ResponseMetadata;    // OPTIONAL - Additional context
}

// Partial Success Response (for operations that partially succeeded)
interface PartialSuccessResponse<T> {
  requestId: string;
  status: "partial-success";
  data: T;
  warnings: string[];             // REQUIRED - What partially failed
  message?: string;
}

// Error Response
interface ErrorResponse {
  requestId: string;              // REQUIRED - UUID for tracing
  status: "error";                // REQUIRED - Always "error" for 4xx/5xx
  error: {
    code: string;                 // REQUIRED - Machine-readable (VALIDATION_ERROR, NOT_FOUND, etc.)
    message: string;              // REQUIRED - Human-readable
    details?: string;             // OPTIONAL - Technical details for debugging
    validationErrors?: Record<string, string[]>;  // OPTIONAL - Field-specific errors
  };
}

// Metadata for operational responses
interface ResponseMetadata {
  refreshId?: string;             // For refresh operations
  operationDuration?: number;     // Milliseconds
  affectedResources?: string[];   // IDs of resources changed
}
```

### HTTP Status Code Usage

**MUST use these status codes correctly:**

| Code | Use Case | When to Use |
|------|----------|-------------|
| 200 | Success | Operation completed successfully |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Client error - validation failed, malformed input |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists, duplicate ID |
| 500 | Internal Server Error | Server-side error, unhandled exception |
| 503 | Service Unavailable | Downstream dependency failed (storage, etc.) |

**MUST NOT use:**
- 502 Bad Gateway (unless truly proxying another service)
- 422 Unprocessable Entity (use 400 instead for validation)

### Examples

**GET /api/feeds - List Feeds**
```typescript
// Success
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "data": {
    "feeds": [...],
    "count": 3
  }
}

// Error
{
  "requestId": "550e8400-e29b-41d4-a716-446655440001",
  "status": "error",
  "error": {
    "code": "STORAGE_UNAVAILABLE",
    "message": "Failed to load feeds from storage",
    "details": "TableStore connection timeout after 30s"
  }
}
```

**POST /api/feeds - Create Feed**
```typescript
// Success
{
  "requestId": "...",
  "status": "success",
  "data": {
    "feed": {
      "id": "athletics",
      "name": "Athletics",
      "url": "https://...",
      "enabled": true
    }
  },
  "message": "Feed created successfully"
}

// Validation Error
{
  "requestId": "...",
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Feed validation failed",
    "validationErrors": {
      "name": ["Feed name must be a non-empty string"],
      "url": ["Feed URL must use http, https, or webcal protocol"]
    }
  }
}
```

**POST /api/refresh - Manual Refresh**
```typescript
// Partial Success (some feeds failed)
{
  "requestId": "...",
  "status": "partial-success",
  "data": {
    "refreshId": "...",
    "operationalState": "degraded",
    "eventCount": 45,
    "gamesOnlyEventCount": 12,
    "sourceStatuses": [...],
    "feedChangeAlerts": [...],
    "potentialDuplicates": [...],
    "rescheduledEvents": [...]
  },
  "warnings": [
    "1 feed(s) failed: School Calendar",
    "Athletics: events to zero (20 → 0)"
  ],
  "metadata": {
    "refreshId": "...",
    "operationDuration": 4523
  }
}
```

**GET /api/status/internal - Protected Admin Status**
```typescript
// Success
{
  "requestId": "...",
  "status": "success",
  "data": {
    "status": {
      "serviceName": "calendarmerge",
      "refreshId": "...",
      "operationalState": "healthy",
      "sourceStatuses": [...],
      "feedChangeAlerts": [...],
      "potentialDuplicates": [...],
      "rescheduledEvents": [...]
    }
  }
}
```

`/api/status/internal` MUST require Function auth, MUST redact feed URLs, and MUST NOT return `eventSnapshots`.

---

## Contract 2: Error Handling Standards

### Error Codes (Machine-Readable)

**MUST use these standard error codes:**

```typescript
export const ERROR_CODES = {
  // Client Errors (4xx)
  VALIDATION_ERROR: "VALIDATION_ERROR",           // 400 - Input validation failed
  INVALID_REQUEST: "INVALID_REQUEST",             // 400 - Malformed request
  NOT_FOUND: "NOT_FOUND",                         // 404 - Resource not found
  CONFLICT: "CONFLICT",                           // 409 - Resource already exists

  // Server Errors (5xx)
  INTERNAL_ERROR: "INTERNAL_ERROR",               // 500 - Unhandled exception
  STORAGE_ERROR: "STORAGE_ERROR",                 // 500 - Blob/Table storage failure
  FEED_FETCH_ERROR: "FEED_FETCH_ERROR",          // 500 - Failed to fetch external feed
  PARSE_ERROR: "PARSE_ERROR",                     // 500 - Failed to parse ICS
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",     // 503 - Temporary unavailability
} as const;
```

### Error Handling Pattern

**MUST follow this pattern in all handlers:**

```typescript
async function myHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  try {
    // 1. Parse and validate input
    const input = await validateRequest(request, MyRequestSchema);

    // 2. Execute business logic
    const result = await doBusinessLogic(input, logger);

    // 3. Return success response
    return createSuccessResponse(requestId, result);

  } catch (error) {
    // 4. Handle error with appropriate categorization
    return handleError(requestId, error, logger);
  }
}
```

### Error Categorization

**MUST categorize errors appropriately:**

```typescript
// Validation errors → 400 + VALIDATION_ERROR
if (validationFailed) {
  return createErrorResponse(requestId, 400, "VALIDATION_ERROR", message, { validationErrors });
}

// Not found → 404 + NOT_FOUND
if (!resource) {
  return createErrorResponse(requestId, 404, "NOT_FOUND", `Feed ${id} not found`);
}

// Storage failures → 503 + SERVICE_UNAVAILABLE (transient)
catch (StorageError) {
  return createErrorResponse(requestId, 503, "SERVICE_UNAVAILABLE", "Storage temporarily unavailable");
}

// Unhandled → 500 + INTERNAL_ERROR
catch (error) {
  return createErrorResponse(requestId, 500, "INTERNAL_ERROR", "An unexpected error occurred");
}
```

### Error Logging

**MUST log errors with context:**

```typescript
// GOOD
logger.error("feed_create_failed", {
  requestId,
  feedId,
  error: errorMessage(error),
  errorType: error.constructor.name,
  stack: error instanceof Error ? error.stack : undefined,
});

// BAD - Missing context
logger.error("error", { error: errorMessage(error) });
```

### Silent Failures

**MUST NOT swallow errors silently:**

```typescript
// BAD
try {
  const status = await readStatus();
} catch {
  // Silent failure!
}

// GOOD
try {
  const status = await readStatus();
} catch (error) {
  logger.warn("status_read_fallback", {
    error: errorMessage(error),
    fallback: "using default status",
  });
  return defaultStatus();
}
```

---

## Contract 3: Type System Standards

### Type Organization

**MUST organize types by domain:**

```typescript
// src/lib/types.ts - Domain types (business logic)
export interface SourceFeedConfig { ... }
export interface ParsedEvent { ... }
export interface ServiceStatus { ... }

// src/lib/api-types.ts - API contract types (NEW FILE)
export interface CreateFeedRequest { ... }
export interface UpdateFeedRequest { ... }
export interface FeedResponse { ... }
export interface RefreshResponse { ... }

// src/lib/validation-schemas.ts - Runtime validation (NEW FILE)
export const CreateFeedSchema = { ... }
export const UpdateFeedSchema = { ... }
```

### Type Definitions

**Request/Response types MUST be explicit:**

```typescript
// GOOD - Explicit request type
export interface CreateFeedRequest {
  id?: string;        // Optional - auto-generated if not provided
  name: string;       // Required - non-empty
  url: string;        // Required - valid http/https/webcal URL
  enabled?: boolean;  // Optional - defaults to true
}

// BAD - Loose typing
interface UpdateFeedRequest {
  name?: string;
  url?: string;
  enabled?: boolean;
  // No constraints documented!
}
```

### Optional Fields Documentation

**MUST document when optional fields are set:**

```typescript
export interface FeedStatus {
  id: string;
  name: string;
  ok: boolean;
  eventCount: number;

  // Set when feed fetch failed
  error?: string;
  httpStatus?: number;

  // Set when we have historical data (after first successful refresh)
  previousEventCount?: number;

  // Set when ok=true AND eventCount=0 AND previousEventCount>0
  suspect?: boolean;

  // Always set (0 if never failed)
  consecutiveFailures: number; // Should NOT be optional
}
```

### Avoid Type Casting Without Validation

**MUST validate before casting:**

```typescript
// BAD
const body = (await request.json()) as CreateFeedRequest;

// GOOD
const rawBody = await request.json();
const validation = validateCreateFeedRequest(rawBody);
if (!validation.valid) {
  return errorResponse(400, "VALIDATION_ERROR", validation.errors);
}
const body = validation.data; // Now safely typed
```

---

## Contract 4: Logging Standards

### Event Naming Convention

**MUST use underscore_case for all log event names:**

```
{resource}_{action}_{outcome}

Resources: feed, calendar, status, settings, refresh
Actions: create, update, delete, fetch, publish, validate, load
Outcomes: started, succeeded, failed, skipped, ignored
```

**Examples:**
```typescript
logger.info("feed_create_started", { feedId });
logger.info("feed_create_succeeded", { feedId, eventCount });
logger.error("feed_create_failed", { feedId, error });

logger.info("feed_validation_started", { feedId, url });
logger.info("feed_validation_succeeded", { feedId, eventCount, platform });
logger.warn("feed_validation_failed", { feedId, error });

logger.info("refresh_started", { reason, feedCount, refreshId });
logger.info("refresh_finished", { refreshId, state, duration });

logger.info("calendar_publish_started", { blobPath });
logger.info("calendar_publish_succeeded", { blobPath, size });
logger.error("calendar_publish_failed", { blobPath, error });
```

### Log Context Requirements

**All loggers MUST include:**
- `requestId` for API operations
- `refreshId` for refresh operations
- Appropriate category

```typescript
// API handlers
const logger = createLogger(context)
  .withContext(undefined, requestId)
  .setCategory("api");

// Refresh operations
const logger = createLogger(context)
  .withContext(refreshId, undefined)
  .setCategory("refresh");

// Feed operations within refresh
const logger = refreshLogger.setCategory("feed");
```

### Log Levels

**MUST use appropriate log levels:**

- **info**: Normal operations, state transitions, successful completions
- **warn**: Degraded conditions, fallbacks used, recoverable errors
- **error**: Failures requiring attention, unrecoverable errors
- **debug**: Detailed operational data (use sparingly - performance cost)

**Examples:**
```typescript
logger.info("feed_fetch_succeeded", { feedId, eventCount, durationMs });
logger.warn("feed_returned_zero_events", { feedId, previousCount });
logger.error("feed_fetch_failed", { feedId, error, httpStatus });
logger.debug("feed_parse_details", { feedId, eventProperties });
```

### Performance Logging

**SHOULD log operation duration for key operations:**

```typescript
const startTime = Date.now();
// ... operation ...
const durationMs = Date.now() - startTime;

logger.info("operation_completed", {
  operation: "feed_fetch",
  feedId,
  durationMs,
  success: true,
});
```

---

## Contract 5: State Management

### Operational State Contract

**Service state MUST follow this state machine:**

```
                    HEALTHY
                      │
        ┌─────────────┼─────────────┐
        │                           │
   Some failure              All feeds fail
   OR stale data             OR no publish
        │                           │
        ▼                           ▼
    DEGRADED ────────────────▶   FAILED
        │                           │
        └─────── Recovery ──────────┘
                    │
                    ▼
                 HEALTHY
```

**State Definitions (Contract):**

```typescript
// HEALTHY: Service fully operational
operationalState = "healthy" when:
- All feeds fetched successfully
- Both calendars published successfully
- No stale data being served
- No degradation conditions

// DEGRADED: Service operational but with issues
operationalState = "degraded" when:
- Some feeds failed (but at least one succeeded)
- Only one calendar published successfully
- Using last-known-good (stale) data
- Feeds returning 0 events (suspect condition)
- Significant feed event count changes detected
- Reschedules detected (informational degradation)

// FAILED: Service not operational
operationalState = "failed" when:
- All feeds failed to fetch
- No calendars could be published
- status.json write failed (can't report status)
```

### Degradation Reasons Contract

**MUST provide specific degradation reasons:**

```typescript
// Format: "{count} {resource}(s) {condition}: {details}"

Examples:
"1 feed(s) failed: School Calendar"
"2 feed(s) returned 0 events: Athletics, Band"
"Serving last-known-good data (stale calendar)"
"Games calendar failed to publish"
"Athletics: events to zero (20 → 0)"
"3 event(s) rescheduled (time or location changed)"
```

**Reasons MUST be actionable** - Operators should know what to investigate.

---

## Contract 6: Validation Standards

### Input Validation Contract

**ALL API handlers MUST validate input before processing:**

```typescript
// 1. Define request schema
interface CreateFeedRequest {
  id?: string;      // Optional - pattern: ^[a-z0-9-]+$
  name: string;     // Required - non-empty, max 100 chars
  url: string;      // Required - valid HTTP/HTTPS/webcal URL
  enabled?: boolean; // Optional - defaults to true
}

// 2. Create validation function
function validateCreateFeedRequest(input: unknown): ValidationResult<CreateFeedRequest> {
  const errors: Record<string, string[]> = {};

  // Validate each field
  // Return typed result or errors

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, data: input as CreateFeedRequest };
}

// 3. Use in handler
const validation = validateCreateFeedRequest(await request.json());
if (!validation.valid) {
  return createErrorResponse(requestId, 400, "VALIDATION_ERROR", "Invalid input", {
    validationErrors: validation.errors,
  });
}
const body = validation.data; // Now safely typed
```

### Validation Result Type

**MUST use this standard validation result:**

```typescript
type ValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; errors: Record<string, string[]> };
```

### Feed URL Validation Contract

**Feed URLs MUST:**
- Use http, https, or webcal protocol
- Be valid absolute URLs
- Be treated as bearer tokens (security)

**Normalization:**
```typescript
// webcal://example.com/cal.ics → https://example.com/cal.ics
// webcals://example.com/cal.ics → https://example.com/cal.ics
```

---

## Contract 7: Duplicate Detection Behavior

**Established in Phase 1 - This is now the authoritative contract:**

### Identity-Based Deduplication (Removes Events)

**MUST remove duplicate events when:**
- Same `identityKey` (SHA256 of UID or summary+time+location+source)

**Priority when choosing which to keep:**
1. Higher `sequence` number (more recent update)
2. Later `updatedSortValue` (more recent timestamp)
3. Non-cancelled over cancelled
4. More properties (richer data)

### Potential Duplicate Detection (Flags But Keeps Events)

**MUST flag but NOT remove events when:**
- Same normalized summary (trimmed, lowercase)
- Same date (YYYY-MM-DD)
- Different `identityKey` (not truly identical)

**Confidence levels:**
- **High**: Time difference ≤15 minutes
- **Medium**: Time difference 15min-2hrs
- **Low**: Time difference >2hrs

### Cancelled Event Filtering (Removes Events)

**MUST filter events when:**
- `cancelled: true` field
- Summary contains: "cancelled", "canceled", "cancelled:", "canceled:"
- Description contains: "cancelled", "canceled"
- Summary contains: "rescheduled" (LeagueApps marker)

**Filtered events MUST:**
- Never appear in ICS output
- Never appear in Schedule-X JSON
- Be counted in `cancelledEventsFiltered`

---

## Contract 8: Reschedule Detection

**Established in Phase 2 - This is the authoritative contract:**

### 7-Day Future Window

**MUST only track events within:**
- Start time > now
- Start time ≤ now + 7 days

**Rationale:** Balance between useful detection and noise/storage.

### Change Detection Contract

**MUST detect and report when:**
- Time changes: `event.start.iso !== previousSnapshot.startTime` OR `event.end.iso !== previousSnapshot.endTime`
- Location changes: `event.location.trim() !== previousSnapshot.location.trim()`

**MUST include in rescheduledEvents:**
```typescript
{
  uid: string;               // Event identifier
  summary: string;           // Event title
  feedId: string;           // Source feed ID
  feedName: string;         // Source feed name
  changes: {
    time?: { from: string; to: string };
    location?: { from: string; to: string };
  };
  detectedAt: string;       // ISO timestamp
}
```

### Snapshot Storage Contract

**MUST store snapshots:**
- In private internal status storage under `eventSnapshots`
- Only for events in 7-day future window
- As Record<uid, EventSnapshot>
- Overwritten on each refresh

**Snapshot MUST include:**
```typescript
{
  uid: string;
  summary: string;
  sourceId: string;
  sourceName: string;
  startTime: string;  // ISO
  endTime?: string;   // ISO
  location: string;
  capturedAt: string; // ISO
}
```

---

## Contract 9: Feed Change Detection

**Established in Phase 2 - This is the authoritative contract:**

### Change Types

**MUST detect these change types:**

```typescript
type FeedChangeType =
  | "events-to-zero"        // Warning: Had events, now has 0
  | "zero-to-events"        // Info: Recovered from 0
  | "significant-drop"      // Warning: >50% drop
  | "significant-increase"; // Info: >2x increase
```

### Thresholds (Codified)

```typescript
// Significant drop
currentCount < previousCount * 0.5 && previousCount > 0

// Significant increase
currentCount > previousCount * 2 && previousCount > 0

// Events-to-zero (highest priority)
previousCount > 0 && currentCount === 0

// Zero-to-events (recovery)
previousCount === 0 && currentCount > 0
```

### Alert Severity Mapping

**MUST use these severity levels:**

| Change Type | Severity | Rationale |
|-------------|----------|-----------|
| events-to-zero | warning | Likely broken feed or off-season |
| zero-to-events | info | Recovery, good news |
| significant-drop | warning | Potential data loss or feed issue |
| significant-increase | info | Season started or feed fixed |

### Alert Structure Contract

```typescript
{
  feedId: string;
  feedName: string;
  change: FeedChangeType;
  previousCount: number;
  currentCount: number;
  percentChange: number;    // Rounded to integer
  timestamp: string;        // ISO
  severity: "info" | "warning" | "error";
}
```

---

## Contract 10: Naming Conventions

### File Naming

**MUST use camelCase:**
- `feedCreate.ts` ✓
- `eventSnapshot.ts` ✓
- `tableStore.ts` ✓

**NOT:**
- `feed_create.ts` ✗
- `FeedCreate.ts` ✗

### Function Naming

**MUST use camelCase:**
- Handler functions: `createFeedHandler`, `manualRefreshHandler`
- Utility functions: `generateId`, `normalizeFeedUrl`
- Predicate functions: `isGameLikeEvent`, `isCancelledEvent`
- Builder functions: `buildPublicCalendarArtifacts`, `buildOutputPaths`

### Type Naming

**MUST use PascalCase:**
- Interfaces: `SourceFeedConfig`, `FeedValidationResult`
- Types: `RefreshState`, `OperationalState`
- Enums/Constants: `ERROR_CODES`, `DEFAULT_REFRESH_SCHEDULE`

### Variable Naming

**MUST use camelCase:**
- Local variables: `feedId`, `requestId`, `eventCount`
- Parameters: `config`, `logger`, `request`

**MUST be descriptive:**
```typescript
// GOOD
const enhancedSourceResults = sourceResults.map(...)
const previousEventCounts = new Map<string, number>()

// BAD
const results = sourceResults.map(...)
const counts = new Map()
```

### Log Event Naming

**MUST use underscore_case:**
```
{resource}_{action}_{outcome}

feed_create_started
feed_create_succeeded
feed_create_failed

refresh_started
refresh_finished

calendar_publish_succeeded
```

**MUST NOT mix conventions:**
```typescript
// BAD
"feedCreateSucceeded"  // camelCase
"feed-create-succeeded" // kebab-case
```

---

## Contract 11: Platform Integration Standards

**Based on PLATFORM_INTEGRATION_NOTES.md:**

### Feed URL Security

**MUST treat feed URLs as bearer tokens:**
- MUST NOT log full URLs
- MUST redact query strings in logs
- MUST use `redactFeedUrl()` for logging
- SHOULD store encrypted if possible
- MUST NOT expose in public responses

```typescript
// GOOD
logger.info("feed_fetching", {
  feedId,
  url: redactFeedUrl(feed.url), // https://example.com/calendar.ics (query removed)
});

// BAD
logger.info("feed_fetching", {
  feedId,
  url: feed.url, // Exposes token!
});
```

### Polling Interval Contract

**MUST respect these minimum intervals:**

| Platform | Minimum Interval | Recommended | Rationale |
|----------|------------------|-------------|-----------|
| GameChanger | 15 minutes | 30 minutes | No documented limits |
| TeamSnap | 30 minutes | 60 minutes | 6-month window suggests slow updates |
| SportsEngine | 30 minutes | 30 minutes | Backend refreshes every 30 min |
| LeagueApps | 60 minutes | 120 minutes | Google updates once daily |
| Other | 15 minutes | 30 minutes | Conservative default |

**Default MUST be 30 minutes** (current setting - do not change without research)

### LeagueApps Special Handling Contract

**MUST filter events with "RESCHEDULED" in summary:**

```typescript
if (isLeagueAppsRescheduleMarker(event)) {
  // Filter from output completely
  // Count in cancelledEventsFiltered
  // Do NOT export to calendars
}
```

**Rationale:** LeagueApps creates separate new events for reschedules. Old marker events must not appear.

### Platform Detection Contract

**MUST detect platforms from URL patterns:**

```typescript
function detectPlatformFromUrl(url: string): string | undefined {
  const lower = url.toLowerCase();

  if (lower.includes("gc.com") || lower.includes("gamechanger")) return "GameChanger";
  if (lower.includes("teamsnap.com")) return "TeamSnap";
  // ... etc

  return undefined; // Unknown platform - handle as generic ICS
}
```

**Platform value MUST be used for:**
- Logging (helps debug platform-specific issues)
- Validation responses (user feedback)
- Future: Platform-specific handling

---

## Contract 12: Status Contracts

Public and admin status are separate contracts. Public status is served from static Blob Storage as `status.json` and MUST contain only public-safe service health, output metadata, and aggregate counts. Admin status is served through a Function-auth endpoint and may include operational diagnostics after sanitization.

### Public `status.json`

**Public URL:** `https://{storage}.z13.web.core.windows.net/status.json`

**MUST include only public-safe fields:**

```typescript
interface PublicServiceStatus {
  // Core (REQUIRED)
  serviceName: string;
  refreshId?: string;

  // State (REQUIRED)
  operationalState: OperationalState; // "healthy" | "degraded" | "failed"
  degradationReasons?: string[];      // REQUIRED when degraded/failed
  state: RefreshState;                // Legacy - still required
  healthy: boolean;                   // Legacy - still required

  // Timestamps (REQUIRED)
  lastAttemptedRefresh: string;                 // ISO timestamp
  lastSuccessfulRefresh?: string;               // Legacy - deprecated
  lastSuccessfulCheck: CalendarTimestamps;      // NEW - per-calendar
  checkAgeHours: CalendarAges;                  // NEW - staleness

  // Counts (REQUIRED)
  sourceFeedCount: number;
  mergedEventCount: number;
  gamesOnlyMergedEventCount: number;
  candidateMergedEventCount?: number;  // Only on partial/failed

  // Publishing (REQUIRED)
  calendarPublished: boolean;
  gamesOnlyCalendarPublished: boolean;
  servedLastKnownGood: boolean;

  // Public aggregate insights
  cancelledEventsFiltered?: number;

  // Output (REQUIRED)
  output: OutputPaths;

  // Errors (REQUIRED)
  errorSummary: string[];
}
```

**Public status MUST NOT include:**
- `sourceStatuses`
- `feedChangeAlerts`
- `suspectFeeds`
- `potentialDuplicates`
- `rescheduledEvents`
- `eventSnapshots`
- raw feed URLs or private calendar tokens
- stack traces, storage credentials, or private event details

### Protected Admin Status

**Protected URL:** `GET /api/status/internal`

The endpoint MUST use the standard success/error envelope and return `{ status: AdminServiceStatus }` in `data`.

```typescript
interface AdminServiceStatus extends Omit<ServiceStatus, "eventSnapshots"> {
  sourceStatuses: FeedStatus[];         // URLs redacted before return
  feedChangeAlerts?: FeedChangeAlert[];
  suspectFeeds?: string[];
  potentialDuplicates?: PotentialDuplicate[];
  rescheduledEvents?: RescheduledEvent[];
  cancelledEventsFiltered?: number;
}
```

**Admin status MUST:**
- Require Function auth.
- Read from private internal status storage, falling back to starting status when absent.
- Redact feed URLs before returning `sourceStatuses`.
- Exclude `eventSnapshots` by default.
- Preserve diagnostics needed by the management UI.

**Fields marked REQUIRED MUST always be present on their respective contract.**
**Fields marked OPTIONAL may be omitted when not applicable.**

---

## Contract 13: Testing Standards

### Test Organization

**MUST organize tests by type:**

```
test/
├── unit/              # Pure logic tests (lib/)
│   ├── merge.test.ts
│   ├── eventFilter.test.ts
│   └── eventSnapshot.test.ts
├── integration/       # Multi-component tests
│   └── refresh-scenarios.test.ts
├── contract/          # API contract tests
│   └── api-responses.test.ts (TODO)
└── e2e/              # Full workflow tests
    └── end-to-end.test.ts (TODO)
```

### Test Naming

**MUST use descriptive test names:**

```typescript
// GOOD
it("should filter events with 'cancelled' in summary")
it("should detect time changes within 7-day window")
it("should generate events-to-zero alert when feed drops to 0")

// BAD
it("filters cancelled events")
it("detects changes")
it("works")
```

### Test Coverage Requirements

**MUST test:**
- All public functions
- All state transitions
- All validation rules
- All error paths
- Integration scenarios

**Current gaps:**
- No API handler tests (feedCreate, feedUpdate, etc.)
- No contract tests for response schemas
- No end-to-end workflow tests

---

## Contract 14: Code Organization

### Module Responsibilities (Codified)

```typescript
// src/functions/ - HTTP handlers ONLY
// Responsibilities:
// - Parse HTTP request
// - Validate input
// - Call business logic
// - Format HTTP response
// - Handle errors
// MUST NOT contain business logic

// src/lib/refresh.ts - Refresh orchestration
// Responsibilities:
// - Coordinate refresh workflow
// - Call feed fetching, merging, publishing
// - Calculate operational state
// - Generate status
// MUST NOT handle HTTP

// src/lib/merge.ts - Event merging
// Responsibilities:
// - Deduplicate by identity
// - Detect potential duplicates
// - Sort events
// MUST be pure functions (no I/O)

// src/lib/feedValidation.ts - Feed validation
// Responsibilities:
// - Fetch feed URL
// - Validate ICS format
// - Detect platform
// - Return validation result
// MUST NOT modify data

// src/lib/types.ts - Type definitions
// Responsibilities:
// - Define domain types
// - Export all shared interfaces
// MUST NOT contain logic

// src/lib/api-types.ts - API contracts (NEW)
// Responsibilities:
// - Define request/response types
// - Document API contracts
// MUST NOT contain domain logic
```

### Import Organization

**MUST organize imports:**

```typescript
// 1. External dependencies
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

// 2. Internal lib (relative imports)
import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { generateId, errorMessage } from "../lib/util";

// 3. Types (last)
import type { SourceFeedConfig } from "../lib/types";
```

### Inline Imports

**Current pattern (dynamic imports) - Document WHY:**

```typescript
// feedCreate.ts
const { TableStore } = await import("../lib/tableStore");

// WHY? Appears to be for cold-start optimization
// Azure Functions lazy-loads dependencies
```

**Contract: If using dynamic imports, MUST document reason at top of file:**
```typescript
/**
 * Uses dynamic imports for TableStore to reduce cold-start time.
 * TableStore is only needed when ENABLE_TABLE_STORAGE=true.
 */
```

---

## Contract 15: Backward Compatibility

**THIS IS CRITICAL:**

### Version Guarantee

**MUST maintain backward compatibility for:**
- All fields in `ServiceStatus`
- All API response shapes
- All public output formats (ICS, JSON)

### Deprecation Process

**When deprecating a field:**

1. Mark as deprecated in types:
   ```typescript
   /** @deprecated Use lastSuccessfulCheck instead */
   lastSuccessfulRefresh?: string;
   ```

2. Continue populating for at least 3 months

3. Add migration guide to documentation

4. Only remove after confirming no consumers

### Adding New Fields

**New fields MUST be optional:**

```typescript
// GOOD - New field is optional
export interface ServiceStatus {
  existingField: string;
  newField?: string;  // Optional - backward compatible
}

// BAD - New required field breaks consumers
export interface ServiceStatus {
  existingField: string;
  newField: string;  // Required - BREAKING CHANGE
}
```

---

## Modern Design Patterns to Adopt

### Pattern 1: Result Type for Operations

```typescript
// Instead of throwing or returning null/undefined
type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

// Usage
function parseEvent(ics: string): Result<ParsedEvent, ParseError> {
  try {
    const event = parse(ics);
    return { success: true, value: event };
  } catch (error) {
    return {
      success: false,
      error: { code: "PARSE_ERROR", message: errorMessage(error) },
    };
  }
}
```

### Pattern 2: Builder Pattern for Complex Objects

```typescript
// For complex status construction
class StatusBuilder {
  private status: Partial<ServiceStatus> = {};

  withRefreshId(id: string) {
    this.status.refreshId = id;
    return this;
  }

  withOperationalState(state: OperationalState, reasons: string[]) {
    this.status.operationalState = state;
    this.status.degradationReasons = reasons.length > 0 ? reasons : undefined;
    return this;
  }

  build(): ServiceStatus {
    // Validate all required fields present
    return this.status as ServiceStatus;
  }
}
```

### Pattern 3: Discriminated Unions for API Responses

```typescript
type ApiResponse<T> =
  | SuccessResponse<T>
  | PartialSuccessResponse<T>
  | ErrorResponse;

// TypeScript can discriminate on 'status' field
function handleResponse(response: ApiResponse<FeedData>) {
  if (response.status === "success") {
    // response.data is typed as FeedData
  } else if (response.status === "error") {
    // response.error is typed as ErrorDetail
  }
}
```

### Pattern 4: Fluent Validation

```typescript
// Chain validations for readability
const validation = new Validator(input)
  .required("name", isNonEmptyString)
  .required("url", isFeedUrl)
  .optional("enabled", isBoolean)
  .validate();

if (!validation.valid) {
  return errorResponse(requestId, 400, "VALIDATION_ERROR", validation.errors);
}
```

### Pattern 5: Higher-Order Function for Handlers

```typescript
// Wrap common boilerplate
function wrapApiHandler<TInput, TOutput>(
  handler: (input: TInput, context: HandlerContext) => Promise<TOutput>,
  schema: Schema<TInput>,
) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const requestId = generateId();
    const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

    try {
      const validation = validateInput(await request.json(), schema);
      if (!validation.valid) {
        return createErrorResponse(requestId, 400, "VALIDATION_ERROR", "Invalid input", {
          validationErrors: validation.errors,
        });
      }

      const result = await handler(validation.data, { request, context, logger, requestId });

      return createSuccessResponse(requestId, result);
    } catch (error) {
      return handleError(requestId, error, logger);
    }
  };
}

// Usage
app.http("createFeed", {
  methods: ["POST"],
  authLevel: "function",
  route: "feeds",
  handler: wrapApiHandler(createFeedLogic, CreateFeedSchema),
});
```

---

## Enforcement Checklist

**Before merging any PR, verify:**

- [ ] API responses follow standard envelope (Contract 1)
- [ ] Error codes are from ERROR_CODES list (Contract 2)
- [ ] Request/response types in api-types.ts (Contract 3)
- [ ] Log events use underscore_case (Contract 4)
- [ ] Validation before type casting (Contract 6)
- [ ] State transitions follow state machine (Contract 5)
- [ ] Backward compatibility maintained (Contract 15)
- [ ] Tests added for new functionality (Contract 13)
- [ ] Documentation updated
- [ ] No silent error swallowing

---

## Reference Hierarchy

**When making decisions, consult in this order:**

1. **This Document (DESIGN_CONTRACTS.md)** - Authoritative design standards
2. **STATE_MACHINE.md** - State transition contracts
3. **REQUIREMENTS_CLARIFICATION.md** - User requirements
4. **PLATFORM_INTEGRATION_NOTES.md** - Platform-specific behavior
5. **CLAUDE.md** - Development guidance
6. **README.md** - Feature documentation

**If conflict exists:** This document (DESIGN_CONTRACTS.md) takes precedence.

---

## Migration Plan for Existing Code

**Priority 1 (Critical Consistency):**
1. Standardize API response envelopes
2. Audit HTTP status code usage against this contract
3. Add error codes
4. Fix silent error swallowing

**Priority 2 (Important):**
5. Standardize log event naming
6. Move request/response types to api-types.ts
7. Create validation module
8. Add handler wrapper

**Priority 3 (Nice to Have):**
9. Extract util.ts into domain-specific modules
10. Add handler tests
11. Implement Result<T, E> pattern
12. Add performance logging

---

## Changelog

- **2026-04-27**: Initial design contracts established
  - Based on comprehensive codebase review
  - Informed by Phase 1+2 requirements
  - Informed by platform integration research
  - Captures current good patterns and identifies inconsistencies
  - Provides migration path for standardization

---

## Next Steps

1. ✅ Review this contract document
2. ⏳ Fix critical inconsistencies (Priority 1)
3. ⏳ Update CLAUDE.md to reference these contracts
4. ⏳ Create api-types.ts with request/response definitions
5. ⏳ Standardize error handling
6. ⏳ Standardize API responses
7. ⏳ Add enforcement to code review process

**This document is living** - Update as patterns evolve, but changes require careful review and team consensus.
