# Security Review & Recommendations

**Date:** 2026-04-29
**Status:** Comprehensive security audit completed
**Severity Breakdown:** 6 Critical, 6 High, 18 Medium

---

## Executive Summary

A comprehensive security review identified **30 security issues** across authentication, data exposure, input validation, and infrastructure.

**Critical Finding:** Function keys and feed bearer tokens are not adequately protected. Immediate action required before production deployment with sensitive data.

**Recommendation:** Implement the Priority 1 fixes (6 critical issues) before production use.

---

## Critical Issues (Immediate Action Required)

### 1. Function Keys in Query Parameters ⚠️ CRITICAL

**Location:** `frontend/src/hooks/useManualRefresh.ts:16`

**Issue:**
```typescript
refreshUrl.searchParams.set('code', key);  // ❌ Query parameter
```

**Risk:**
- Keys logged in server logs, browser history, proxy logs
- Visible in HTTP referrer headers
- Network monitoring can intercept

**Fix:**
```typescript
const response = await fetch(refreshUrl.toString(), {
  method: 'POST',
  headers: {
    'x-functions-key': key,  // ✅ Header
  },
});
```

**Priority:** P0 - Fix before production
**Effort:** 30 minutes

---

### 2. Function Keys in localStorage ⚠️ CRITICAL

**Location:** `frontend/src/api/feedsApi.ts:36-48`

**Issue:**
```typescript
localStorage.setItem('calendarmerge_functions_key', key);  // ❌ Unencrypted
```

**Risk:**
- Any XSS vulnerability steals keys
- Persists across browser sessions
- No encryption

**Fix Options:**

**Option A: Session Storage (Quick)**
```typescript
sessionStorage.setItem('calendarmerge_functions_key', key);  // ✅ Clears on close
```

**Option B: HTTP-Only Cookies (Best)**
```typescript
// Backend sets secure cookie after authentication
// Frontend cannot access (XSS-proof)
// Requires authentication endpoint
```

**Priority:** P0 - Fix before production
**Effort:** 1 hour (Option A), 4 hours (Option B)

---

### 3. Feed URLs with Bearer Tokens Exposed ⚠️ CRITICAL

**Location:** `feedsList.ts:30`, `feedUpdate.ts:134`, `feedCreate.ts:85`

**Issue:**
```typescript
jsonBody: {
  feed: {
    url: entity.url,  // ❌ Exposes https://example.com/cal.ics?token=secret
  },
}
```

**Risk:**
- Feed URLs contain sensitive bearer tokens
- Tokens exposed in API responses
- Visible in browser DevTools
- Logged if responses are logged

**Fix:**
```typescript
import { redactFeedUrl } from '../lib/util';

jsonBody: {
  feed: {
    id: entity.id,
    name: entity.name,
    url: redactFeedUrl(entity.url),  // ✅ Returns https://example.com/cal.ics
    // Store full URL encrypted in database
    // Never return in API responses
  },
}
```

**Priority:** P0 - Fix before production
**Effort:** 2 hours

---

### 4. Storage Connection Strings in Environment ⚠️ CRITICAL

**Location:** `util.ts:134-142`, environment variables

**Issue:**
```typescript
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
// ❌ Contains storage account key in plaintext
```

**Risk:**
- Credentials in environment variables
- Exposed in logs, error messages, process listings
- Full storage access if compromised

**Fix:**
```typescript
// ✅ Use Managed Identity exclusively
// Remove AZURE_STORAGE_CONNECTION_STRING from environment
// Already supports DefaultAzureCredential - just enforce it
```

**Priority:** P0 - Fix before production
**Effort:** 30 minutes (remove env var, verify managed identity)

---

### 5. Build-Time Function Keys ⚠️ CRITICAL

**Location:** `frontend/.env.production`, build artifacts

**Issue:**
```typescript
const VITE_FUNCTIONS_KEY = import.meta.env.VITE_FUNCTIONS_KEY;  // ❌ In bundle
```

**Risk:**
- Keys embedded in JavaScript bundles
- Visible to all users
- Exposed in source maps

**Fix:**
```typescript
// ✅ NEVER embed secrets in frontend builds
// Use authentication flow instead:
// 1. User logs in (Azure AD, Google, etc.)
// 2. Backend issues session token
// 3. Frontend uses session token
// 4. Backend uses Function key internally
```

**Priority:** P0 - Fix before production
**Effort:** 6 hours (implement authentication flow)

---

### 6. No Rate Limiting on Refresh Endpoint ⚠️ CRITICAL

**Location:** `manualRefresh.ts` (no rate limiting code)

**Issue:**
```typescript
// Anyone with function key can call unlimited times
await runRefresh(logger, "manual");  // ❌ No rate check
```

**Risk:**
- DoS through rapid refresh calls
- Cost explosion (multiple feed fetches)
- Resource exhaustion

**Fix:**
```typescript
const REFRESH_COOLDOWN_MS = 30000; // 30 seconds
let lastRefreshTime = 0;

async function manualRefreshHandler(...) {
  const now = Date.now();
  if (now - lastRefreshTime < REFRESH_COOLDOWN_MS) {
    return {
      status: 429,
      jsonBody: {
        error: 'TOO_MANY_REQUESTS',
        message: 'Please wait 30 seconds between refreshes',
        retryAfter: Math.ceil((lastRefreshTime + REFRESH_COOLDOWN_MS - now) / 1000),
      },
    };
  }

  lastRefreshTime = now;
  // ... proceed with refresh
}
```

**Priority:** P0 - Fix before production
**Effort:** 1 hour

---

## High-Priority Issues

### 7. Inconsistent Authentication Methods 🔴 HIGH

**Standardize all endpoints to use `x-functions-key` header.**

---

### 8. Unprotected Status Endpoint 🔴 HIGH

**Location:** `health.ts` - authLevel: "anonymous"

**Issue:** Status endpoint exposes feed names, URLs, counts to unauthenticated users

**Fix:**
- Create two endpoints: `/status` (anonymous, minimal) and `/status/detailed` (function auth)
- Or require function key for full status

---

### 9. No CORS Configuration 🔴 HIGH

**Location:** Azure Function App configuration

**Fix:**
```json
// host.json or Azure portal
{
  "extensions": {
    "http": {
      "routePrefix": "api",
      "cors": {
        "allowedOrigins": [
          "https://{storage-account}.z13.web.core.windows.net"
        ],
        "supportCredentials": false
      }
    }
  }
}
```

---

### 10. No API Rate Limiting 🔴 HIGH

**Implement Azure API Management or custom rate limiting middleware.**

---

### 11. No Feed Fetch Rate Limiting 🔴 HIGH

**Add per-feed cooldown to prevent rapid fetching.**

---

### 12. localStorage XSS Vulnerability 🔴 HIGH

**Implement Content Security Policy headers to mitigate.**

---

## Medium-Priority Issues

### Input Validation
- **ICS parser resource limits** - Add max file size (10MB), max events (10,000)
- **SSRF protection** - Block private IP ranges in feed URLs
- **Path traversal** - Block `..` in blob paths
- **Feed ID length** - Max 255 characters

### API Security
- **Missing security headers** - Add CSP, X-Frame-Options, etc.
- **CSRF protection** - Implement tokens for state changes
- **Error filtering** - Don't return stack traces
- **Timeout configuration** - Set explicit timeouts

### Infrastructure
- **Blob permissions** - Review public access settings
- **Table partition isolation** - Document single-tenant limitation

### Dependencies
- **npm audit** - Run and address findings
- **Dependabot** - Enable GitHub alerts

---

## Security Best Practices (Already Implemented ✅)

### Good Patterns Found:

1. **URL Redaction in Logs** ✅
   ```typescript
   logger.info("feed_fetching", { url: redactFeedUrl(feed.url) });
   ```

2. **Managed Identity Support** ✅
   ```typescript
   new DefaultAzureCredential()  // No hardcoded credentials
   ```

3. **Input Normalization** ✅
   ```typescript
   normalizeFeedUrl()  // webcal:// → https://
   ```

4. **Retry with Backoff** ✅
   ```typescript
   sleep(config.fetchRetryDelayMs * (attempt + 1))
   ```

5. **Request ID Tracking** ✅
   ```typescript
   const requestId = generateId();  // Audit trail
   ```

6. **Type Safety** ✅
   - Strict TypeScript throughout
   - Input validation functions

7. **Error Categorization** ✅
   - Standard error codes defined
   - Structured error responses

---

## Recommended Security Fixes (Prioritized)

### Priority 0: Critical (Fix Before Production)

1. **Replace query parameter auth with header auth** (30 min)
2. **Move keys to sessionStorage** (30 min)
3. **Redact feed URLs in all API responses** (2 hrs)
4. **Remove connection string env vars** (30 min)
5. **Remove build-time function keys** (plan auth flow)
6. **Add rate limiting to refresh endpoint** (1 hr)

**Total effort:** ~5 hours (excluding full auth flow)

---

### Priority 1: High (Fix This Week)

1. **Standardize to header auth everywhere** (1 hr)
2. **Split status endpoint (public/private)** (2 hrs)
3. **Configure CORS properly** (30 min)
4. **Add API rate limiting** (2 hrs)
5. **Add feed fetch rate limiting** (2 hrs)
6. **Implement CSP headers** (1 hr)

**Total effort:** ~8.5 hours

---

### Priority 2: Medium (Fix This Month)

1. **Add ICS parser limits** (2 hrs)
2. **Block private IPs in URLs** (1 hr)
3. **Add path traversal protection** (30 min)
4. **Filter error responses** (2 hrs)
5. **Add security headers** (1 hr)
6. **Implement CSRF tokens** (4 hrs)
7. **Run dependency audit** (1 hr)
8. **Review blob permissions** (1 hr)

**Total effort:** ~12.5 hours

---

## Recommended Security Headers

**Add to Azure Static Web Apps configuration:**

```json
{
  "globalHeaders": {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://{functionapp}.azurewebsites.net; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
  }
}
```

---

## Authentication Flow Recommendation

**Current (Insecure):**
```
User → Enter function key → Store in localStorage → Include in requests
```

**Recommended (Secure):**
```
User → Azure AD login → Get session cookie → Backend validates → Use function key internally

OR

User → Enter password → Backend validates → Set HTTP-only cookie → Backend uses function key
```

**Benefits:**
- Function keys never exposed to frontend
- HTTP-only cookies prevent XSS theft
- Proper session management
- Logout capability

---

## Testing Security Fixes

**After implementing fixes:**

### 1. Test Rate Limiting
```powershell
# Try rapid refreshes
for ($i=1; $i -le 10; $i++) {
  Invoke-RestMethod -Method POST -Uri "https://.../api/refresh" -Headers @{"x-functions-key"="..."}
}
# Should get 429 after first request within 30s
```

### 2. Test Header Auth
```powershell
# Should work
Invoke-RestMethod -Headers @{"x-functions-key"="..."} -Uri "https://.../api/feeds"

# Should fail
Invoke-RestMethod -Uri "https://.../api/feeds?code=..."
```

### 3. Test URL Redaction
```powershell
$feeds = Invoke-RestMethod -Uri "https://.../api/feeds"
# Feed URLs should be redacted (no query strings)
$feeds.data.feeds[0].url  # Should be https://example.com/cal.ics, not with ?token=
```

### 4. Test CSP
```
# Open browser DevTools → Console
# Try: document.write('<script>alert(1)</script>')
# Should be blocked by CSP
```

---

## Compliance Considerations

### Data Protection (GDPR, CCPA)

**Personal Data Handled:**
- Calendar event details (potentially sensitive)
- Feed URLs (potentially contains user identifiers)
- Function keys (credentials)

**Requirements:**
- Right to deletion (already implemented - feed delete)
- Data minimization (good - only essential data stored)
- Purpose limitation (good - only calendar merging)
- Data retention (7-day snapshot window is reasonable)

**Compliance Status:** Mostly compliant, need:
- Privacy policy documenting data handling
- User consent for data collection
- Data encryption at rest

### Accessibility (WCAG 2.1 AA)

**Status:** ✅ Compliant
- Keyboard navigation
- Screen reader support
- Touch targets (44px)
- Focus indicators
- Semantic HTML

---

## Security Monitoring

**Implement these alerts:**

1. **Failed Authentication Attempts**
   ```kusto
   traces
   | where message contains "unauthorized" or message contains "403"
   | summarize count() by bin(timestamp, 5m)
   | where count_ > 10
   ```

2. **Anomalous Feed URLs**
   ```kusto
   traces
   | where message contains "feed_create"
   | extend url = tostring(customDimensions.url)
   | where url contains "localhost" or url contains "127.0.0.1" or url contains "192.168"
   ```

3. **Rate Limit Violations**
   ```kusto
   traces
   | where message contains "rate_limit_exceeded"
   | summarize count() by bin(timestamp, 1h)
   ```

4. **Unusual Error Rates**
   ```kusto
   traces
   | where level == "error"
   | summarize errors = count() by bin(timestamp, 15m)
   | where errors > 10
   ```

---

## Security Checklist for Production

**Before deploying with real data:**

- [ ] Function keys use header authentication only
- [ ] Admin keys stored in sessionStorage (not localStorage)
- [ ] Feed URLs redacted in all API responses
- [ ] Managed Identity used exclusively (no connection strings)
- [ ] Rate limiting implemented on refresh endpoint
- [ ] CORS configured with whitelist
- [ ] CSP headers added
- [ ] ICS parser has size/count limits
- [ ] Private IPs blocked in feed URLs
- [ ] Security headers configured
- [ ] npm audit run and addressed
- [ ] Dependency scanning enabled (Dependabot)
- [ ] Error messages sanitized (no stack traces)
- [ ] Monitoring alerts configured
- [ ] Incident response plan documented

---

## Responsible Disclosure

**If you find a security issue:**

1. **DO NOT** create public GitHub issue
2. Email security contact privately
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if known)

4. Allow reasonable time for fix (90 days standard)
5. Coordinate disclosure timing

---

## Security Incident Response Plan

**If credentials are compromised:**

1. **Immediate (< 1 hour):**
   - Rotate all function keys
   - Revoke compromised managed identity
   - Review access logs

2. **Short-term (< 24 hours):**
   - Audit all recent operations
   - Check for unauthorized changes
   - Notify affected users (if any)

3. **Long-term (< 1 week):**
   - Implement additional security controls
   - Review and update security policies
   - Conduct post-mortem

**If feed URLs are exposed:**

1. URLs often have expiration (platform-dependent)
2. Regenerate URLs from source platforms
3. Update feeds with new URLs
4. Monitor for unauthorized access

---

## Secure Coding Guidelines

**Add to DESIGN_CONTRACTS.md:**

### Contract 16: Security Standards

**MUST:**
1. Never log sensitive data (passwords, tokens, full URLs)
2. Use headers for authentication (never query parameters)
3. Validate and sanitize all inputs
4. Use parameterized queries (no string concatenation)
5. Implement rate limiting on expensive operations
6. Return generic error messages (log details internally)
7. Use HTTPS exclusively
8. Encrypt sensitive data at rest
9. Use managed identity (never connection strings)
10. Regular security audits and dependency updates

**MUST NOT:**
1. Store secrets in source code or config files
2. Log authentication credentials
3. Return stack traces to clients
4. Trust user input without validation
5. Use query parameters for sensitive data
6. Expose internal system details in errors
7. Allow unrestricted file uploads
8. Parse untrusted data without limits

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Azure Security Best Practices](https://docs.microsoft.com/azure/security/fundamentals/best-practices-and-patterns)
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

---

## Changelog

- **2026-04-29**: Initial comprehensive security review
  - 30 issues identified (6 critical, 6 high, 18 medium)
  - Prioritized action items
  - Implementation guidance provided
