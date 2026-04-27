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
The merge logic in `merge.ts` implements two-stage deduplication:

1. **Identity-based**: Uses SHA256 hash of UID (or fallback: summary+time+location)
2. **Same-day**: Deduplicates events with same normalized summary on same date

Priority order when choosing between duplicates:
1. Non-cancelled over cancelled
2. Has location over no location
3. More properties (richer data)
4. Higher sequence number (more recent update)
5. Earlier start time

See [DUPLICATE_DETECTION.md](DUPLICATE_DETECTION.md) for complete details.

### Failure Handling
The refresh workflow implements partial failure recovery:
- If some feeds fail and a previous calendar exists → keeps last known good, logs errors in `status.json`
- If all feeds fail → keeps last known good, marks service as "failed"
- If no previous calendar exists and at least one feed succeeds → publishes partial calendar
- `status.json` is always written, even on complete failure

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
