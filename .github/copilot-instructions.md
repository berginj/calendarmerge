# Copilot Instructions for calendarmerge

## Build & Test Commands

```powershell
npm ci                              # Install dependencies
npm run build                       # Build backend (TypeScript → dist/)
npm test                            # Run all tests (vitest)
npx vitest run test/merge.test.ts   # Run a single test file
npm run test:watch                  # Watch mode

# Frontend (React app in frontend/)
npm ci --prefix frontend
npm run build --prefix frontend
npm run dev --prefix frontend       # Dev server
```

## Architecture

Azure Functions v4 app that merges multiple ICS calendar feeds into unified outputs published to Azure Blob Storage.

**Core refresh flow** (orchestrated by `src/lib/refresh.ts`):
1. Load feeds from Table Storage or `SOURCE_FEEDS_JSON` env var → `sourceFeeds.ts`
2. Fetch ICS files with retries/timeout → `fetchFeeds.ts`
3. Parse ICS → `ics.ts` (handles RFC 5545 line folding, VEVENT extraction)
4. Merge with identity-based dedup (SHA256 of UID or summary+time+location+source) → `merge.ts`
5. Filter cancelled events, detect reschedules in 7-day window → `eventSnapshot.ts`
6. Generate sanitized ICS + Schedule-X JSON → `publicCalendars.ts`
7. Publish to Azure Blob Storage `$web/` container → `blobStore.ts`
8. Write `status.json` with diagnostics and operational state

**Two layers of code:**
- `src/functions/` — Azure Function handlers (HTTP + timer triggers). Thin wrappers that validate input and delegate to library code.
- `src/lib/` — Pure business logic. All merge, parse, filter, and publish logic lives here with no Azure Functions dependency.

**Frontend** (`frontend/`): React 19 + Vite + Tailwind + Radix UI. Deployed to `$web/manage/` in Blob Storage. Stores a Function key in sessionStorage for write operations until WI-014 replaces browser-held keys with real admin auth.

**Failure model:** If some feeds fail, the service keeps the last-known-good published calendar and marks state as degraded. `status.json` is always written, even on total failure.

## Key Contracts

Read `DESIGN_CONTRACTS.md` before making changes — it is the authoritative source for all patterns. Key rules:

**API responses** must use the standard envelope from `src/lib/api-types.ts`:
```typescript
createSuccessResponse(requestId, data, message?)
createErrorResponse(requestId, ERROR_CODES.XXX, message, details?)
```
Never use HTTP 502 for application errors. Use `ERROR_CODES` constants, not string literals.

**Input validation:** Never cast request bodies directly (`as T`). Use validation functions that return `ValidationResult<T>` and check `.valid` before proceeding.

**Logging:** Event names must be `underscore_case` in the pattern `{resource}_{action}_{outcome}` (e.g., `feed_create_succeeded`, `calendar_publish_failed`). Always create loggers with context:
```typescript
const logger = createLogger(context).withContext(refreshId).setCategory("refresh");
```
Never log full feed URLs (security — redact them).

**Duplicate detection:** Identity-based dedup removes true duplicates. Potential duplicates (same summary + date, different identity) are **flagged but never suppressed** — all events are kept. See `DUPLICATE_DETECTION.md`.

**Reschedule detection:** Only tracks events in a 7-day future window. Snapshots are pruned to prevent unbounded growth.

**Operational state:** Three-tier model — Healthy 🟢 / Degraded 🟡 / Failed 🔴. Transitions defined in `STATE_MACHINE.md`.

## Conventions

- TypeScript strict mode, target ES2022, CommonJS modules (Azure Functions v4 requirement)
- Node.js 22+ required
- Luxon for all date/time operations
- Tests use Vitest with files in `test/` directory
- No linter configured — rely on TypeScript strict mode and the design contracts
- Config loaded from Azure Functions app settings or `local.settings.json` via `src/lib/config.ts`
- Infrastructure defined in `infra/main.bicep`; deployment scripts in `scripts/azure/`
- CI/CD: `.github/workflows/calendarmerge-functions.yml` deploys on push to main
