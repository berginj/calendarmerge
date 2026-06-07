# CalendarMerge Project Guide

## Repo Shape

Canonical local path: `C:\Users\bergi\App\calendarmerge`.

CalendarMerge is an Azure Functions v4 TypeScript app that merges source ICS feeds into public outputs in Azure Blob Storage:

- `src/lib/`: pure merge, fetch, validation, storage, status, refresh, alert, duplicate, and Schedule-X/public calendar logic.
- `src/functions/`: Azure Function HTTP and timer handlers. Keep these thin and delegate behavior to `src/lib`.
- `test/`: backend, integration, contract, and security Vitest suites.
- `frontend/`: React management UI with Vite, TanStack Query, Radix UI, lucide icons, and local `components/ui`.
- `public/`: static public calendar viewer files.
- `scripts/azure/`: Azure bootstrap, packaging, deployment, and GitHub workflow helpers.
- `infra/main.bicep`: Azure infrastructure.

## Authoritative Docs

Read only what the task needs, but treat these docs as authoritative:

- `DESIGN_CONTRACTS.md`: API envelopes, error codes, logging, validation, duplicate/reschedule contracts, compatibility, and test standards.
- `STATE_MACHINE.md`: operational states, stale-calendar behavior, degraded/failed transitions, status publication.
- `REQUIREMENTS_CLARIFICATION.md`: product and behavior decisions.
- `PLATFORM_INTEGRATION_NOTES.md`: Azure Functions, storage, scheduling, and platform constraints.
- `SECURITY_REVIEW.md`: SSRF, redaction, auth, public/private data boundaries.
- `DUPLICATE_DETECTION.md`: duplicate identity rules and "flag likely duplicates, do not suppress" behavior.
- `MONITORING_GUIDE.md`: status fields, alerts, and troubleshooting.
- `DEPLOYMENT_GUIDE.md` and `GITHUB_DEPLOYMENT.md`: deployment and CI/CD.
- `README.md` and `QUICK_START.md`: user-facing setup and common operations.
- `frontend/UI_REBUILD_GUIDE.md`, `UI_ENHANCEMENTS.md`, and `DESIGN_CONTRACTS.md`: UI work.

If a doc conflicts with code, verify the intended contract before changing behavior. The contract hierarchy from `CLAUDE.md` is:

1. `DESIGN_CONTRACTS.md`
2. `STATE_MACHINE.md`
3. `REQUIREMENTS_CLARIFICATION.md`
4. `CLAUDE.md`

## Critical Contracts

- API handlers must return the standardized envelope:
  - Success: `{ requestId, status: "success", data, message?, metadata? }`
  - Partial success: `{ requestId, status: "partial-success", data, warnings, message?, metadata? }`
  - Error: `{ requestId, status: "error", error: { code, message, details?, validationErrors? } }`
- Use helpers and constants from `src/lib/api-types.ts`.
- Use HTTP `400`, `404`, `409`, `429`, `500`, and `503` as specified. Do not use `502` for application errors.
- Validate inputs before type casting.
- Redact feed URLs and avoid logging secrets or full source URLs.
- Log event names in `underscore_case`.
- Prefer fail-safe publication: keep last known good public artifacts when partial feed failures occur and a previous calendar exists.
- Do not suppress potential duplicates. Remove true identity duplicates, but keep likely duplicates and flag them.
- Preserve public/private data boundaries. Public outputs must strip attendee, organizer, contact, and direct contact details.
- `/api/status/internal` requires Function auth, redacts feed URLs, and must not return event snapshots.
- Manual refresh rate limiting uses durable Azure Table Storage state and should only update cooldown after successful or partial refresh.

## Commands

Root package:

```powershell
npm ci
npm run build
npm test
npm run test:watch
npm run build:frontend
npm run install:frontend
npm run dev:frontend
npm run package:functions
```

Frontend package:

```powershell
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run dev
```

Local development:

```powershell
Copy-Item local.settings.example.json local.settings.json
func start
npm run dev:frontend
```

Local endpoints:

- Backend status: `http://localhost:7071/api/status`
- Manual refresh: `POST http://localhost:7071/api/refresh`
- Frontend dev server: `http://localhost:5173`

## Testing Guidance

- Use focused Vitest files for narrow backend work, then `npm test` when shared behavior changes.
- For API handler changes, update `test/functions/api-handlers.test.ts` and `test/contract/api-responses.test.ts`.
- For refresh/status behavior, check integration tests under `test/integration` and status tests under `test/status.test.ts`.
- For feed fetching, validation, SSRF, or URL handling, check `test/security` and feed validation/fetch tests.
- For frontend API clients and components, use tests under `frontend/src/**/*.test.ts(x)`.
- For browser-facing UI changes, run the frontend dev server and verify in a browser after tests.

## Implementation Notes

- Keep Azure Function handlers small. Put behavior in reusable library functions with direct tests.
- Reuse existing storage abstractions for Blob Storage and Table Storage instead of embedding Azure SDK calls in handlers.
- Keep config parsing centralized in `src/lib/config.ts`.
- Use `src/lib/types.ts` and existing interfaces where possible; avoid breaking required fields.
- For public calendar output, check both ICS and Schedule-X JSON paths.
- For games-only behavior, update both full-calendar and games-only code paths and tests.
- For management UI feed writes, remember browser requests require a Function key stored in sessionStorage by the UI until WI-014 replaces this with real admin auth.
- For deployment scripts, be careful with Azure names, GitHub secrets, federated credentials, and role assignments.

## Common Files By Task

- Feed CRUD API: `src/functions/feed*.ts`, `src/lib/settingsStore.ts`, `src/lib/sourceFeeds.ts`, `src/lib/feedValidation.ts`, `test/functions/api-handlers.test.ts`.
- Refresh and publish: `src/lib/refresh.ts`, `src/functions/timerRefresh.ts`, `src/functions/manualRefresh.ts`, `src/lib/blobStore.ts`, `test/integration/refresh-scenarios.test.ts`.
- Merge logic: `src/lib/merge.ts`, `src/lib/ics.ts`, `src/lib/eventFilter.ts`, `test/merge.test.ts`, `test/eventFilter.test.ts`.
- Duplicate/reschedule detection: `src/lib/eventSnapshot.ts`, `DUPLICATE_DETECTION.md`, `test/eventSnapshot.test.ts`.
- Status/health: `src/lib/status.ts`, `src/functions/health.ts`, `src/functions/adminStatus.ts`, `test/status.test.ts`.
- Frontend dashboard/feed UI: `frontend/src/App.tsx`, `frontend/src/views`, `frontend/src/components`, `frontend/src/api/feedsApi.ts`.
- Public viewer: `public/index.html`, `public/games.html`, `src/lib/publicCalendars.ts`, related public viewer tests.
