# Calendar Merge Work Items

Created: 2026-05-06

This backlog converts the current design-contract review into implementation-ready work. Items are ordered by recommended execution sequence.

## WI-001: Add Protected Admin Status/Insights API

Priority: P0

Status: Complete in implementation slice 2026-05-06.

Problem:
The public `status.json` is intentionally sanitized, but the management UI still needs feed health, feed alerts, reschedules, and duplicate diagnostics. Those details should be available only through an authenticated API endpoint.

Scope:
- Add a protected HTTP endpoint, for example `GET /api/status/internal` or `GET /api/insights`.
- Require Function auth.
- Read from private internal status storage via `BlobStore.readStatusForRefresh()` or an explicit internal read method.
- Return the standard API response envelope.
- Include operational diagnostics needed by the admin UI:
  - `sourceStatuses`
  - `feedChangeAlerts`
  - `suspectFeeds`
  - `potentialDuplicates`
  - `rescheduledEvents`
  - `cancelledEventsFiltered`
  - refresh timestamps and output metadata
- Redact feed URLs before returning them.
- Do not expose raw feed URL query strings, private calendar tokens, event snapshots, stack traces, or storage credentials.

Definition of done:
- Authenticated endpoint exists and returns internal operational diagnostics.
- Unauthenticated requests are rejected by Function auth.
- Returned feed URLs are redacted.
- `eventSnapshots` is not returned by default.
- Endpoint uses `createSuccessResponse` / `createErrorResponse`.
- Handler tests cover success, missing internal status fallback, and redaction.
- Existing public `status.json` remains sanitized.
- `npm.cmd run test -- --run` passes.

## WI-002: Wire Management UI To Admin Insights Instead Of Public Status

Priority: P0

Status: In progress. Admin status fetching and guarded UI states are implemented; frontend runtime tests and live `/manage/` verification remain.

Problem:
The management UI currently fetches public `status.json`, but dashboard and changes views expect fields that are no longer public.

Scope:
- Update the management UI status hook to fetch:
  - public `status.json` for public-safe service summary, or
  - protected admin insights when a Function key is configured.
- Make Dashboard, Feeds, and Changes views tolerate unavailable protected diagnostics.
- Show a clear empty/auth-required state for admin-only insights.
- Keep the public sports subscribe page unchanged.
- Preserve the existing sessionStorage behavior for Function keys.

Definition of done:
- Dashboard no longer crashes or silently misreports when `sourceStatuses` is absent from public status.
- With a valid Function key, dashboard/feed/change views show internal diagnostics from the protected endpoint.
- Without a Function key, public summary still renders and admin-only diagnostics show an auth-required state.
- Frontend build passes.
- Add frontend or integration tests for both public-only and admin-insights data paths.
- Live `/manage/` page loads successfully after deployment.

## WI-003: Split And Update Public/Admin Status Contracts

Priority: P0

Problem:
The authoritative design contract still describes `status.json` as containing internal details, while the current security posture intentionally omits them from the public payload.

Scope:
- Update `DESIGN_CONTRACTS.md` to define separate contracts:
  - Public status contract
  - Admin/internal status or insights contract
- Update `README.md`, `SECURITY_REVIEW.md`, and monitoring docs to match the split.
- Document which fields are public-safe and which require Function auth.
- Document the security rationale for excluding event-level and feed-level diagnostics from public status.
- Remove or archive stale TODOs that contradict the current implementation.

Definition of done:
- Design contracts no longer imply public `status.json` exposes private feed/event diagnostics.
- Public and admin status schemas are explicit.
- Docs identify the correct endpoint for each UI/monitoring use case.
- Stale contradictory notes are either updated or marked historical.
- Documentation links remain accurate.

## WI-004: Add API And Status Contract Test Suite

Priority: P1

Problem:
The repo has good handler/integration coverage, but not dedicated schema contract tests for public and protected API shapes.

Scope:
- Add `test/contract/`.
- Add tests for:
  - Standard success envelope.
  - Standard partial-success envelope.
  - Standard error envelope.
  - Public `status.json` schema.
  - Protected admin insights schema.
  - Manual refresh response schema.
  - Feed create/update/delete/list response schemas.
  - Settings get/update response schemas.
- Use fixtures or lightweight schema assertions.
- Ensure new fields are backward-compatible unless intentionally versioned.

Definition of done:
- `test/contract/api-responses.test.ts` exists.
- Public status tests assert internal fields are absent.
- Admin status/insights tests assert required diagnostic fields are present and sanitized.
- Manual refresh contract test covers success, partial success, failed refresh, and rate limit responses.
- Contract tests fail if response envelopes drift.
- Full test suite passes.

## WI-005: Standardize Handler Validation And Error Mapping

Priority: P1

Problem:
Handlers still use ad hoc validation and cast request JSON before validating. Manual refresh also returns `502`, which conflicts with the design contract except for proxy cases.

Scope:
- Introduce shared validation helpers or a lightweight handler wrapper.
- Use the standard `ValidationResult<T>` shape for handler input validation.
- Avoid casting `await request.json()` directly to request types before validation.
- Convert validation details into `validationErrors` consistently.
- Replace manual refresh failed-response `502` with the contract-aligned status code, likely `503 SERVICE_UNAVAILABLE`.
- Normalize malformed JSON handling.

Definition of done:
- Feed create/update/settings update use shared validation patterns.
- Validation errors return field-specific `validationErrors` where possible.
- Manual refresh no longer returns `502` for refresh failure.
- Existing API clients still receive standard response envelopes.
- Tests cover malformed JSON, invalid fields, and refresh failure status.
- Design-contract references match implementation.

## WI-006: Add Frontend Runtime Tests

Priority: P1

Problem:
CI builds the React management UI but does not test behavior. This allows UI/data-contract mismatches to slip through.

Scope:
- Add a frontend test runner, such as Vitest with React Testing Library.
- Add a `test` script to `frontend/package.json`.
- Add CI step for frontend tests.
- Cover:
  - Service health banner public status rendering.
  - Dashboard with public-only status.
  - Dashboard with admin insights.
  - Changes view with reschedules, duplicates, and feed alerts.
  - Function-key-required states.
  - Manual refresh success/error/rate-limit states.

Definition of done:
- `npm.cmd test --prefix frontend` or equivalent exists.
- GitHub Actions runs frontend tests before deploy.
- Tests cover both public and protected status data paths.
- Frontend build and test steps pass locally and in CI.

## WI-007: Implement Durable Manual Refresh Rate Limiting

Priority: P2

Problem:
Manual refresh cooldown is in-memory per Function instance. It does not enforce rate limits across scale-out and is not per caller/feed.

Scope:
- Define rate-limit policy:
  - global service limit
  - per Function key or caller limit if feasible
  - optional per-feed limit for future targeted refreshes
- Store rate-limit state in Azure Table Storage.
- Return standard error envelope with `RATE_LIMIT_EXCEEDED`.
- Include `Retry-After` header.
- Preserve immediate retry after failed refresh attempts where appropriate.
- Keep `activeRefresh` as the in-flight concurrency guard.

Definition of done:
- Rate limit works across multiple Function instances.
- Tests cover allowed refresh, rate-limited refresh, retry after failure, and expired cooldown.
- Response includes `Retry-After`.
- Implementation is documented in design/security docs.
- No regression to concurrent refresh reuse behavior.

## WI-008: Build Admin Insights Dashboard

Priority: P2

Problem:
The backend detects useful operational conditions, but the management UI should present them as actionable operator workflows rather than raw lists.

Scope:
- Build an admin-only insights surface using the protected insights API.
- Include:
  - Feed health table with consecutive failures and last attempted time.
  - Reschedule timeline.
  - Duplicate review list with confidence.
  - Feed count change alerts.
  - Refresh ID and last refresh metadata.
  - Calendar staleness indicators.
- Add filters for severity, feed, and insight type.
- Include copyable refresh/request IDs for debugging.

Definition of done:
- Admin insights are accessible from `/manage/`.
- Public users without Function key do not see private event/feed details.
- Operators can identify failed/suspect feeds within one view.
- Reschedules and duplicates are visible with source feed context.
- UI handles empty states, loading states, and API errors.
- Frontend tests cover the primary insight states.

## WI-009: Add Alert Delivery For Operational Events

Priority: P2

Problem:
The system detects degraded states and schedule changes, but it does not actively notify users/operators.

Scope:
- Define alert channels:
  - email
  - webhook
  - Teams/Slack-compatible webhook
  - SMS only if explicitly desired later
- Define alert triggers:
  - operational state becomes failed
  - stale calendar age exceeds threshold
  - feed events-to-zero
  - significant feed drop
  - reschedule detected within 7-day window
  - repeated consecutive failures
- Add configuration for alert thresholds and recipients.
- Prevent alert spam with dedupe/cooldown state.

Definition of done:
- At least one alert channel is implemented behind config.
- Alert payloads include actionable details and refresh ID.
- Alert dedupe prevents repeated identical notifications every refresh.
- Tests cover trigger selection and dedupe behavior.
- Monitoring docs include setup and troubleshooting steps.

## WI-010: Add Configurable Games Filtering Rules

Priority: P2

Problem:
Games-only filtering is currently heuristic. Users need control when provider summaries/categories do not match the heuristic.

Scope:
- Add feed-level or global rules:
  - force include feed in games-only output
  - force exclude feed from games-only output
  - include summary/category regex or keyword rules
  - exclude summary/category regex or keyword rules
  - team/opponent aliases
- Add preview endpoint or UI preview showing how many events match.
- Store rules in settings or a new Table Storage entity.
- Keep default heuristic behavior when no rules are configured.

Definition of done:
- Users can configure games-only filtering without code changes.
- Existing heuristic remains the default.
- Preview shows matched and excluded counts before saving.
- Tests cover include, exclude, alias, and default heuristic paths.
- Published `calendar-games.ics` and `schedule-x-games.json` reflect configured rules.

## WI-011: Clean Up Historical Documentation

Priority: P3

Problem:
Several older docs still contain stale TODOs or old "not done" statements. That creates noise during reviews and can send future work in the wrong direction.

Scope:
- Review historical docs:
  - `concerns.md`
  - `CONCERNS_RESPONSE.md`
  - `IMPLEMENTATION_SUMMARY.md`
  - `COMPLETE_IMPLEMENTATION.md`
  - `PHASE2_SUMMARY.md`
  - `UI_ENHANCEMENTS.md`
- Mark historical review docs clearly as historical, or move them under an archive folder.
- Update remaining current docs to reflect present behavior.
- Remove stale TODOs that have been completed.
- Keep useful rationale, but separate it from active backlog.

Definition of done:
- Active docs no longer contain stale "remaining work" statements for completed items.
- Historical docs are clearly labeled or archived.
- Active backlog is represented by this file or GitHub issues.
- README and design contracts remain the primary current references.

## WI-012: Decide Whether To Track Built Frontend Assets

Priority: P3

Problem:
The repo tracks `frontend/build` assets, but CI builds and deploys the frontend from source. Tracked build artifacts create churn and can become stale.

Scope:
- Decide whether `frontend/build` should remain tracked.
- If not tracked:
  - add `frontend/build/` to `.gitignore`
  - remove tracked build files
  - update deployment docs to clarify CI builds assets
- If tracked:
  - document when contributors must rebuild and commit assets
  - add a CI check that built assets match source if needed

Definition of done:
- Repository policy for frontend build artifacts is explicit.
- `.gitignore`, docs, and CI reflect the chosen policy.
- No recurring stale-build ambiguity remains.

## Recommended Sequencing

1. WI-001
2. WI-002
3. WI-003
4. WI-004
5. WI-005
6. WI-006
7. WI-007 through WI-010 in product priority order
8. WI-011 and WI-012 as cleanup work
