# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 🎯 CRITICAL: Read These Contracts First

**Before making ANY code changes, you MUST read and follow these authoritative contracts:**

1. **[DESIGN_CONTRACTS.md](DESIGN_CONTRACTS.md)** - Design standards and code patterns (REQUIRED)
2. **[STATE_MACHINE.md](STATE_MACHINE.md)** - Operational state transitions and contracts
3. **[REQUIREMENTS_CLARIFICATION.md](REQUIREMENTS_CLARIFICATION.md)** - User requirements and decisions
4. **[PLATFORM_INTEGRATION_NOTES.md](PLATFORM_INTEGRATION_NOTES.md)** - Platform-specific behavior

**These contracts are authoritative. All code must conform to these standards.**

**Contract Hierarchy:**
- DESIGN_CONTRACTS.md > STATE_MACHINE.md > REQUIREMENTS_CLARIFICATION.md > This file

**If you find code that violates these contracts, fix it to comply.**

---

## ✅ Before You Code Checklist

**When implementing ANY feature:**

- [ ] Read relevant contracts in DESIGN_CONTRACTS.md
- [ ] Check if pattern exists in codebase (follow existing patterns)
- [ ] Verify state machine implications (STATE_MACHINE.md)
- [ ] Follow API response format (Contract 1)
- [ ] Use standard error codes (Contract 2)
- [ ] Follow logging standards (Contract 4 - underscore_case events)
- [ ] Validate input before type casting (Contract 6)
- [ ] Add tests for new functionality (Contract 13)
- [ ] Update documentation
- [ ] Maintain backward compatibility (Contract 15)

**When modifying existing code:**

- [ ] Verify change doesn't violate established contracts
- [ ] Check for state machine implications
- [ ] Ensure duplicate detection contract honored (Contract 7)
- [ ] Ensure reschedule detection contract honored (Contract 8)
- [ ] Ensure feed change thresholds not modified (Contract 9)
- [ ] Update tests to reflect changes
- [ ] Update documentation

**Common Mistakes to Avoid:**

1. ❌ Suppressing duplicate events (MUST flag only, not remove)
2. ❌ Using 502 status for application errors (use 500)
3. ❌ Casting types without validation
4. ❌ Swallowing errors silently
5. ❌ Using camelCase for log events (MUST be underscore_case)
6. ❌ Logging full feed URLs (security - MUST redact)
7. ❌ Modifying refresh schedule without platform research
8. ❌ Adding required fields to existing interfaces (breaks compatibility)

---

## Project Overview

`calendarmerge` is an Azure Functions v4 application that merges multiple ICS calendar feeds into unified output calendars with intelligent duplicate detection. It publishes both ICS files and Schedule-X JSON feeds to Azure Blob Storage, along with a public read-only Schedule-X calendar viewer.

**Key Design Principles (from DESIGN_CONTRACTS.md):**
- Explicit over implicit
- Consistency over cleverness
- Contracts over comments
- Fail-safe over fail-fast (serve stale data rather than nothing)
- Observable over opaque (everything traceable)

## Common Development Commands

### Build and Test
```powershell
# Install dependencies
npm ci

# Build backend TypeScript
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build frontend (React)
npm run build:frontend

# Install frontend dependencies
npm install:frontend

# Run frontend dev server
npm run dev:frontend
```

### Local Development
```powershell
# Copy example settings
Copy-Item local.settings.example.json local.settings.json

# Start Azure Functions runtime locally
func start
# Or
npm start
```

Local endpoints when running:
- `GET http://localhost:7071/api/status` - Service health check
- `POST http://localhost:7071/api/refresh` - Manual refresh trigger

### Azure Deployment
```powershell
# Provision Azure infrastructure (Bicep)
powershell -ExecutionPolicy Bypass -File .\scripts\azure\bootstrap.ps1

# Deploy functions to Azure
powershell -ExecutionPolicy Bypass -File .\scripts\azure\deploy-functions.ps1
```

### Feed Migration
```powershell
# Migrate feeds from SOURCE_FEEDS_JSON to Table Storage
npx tsx scripts/migrate-feeds-to-table.ts
```

## Established Contracts & Standards

### API Response Format (Contract 1 - DESIGN_CONTRACTS.md)

**ALL API endpoints MUST return standardized responses:**

```typescript
// Success
{ requestId: string, status: "success", data: T, message?: string }

// Error
{ requestId: string, status: "error", error: { code: string, message: string, details?: string } }
```

**Use helper functions from `api-types.ts`:**
- `createSuccessResponse(requestId, data, message?)`
- `createErrorResponse(requestId, code, message, details?)`

**HTTP Status Codes:**
- 200 (success), 201 (created), 400 (validation), 404 (not found), 409 (conflict), 500 (internal), 503 (unavailable)
- NEVER use 502 for application errors (only for actual bad gateway scenarios)

### Error Handling (Contract 2 - DESIGN_CONTRACTS.md)

**Use standard error codes from `ERROR_CODES` in api-types.ts:**
- `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`

**NEVER swallow errors silently:**
```typescript
// BAD
try { await operation(); } catch { /* silent! */ }

// GOOD
try { await operation(); } catch (error) {
  logger.warn("operation_fallback", { error: errorMessage(error) });
  return fallbackValue;
}
```

### Logging Standards (Contract 4 - DESIGN_CONTRACTS.md)

**Event naming MUST use underscore_case:**
```
{resource}_{action}_{outcome}

Examples:
- feed_create_succeeded
- refresh_started
- calendar_publish_failed
```

**All loggers MUST include context:**
```typescript
// API handlers
const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

// Refresh operations
const logger = createLogger(context).withContext(refreshId).setCategory("refresh");
```

### Validation Contract (Contract 6 - DESIGN_CONTRACTS.md)

**NEVER cast types without validation:**
```typescript
// BAD
const body = (await request.json()) as CreateFeedRequest;

// GOOD
const validation = validateCreateFeedRequest(await request.json());
if (!validation.valid) {
  return createErrorResponse(requestId, ERROR_CODES.VALIDATION_ERROR, ...);
}
const body = validation.data; // Now safely typed
```

## Architecture

### Core Flow
1. **Timer Trigger** (`timerRefresh.ts`) - Runs every 30 minutes by default (configurable via `REFRESH_SCHEDULE`)
2. **Fetch Feeds** (`fetchFeeds.ts`) - Downloads ICS files from source URLs with retries and timeout
3. **Parse ICS** (`ics.ts`) - Parses ICS format into `ParsedEvent` objects
4. **Merge & Detect** (`merge.ts`) - Identity-based deduplication + potential duplicate flagging:
   - Removes true duplicates (same UID or identical details)
   - Flags potential duplicates (same summary + date) but KEEPS all events
   - Returns `MergeResult` with events and potentialDuplicates
5. **Filter** (`publicCalendars.ts` + `eventSnapshot.ts`) - Removes cancelled events and reschedule markers
6. **Detect Changes** (`eventSnapshot.ts`) - Compares with previous snapshots (7-day window)
7. **Generate Outputs** (`publicCalendars.ts`) - Creates sanitized ICS and Schedule-X JSON
8. **Publish** (`blobStore.ts`) - Writes both calendars + JSON to Azure Blob Storage `$web` container
9. **Calculate State** (`refresh.ts`) - Determines operational state (healthy/degraded/failed)
10. **Save Status** (`blobStore.ts`) - Writes status.json with full diagnostics

### Key Components

**Azure Functions** (`src/functions/`)
- `timerRefresh.ts` - Scheduled refresh job
- `manualRefresh.ts` - HTTP endpoint for manual refresh
- `feedsList.ts` / `feedCreate.ts` / `feedUpdate.ts` / `feedDelete.ts` - REST API for feed management
- `health.ts` - Health check endpoint
- `settingsGet.ts` / `settingsUpdate.ts` - Refresh settings API

**Core Libraries** (`src/lib/`)
- `refresh.ts` - Orchestrates entire refresh workflow with failure handling
- `merge.ts` - Implements two-stage deduplication and event prioritization
- `ics.ts` - ICS parsing and serialization (handles folded lines, VEVENT blocks)
- `publicCalendars.ts` - Strips sensitive fields (ATTENDEE, ORGANIZER, CONTACT) before publishing
- `eventFilter.ts` - Filters events (e.g., "games-only" mode)
- `sourceFeeds.ts` - Loads feeds from Table Storage or `SOURCE_FEEDS_JSON`
- `blobStore.ts` - Azure Blob Storage operations using managed identity
- `tableStore.ts` - Azure Table Storage operations for feed management

**Frontend** (`frontend/`)
- React app for feed management UI
- Deployed to `$web/manage/` in Blob Storage
- Stores Function key in browser localStorage for authenticated operations

### Storage Architecture

**Azure Blob Storage (`$web` container)**
- `calendar.ics` - Full merged calendar
- `calendar-games.ics` - Games-only filtered calendar
- `schedule-x-full.json` - Schedule-X event data (full calendar)
- `schedule-x-games.json` - Schedule-X event data (games only)
- `status.json` - Service health and diagnostics
- `index.html` - Public Schedule-X viewer
- `manage/` - Feed management UI

**Azure Table Storage**
- `SourceFeeds` table - User-managed feed sources (when `ENABLE_TABLE_STORAGE=true`)
- `Settings` table - Runtime settings like refresh schedule

## Important Patterns

### Duplicate Detection (Contract 7 - DESIGN_CONTRACTS.md)

**CRITICAL: Duplicate detection behavior was fundamentally changed in Phase 1.**

The merge logic in `merge.ts` implements identity-based deduplication and potential duplicate flagging:

1. **Identity-based deduplication (REMOVES events):**
   - Uses SHA256 hash of UID (or fallback: summary+time+location+source)
   - Removes true duplicates with same identityKey
   - Priority: higher sequence > later update > non-cancelled > more detailed

2. **Potential duplicate flagging (KEEPS all events):**
   - Detects events with same summary + date but DIFFERENT identityKey
   - Assigns confidence: high (<15 min apart), medium (15min-2hrs), low (>2hrs)
   - Results included in `status.json` under `potentialDuplicates`
   - **DOES NOT suppress events** - all events are kept

**CONTRACT: NEVER suppress events based on same summary + date alone.**

See [DUPLICATE_DETECTION.md](DUPLICATE_DETECTION.md) for complete details and examples.

### Cancelled Event Filtering
Events are filtered out entirely (never exported) if:
- `cancelled: true` status field
- Summary contains "cancelled" or "canceled"
- Description contains cancellation keywords
- LeagueApps reschedule markers ("RESCHEDULED" in summary)

Filtered count tracked in `status.json` under `cancelledEventsFiltered`.

### Reschedule Detection (Contract 8 - DESIGN_CONTRACTS.md)

**CONTRACT: Only track events in 7-day future window.**

Events are tracked for changes between refresh cycles:
- **Time changes:** start or end time modified
- **Location changes:** location string changed
- **7-day window:** now < event.start ≤ now + 7 days
- Results in `status.json` under `rescheduledEvents`
- Event snapshots stored in `status.json` for next comparison

**Implementation:** `src/lib/eventSnapshot.ts`
- `createSnapshotMap()` - Creates snapshots (7-day window only)
- `detectRescheduledEvents()` - Compares current vs previous
- `isLeagueAppsRescheduleMarker()` - Platform-specific detection

**CONTRACT: Snapshots MUST be pruned to 7-day window to prevent unbounded growth.**

### Feed Change Detection (Contract 9 - DESIGN_CONTRACTS.md)

**CONTRACT: Track and alert on feed event count changes.**

**Change types and thresholds (codified):**
- `events-to-zero` (warning): previousCount > 0 && currentCount === 0
- `zero-to-events` (info): previousCount === 0 && currentCount > 0
- `significant-drop` (warning): currentCount < previousCount * 0.5
- `significant-increase` (info): currentCount > previousCount * 2

**Results in:**
- `feedChangeAlerts` array in status.json
- `suspectFeeds` array (feed IDs with 0 events)
- Degradation reasons when severity is warning

**CONTRACT: Off-season (0 events) is NOT a failure - it's a suspect condition.**

### Operational State & Failure Handling
The refresh workflow implements a three-tier health model:

**States:**
- 🟢 **Healthy**: All feeds succeed, all calendars published
- 🟡 **Degraded**: Operational with issues (some feeds failed, partial publish, stale data, 0-event feeds, reschedules detected)
- 🔴 **Failed**: Not operational (all feeds failed, no calendars published, status write failed)

**Partial Failure Recovery:**
- If some feeds fail and a previous calendar exists → keeps last known good, logs errors, marks degraded
- If all feeds fail → keeps last known good, marks failed
- If no previous calendar exists and at least one feed succeeds → publishes partial calendar
- `status.json` is always written, even on complete failure (if write fails, service is marked failed)

**Degradation Reasons:**
Specific explanations in `degradationReasons` array:
- "N feed(s) failed: FeedName1, FeedName2"
- "Serving last-known-good data (stale calendar)"
- "Games calendar failed to publish"
- "N feed(s) returned 0 events: FeedName"
- "FeedName: events to zero (X → 0)"
- "N event(s) rescheduled (time or location changed)"

See [STATE_MACHINE.md](STATE_MACHINE.md) for complete state transitions.

### Public Calendar Sanitization
Before publishing, events are sanitized in `publicCalendars.ts`:
- Strips: `ATTENDEE`, `ORGANIZER`, `CONTACT`, `DESCRIPTION`
- Strips: `X-MS-OLK-*` properties
- Retains: Location, summary, times, UID, sequence
- Schedule-X output generates synthetic descriptions with source info

### ICS Parsing
The ICS parser in `ics.ts`:
- Handles line folding (RFC 5545)
- Skips nested components inside VEVENT (e.g., VALARM)
- Parses both DATE and DATE-TIME formats
- Handles timezone-aware and UTC timestamps
- Uses Luxon for date/time operations

## Configuration

### Required Settings
- `OUTPUT_STORAGE_ACCOUNT` - Azure Storage account name
- `SOURCE_FEEDS_JSON` - JSON array of feeds (required unless `ENABLE_TABLE_STORAGE=true`)

### Key Optional Settings
- `ENABLE_TABLE_STORAGE` - Set to `true` to load feeds from Table Storage
- `OUTPUT_BASE_URL` - Public base URL (defaults to blob URL)
- `REFRESH_SCHEDULE` - NCRONTAB expression (default: `0 */15 * * * *`)
- `FETCH_TIMEOUT_MS` - Per-request timeout (default: 10000)
- `FETCH_RETRY_COUNT` - Retries after initial attempt (default: 2)

Configuration is loaded in `config.ts` from environment variables or `local.settings.json`.

## Feed Management

### Enable/Disable Feeds
Feeds can be disabled without deletion:
- Set `enabled: false` in Table Storage or config
- Disabled feeds are filtered out during `loadSourceFeeds()`
- Disabled count logged in refresh logs

### Feed Validation
When a feed URL is updated via API:
- Feed is fetched and validated before saving
- Validation checks: HTTP status, ICS parsing, event count
- Returns: event count, date range, sample events, detected platform
- Update rejected if validation fails
- Automatic refresh triggered if URL changes or feed is enabled

### Platform Detection
Feed URLs are analyzed to detect source platform:
- GameChanger, TeamSnap, SportsEngine, LeagueApps, TeamLinkt, SportsConnect, ArbiterSports
- Detected platform shown in validation results
- See [PLATFORM_INTEGRATION_NOTES.md](PLATFORM_INTEGRATION_NOTES.md) for platform details

### Feed Change Alerts
Feed event count changes are tracked and reported:
- **events-to-zero**: Feed went from N events to 0 (warning)
- **zero-to-events**: Feed recovered from 0 to N events (info)
- **significant-drop**: Event count dropped >50% (warning)
- **significant-increase**: Event count increased >2x (info)

Alerts appear in `status.json` under `feedChangeAlerts`.

### Recommended Polling Intervals
Based on platform research (see PLATFORM_INTEGRATION_NOTES.md):
- GameChanger: 30 minutes
- TeamSnap: 60 minutes
- SportsEngine: 30 minutes
- LeagueApps: 120 minutes (reschedules create separate events)
- TeamLinkt: 60 minutes
- SportsConnect: 60 minutes
- ArbiterSports: 60 minutes

Default: 30 minutes (safe for most platforms)

## Testing

Tests use Vitest and cover:
- Duplicate detection (identity-based + same-day)
- Event prioritization (cancelled vs active, location presence, sequence numbers)
- Public artifact sanitization
- All-day event handling
- Malformed ICS rejection
- Schedule-X JSON generation

Run specific test file:
```powershell
npx vitest run test/merge.test.ts
```

## TypeScript Configuration

- **Target**: ES2022
- **Module**: CommonJS (for Azure Functions v4)
- **Output**: `dist/` directory
- **Strict mode**: Enabled
- **Include**: `src/**/*.ts`, `test/**/*.ts`

## CI/CD

GitHub Actions workflow at `.github/workflows/calendarmerge-functions.yml`:
- Triggers on push to `main`
- Builds and tests backend
- Deploys to Azure Functions via zip deployment
- Builds frontend and deploys to Blob Storage `$web/manage/`
- Uses Azure-managed deployment credentials (OIDC)

Required GitHub variables:
- `AZ_RESOURCE_GROUP`
- `AZ_FUNCTIONAPP_NAME`
- `AZ_STORAGE_ACCOUNT`

## Local Development Prerequisites

- Node.js 22+ (LTS)
- Azure Functions Core Tools v4
- Azure CLI (for deployment)
- Azurite or Azure Storage connection string (for `AzureWebJobsStorage`)

## Authentication & Security

- **Function endpoints**: Protected with Function keys (except health/status endpoints)
- **Blob Storage**: Uses managed identity with `Storage Blob Data Contributor` role
- **Table Storage**: Uses connection string from `AzureWebJobsStorage`
- **Frontend**: Stores Function key in browser localStorage for write operations

## Troubleshooting

- If Functions can't write blobs → Verify managed identity has `Storage Blob Data Contributor`
- If local runtime fails → Set `AzureWebJobsStorage` to Azurite or real connection string
- If feeds fail → Check `status.json` for per-feed errors
- To rollback → Redeploy previous commit with `deploy-functions.ps1` and trigger manual refresh
- If tests fail → Check that changes don't violate DESIGN_CONTRACTS.md
- If monitoring alerts wrong → Review MONITORING_GUIDE.md for correct queries

---

## Quick Contract Reference

**When you need to know:**

| What | Check This Document | Contract # |
|------|---------------------|------------|
| API response format | DESIGN_CONTRACTS.md | Contract 1 |
| Error handling | DESIGN_CONTRACTS.md | Contract 2 |
| HTTP status codes | DESIGN_CONTRACTS.md | Contract 1 |
| Type organization | DESIGN_CONTRACTS.md | Contract 3 |
| Logging event names | DESIGN_CONTRACTS.md | Contract 4 |
| State machine rules | STATE_MACHINE.md | Contract 5 |
| Validation patterns | DESIGN_CONTRACTS.md | Contract 6 |
| Duplicate detection | DUPLICATE_DETECTION.md | Contract 7 |
| Reschedule detection | DESIGN_CONTRACTS.md | Contract 8 |
| Feed change thresholds | DESIGN_CONTRACTS.md | Contract 9 |
| Naming conventions | DESIGN_CONTRACTS.md | Contract 10 |
| Platform handling | PLATFORM_INTEGRATION_NOTES.md | Contract 11 |
| status.json schema | DESIGN_CONTRACTS.md | Contract 12 |
| Testing standards | DESIGN_CONTRACTS.md | Contract 13 |
| Backward compatibility | DESIGN_CONTRACTS.md | Contract 15 |

---

## Contract Enforcement

**Before committing code:**

1. Run `npm run build` - Must pass with no errors
2. Run `npm test` - All 80+ tests must pass
3. Review DESIGN_CONTRACTS.md - Verify compliance
4. Check backward compatibility - No breaking changes without documentation
5. Update tests for new functionality
6. Update documentation

**Code review checklist:**

- [ ] API responses follow standard envelope
- [ ] Error codes from ERROR_CODES enum
- [ ] Log events use underscore_case
- [ ] No type casting without validation
- [ ] No silent error swallowing
- [ ] State transitions follow STATE_MACHINE.md
- [ ] Duplicate detection follows contract (flag, not suppress)
- [ ] Feed URLs redacted in logs
- [ ] Tests added
- [ ] Documentation updated

---

## Document Reference Map

**Architecture & Design:**
- DESIGN_CONTRACTS.md - Authoritative design standards
- STATE_MACHINE.md - State transition contracts
- DUPLICATE_DETECTION.md - Duplicate handling contract

**Requirements & Research:**
- REQUIREMENTS_CLARIFICATION.md - User requirements (source of truth)
- PLATFORM_INTEGRATION_NOTES.md - Platform behavior and polling

**Implementation:**
- IMPLEMENTATION_SUMMARY.md - Phase 1 details
- PHASE2_SUMMARY.md - Phase 2 details
- COMPLETE_IMPLEMENTATION.md - Full project summary

**Operations:**
- MONITORING_GUIDE.md - Alert rules and dashboards
- DEPLOYMENT_GUIDE.md - Deployment procedures

**User-Facing:**
- README.md - Feature overview and setup
- QUICK_START.md - Fast setup guide

**When in doubt, start with DESIGN_CONTRACTS.md.**
