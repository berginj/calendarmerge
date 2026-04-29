# Review Concerns

This document captures the main concerns found while reviewing the recent UI and security commits, with file pointers, concrete risk descriptions, and suggested areas to investigate. It is intended as a constructive follow-up, not a rejection of the overall direction.

Request for review by the other developer:
Please review the concerns below, especially the edit-flow regression around redacted feed URLs and the SSRF/DoS hardening claims. Those areas appear to need a second pass before the recent changes should be treated as fully production-safe.

## 1. Feed URL redaction appears to break edit flows

Severity: High

Why this matters:
The new response-side URL redaction is directionally correct, but the current frontend edit flow appears to round-trip the redacted URL back into storage. For feeds whose real source URL contains auth tokens or signed query parameters, editing only the feed name may silently strip the token and save a broken URL.

Pointers:
- `frontend/src/views/Feeds.tsx:432`
- `frontend/src/components/FeedForm.tsx:66`
- `src/functions/feedUpdate.ts:76`
- `src/functions/feedUpdate.ts:113`
- `src/functions/feedUpdate.ts:138`

Observed behavior:
- The edit form is initialized from `feed.url`.
- The server now returns `feed.url` in redacted form.
- The form submits the current URL value again on save, even when the user only intended to update the name.
- `updateFeed` treats the submitted redacted URL as a real URL change when it differs from the stored tokenized URL.
- The updated feed is then persisted with the stripped URL.

Likely impact:
- Tokenized ICS feeds can stop refreshing after a harmless metadata edit.
- The problem is user-visible only after the broken URL has already been saved.
- This creates a reliability regression in exactly the feeds that most need secret-bearing URLs.

Areas to investigate fixing:
- Treat source feed URLs as write-only secrets in the UI.
- Do not prefill the edit form with a redacted URL if the original cannot be safely reconstructed.
- Support name-only edits without requiring the client to resubmit the URL.
- Consider separate API fields such as `urlDisplay` and `hasHiddenQueryParams` so the client can render safely without overwriting secrets.
- Add an integration test covering: create tokenized feed, fetch list, edit only name, verify stored URL remains unchanged.

## 2. SSRF protection is incomplete and currently overstated

Severity: High

Why this matters:
The recent changes describe SSRF protection as implemented, but the current validation only checks the literal hostname string. That blocks a subset of obvious private-IP inputs, but it does not cover common SSRF paths through DNS resolution or some IPv6 literal forms.

Pointers:
- `src/lib/util.ts:60`
- `src/lib/util.ts:72`
- `src/lib/util.ts:101`

Observed behavior:
- `isPrivateOrLocalIP()` matches regexes against the raw hostname string only.
- A public hostname that resolves to a private address still passes validation.
- Literal IPv6 loopback and ULA inputs are not consistently blocked because `URL.hostname` includes brackets, for example `[::1]` and `[fc00::1]`.
- The current code therefore protects against a narrow class of inputs, not the general SSRF problem described in the commit message.

Likely impact:
- Attackers may still be able to add feeds that target internal services by using controlled DNS.
- Reviewers may gain false confidence from the current “SSRF fixed” framing.

Areas to investigate fixing:
- Resolve hostnames before fetch and reject any address in private, loopback, link-local, multicast, or otherwise non-routable ranges.
- Normalize IPv6 host literals before validation so bracketed forms are handled correctly.
- Re-check redirect targets, not only the initial URL.
- Decide whether to allow only a restricted outbound target class rather than trying to blacklist bad destinations.
- Add tests for:
  - `http://127.0.0.1/...`
  - `http://[::1]/...`
  - `http://[fc00::1]/...`
  - a hostname that resolves to RFC1918 space
  - redirect chains landing on private IPs

## 3. ICS size limiting still reads oversized bodies into memory

Severity: Medium

Why this matters:
The new 10 MB limit is useful, but the implementation still buffers the full body via `response.text()` before enforcing the post-read size check when `Content-Length` is absent or inaccurate.

Pointers:
- `src/lib/fetchFeeds.ts:101`
- `src/lib/fetchFeeds.ts:106`
- `src/lib/fetchFeeds.ts:109`

Observed behavior:
- The pre-download check only works when `Content-Length` is present and truthful.
- For chunked or misleading responses, the full body is still materialized before the size check runs.

Likely impact:
- A malicious or misconfigured server can still cause elevated memory use.
- The hardening is partial, but the current documentation reads as if the DoS vector is fully addressed.

Areas to investigate fixing:
- Stream the response body and enforce a rolling byte limit while reading.
- Abort the request as soon as the byte limit is exceeded.
- Measure bytes, not string length, so UTF-8 multibyte cases are handled precisely.
- Add tests that simulate a response with no `Content-Length` and a body exceeding the threshold.

## 4. Manual refresh cooldown has correctness and operability tradeoffs

Severity: Medium

Why this matters:
The new cooldown reduces abuse on a single worker, but it is not a durable rate limit and it also blocks legitimate retries after failed refresh attempts.

Pointers:
- `src/functions/manualRefresh.ts:15`
- `src/functions/manualRefresh.ts:16`
- `src/functions/manualRefresh.ts:31`
- `src/functions/manualRefresh.ts:57`

Observed behavior:
- The cooldown state is module-global and therefore local to a single process.
- Multiple Azure Function instances can bypass it.
- Different users and tenants share the same cooldown on one worker.
- The timestamp is updated before `runRefresh()` executes, so a failure still locks out the next attempt for 30 seconds.

Likely impact:
- Operators may be blocked from retrying immediately after a transient failure.
- The protection may not actually constrain distributed abuse in production.
- The implementation may create more friction than real safety under scale-out.

Areas to investigate fixing:
- Move the rate limit to a shared store if true enforcement is needed.
- Decide whether rate limiting should be per caller, per function key, or global.
- Record a cooldown only after a successful refresh start or use a short in-flight lock plus a separate rate-limit policy.
- Add tests for:
  - immediate retry after failed refresh
  - parallel requests on the same worker
  - behavior under simulated multi-instance deployment assumptions

## Suggested next steps

1. Triage the feed-edit regression first because it risks silently breaking working feeds.
2. Reframe the SSRF and DoS notes in commit/docs until the protections are complete.
3. Add targeted tests for the new security behavior instead of relying on the existing broad pass rate.
4. Ask the other developer to review the findings and either confirm the risks or document intended behavior where the current implementation is deliberate.
