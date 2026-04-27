# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`calendarmerge` is an Azure Functions v4 application that merges multiple ICS calendar feeds into unified output calendars with intelligent duplicate detection. It publishes both ICS files and Schedule-X JSON feeds to Azure Blob Storage, along with a public read-only Schedule-X calendar viewer.

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

## Architecture

### Core Flow
1. **Timer Trigger** (`timerRefresh.ts`) - Runs every 15 minutes (configurable via `REFRESH_SCHEDULE`)
2. **Fetch Feeds** (`fetchFeeds.ts`) - Downloads ICS files from source URLs with retries
3. **Parse ICS** (`ics.ts`) - Parses ICS format into `ParsedEvent` objects
4. **Merge & Deduplicate** (`merge.ts`) - Two-stage deduplication:
   - Stage 1: Identity-based (UID or summary+time+location hash)
   - Stage 2: Same-day deduplication (catches cross-source duplicates)
5. **Generate Outputs** (`publicCalendars.ts`) - Creates sanitized ICS and Schedule-X JSON
6. **Publish** (`blobStore.ts`) - Writes to Azure Blob Storage `$web` container

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

### Duplicate Detection
The merge logic in `merge.ts` implements identity-based deduplication and potential duplicate flagging:

1. **Identity-based deduplication**: Uses SHA256 hash of UID (or fallback: summary+time+location)
   - Removes true duplicates with same identityKey
   - Priority: higher sequence > later update > non-cancelled > more detailed
2. **Potential duplicate flagging**: Detects events with same summary + date but KEEPS all events
   - Assigns confidence: high (<15 min apart), medium (15min-2hrs), low (>2hrs)
   - Results included in `status.json` under `potentialDuplicates`
   - Does NOT suppress events (changed in 2026-04-27)

See [DUPLICATE_DETECTION.md](DUPLICATE_DETECTION.md) for complete details.

### Cancelled Event Filtering
Events are filtered out entirely (never exported) if:
- `cancelled: true` status field
- Summary contains "cancelled" or "canceled"
- Description contains cancellation keywords
- LeagueApps reschedule markers ("RESCHEDULED" in summary)

Filtered count tracked in `status.json` under `cancelledEventsFiltered`.

### Reschedule Detection
Events in the future 7-day window are tracked for changes:
- Time changes detected (start or end time modified)
- Location changes detected
- Results in `status.json` under `rescheduledEvents`
- Event snapshots stored in `status.json` for next comparison
- See `src/lib/eventSnapshot.ts` for implementation

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
