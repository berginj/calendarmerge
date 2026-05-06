# Monitoring and Alerting Guide

This guide provides comprehensive monitoring and alerting recommendations for the calendar merge service.

---

## Quick Reference

### Alert Priority Matrix

| Alert | Severity | Response Time | Action |
|-------|----------|---------------|--------|
| Service Failed | 🔴 Critical | Immediate (page) | Investigate all feeds, check blob storage permissions |
| No refresh in 6 hours | 🔴 Critical | 10 minutes | Check Azure Function status, review logs |
| Status write failed | 🔴 Critical | Immediate | Check blob storage permissions and connectivity |
| Feed consecutive failures ≥3 | 🟡 Warning | Business hours | Verify feed URL, check if platform is down |
| Events-to-zero | 🟡 Warning | Business hours | Check if off-season or feed broken |
| Significant event drop | 🟡 Warning | Business hours | Verify feed integrity |
| Partial publishing | 🟡 Warning | Business hours | Check blob storage health |
| Reschedules detected | 🟢 Info | Log only | Normal operation - schedule changes |
| Potential duplicates | 🟢 Info | Log only | Review for feed cleanup opportunities |

---

## Monitoring Endpoints

### Primary Health Check

**Endpoint:** `GET https://{functionapp}.azurewebsites.net/api/status`

**Auth:** Anonymous (public)

**Success Response (200 OK):**
```json
{
  "serviceName": "calendarmerge",
  "state": "success",
  "healthy": true,
  "operationalState": "healthy",
  "lastAttemptedRefresh": "2026-04-27T12:00:00Z",
  "lastSuccessfulRefresh": "2026-04-27T12:00:00Z",
  "sourceFeedCount": 3,
  "mergedEventCount": 45,
  "calendarPublished": true,
  "gamesOnlyCalendarPublished": true
}
```

**Degraded Response (200 OK but issues):**
```json
{
  "serviceName": "calendarmerge",
  "state": "partial",
  "healthy": false,
  "operationalState": "degraded",
  "degradationReasons": [
    "1 feed(s) failed: School Calendar",
    "Athletics: events to zero (20 → 0)"
  ],
  "lastAttemptedRefresh": "2026-04-27T12:00:00Z"
}
```

Per-feed diagnostics, feed change alerts, duplicate candidates, and reschedule details are private operational data. Fetch them from the protected admin endpoint with a Function key.

**Failed Response (503 Service Unavailable for refresh failure):**
```json
{
  "serviceName": "calendarmerge",
  "state": "failed",
  "healthy": false,
  "operationalState": "failed",
  "degradationReasons": [
    "All feeds failed",
    "No calendars published"
  ],
  "errorSummary": [
    "Feed1: HTTP 404",
    "Feed2: Timeout",
    "Feed3: Parse error"
  ]
}
```

### status.json (Public Endpoint)

**URL:** `https://{storage}.z13.web.core.windows.net/status.json`

**Purpose:**
- Public-safe service health and published output metadata
- Updated after every refresh
- Persisted even when Azure Functions is down
- Useful for external monitoring tools
- Does not include `sourceStatuses`, `feedChangeAlerts`, `potentialDuplicates`, `rescheduledEvents`, or `eventSnapshots`

### Admin Status (Protected Endpoint)

**URL:** `https://{function-app}.azurewebsites.net/api/status/internal`

**Purpose:**
- Protected operational diagnostics for the management UI and operators
- Includes sanitized `sourceStatuses`, `feedChangeAlerts`, `suspectFeeds`, `potentialDuplicates`, and `rescheduledEvents`
- Redacts feed URLs and excludes `eventSnapshots`
- Requires the Function key in the `x-functions-key` header

---

## Monitoring Queries

### Azure Monitor / Application Insights

**Query 1: Track Operational State Distribution**
```kusto
customMetrics
| where name == "refresh_finished"
| extend operationalState = tostring(customDimensions.operationalState)
| summarize count() by operationalState, bin(timestamp, 1h)
| render timechart
```

**Query 2: Feed Failure Rate**
```kusto
traces
| where message contains "feed_fetch"
| extend feedId = tostring(customDimensions.feedId)
| extend ok = tobool(customDimensions.ok)
| summarize failures = countif(ok == false), total = count() by feedId, bin(timestamp, 1h)
| extend failureRate = (failures * 100.0) / total
| where failureRate > 10
| project timestamp, feedId, failureRate, failures, total
```

**Query 3: Detect Events-to-Zero Conditions**
```kusto
traces
| where message contains "feed_change_alert"
| extend alert = parse_json(customDimensions.alert)
| where alert.change == "events-to-zero"
| project timestamp, feedId = alert.feedId, feedName = alert.feedName,
         previousCount = alert.previousCount
```

**Query 4: Reschedule Detection**
```kusto
customMetrics
| where name == "refresh_finished"
| extend rescheduledCount = toint(customDimensions.rescheduledEventsCount)
| where rescheduledCount > 0
| summarize count() by bin(timestamp, 1d)
| render timechart
```

**Query 5: Publishing Failures**
```kusto
traces
| where message in ("calendar_write_failed", "games_calendar_write_failed")
| extend blobPath = tostring(customDimensions.blobPath)
| extend error = tostring(customDimensions.error)
| project timestamp, message, blobPath, error
| order by timestamp desc
```

---

## Alert Rules

### 🔴 Critical Alerts (Page Immediately)

#### 1. Service Not Operational

**Condition:**
```kusto
let status = externaldata(json: dynamic)
  [@"https://{storage}.z13.web.core.windows.net/status.json"];
status | where operationalState == "failed"
```

**Alternative (Application Insights):**
```kusto
customMetrics
| where name == "refresh_finished"
| where tostring(customDimensions.operationalState) == "failed"
| where timestamp > ago(5m)
```

**Action:**
1. Check Azure Function status (is it running?)
2. Review error logs for last refresh
3. Check blob storage connectivity
4. Verify all feed URLs are accessible
5. Page on-call engineer

---

#### 2. No Successful Refresh in 6 Hours

**Condition:**
```kusto
let status = externaldata(json: dynamic)
  [@"https://{storage}.z13.web.core.windows.net/status.json"];
status
| extend lastCheck = todatetime(lastSuccessfulCheck.combined)
| where lastCheck < ago(6h) or isnull(lastCheck)
```

**Action:**
1. Check if timer trigger is firing
2. Review Azure Function logs
3. Check if settings are blocking refreshes
4. Verify timer schedule configuration
5. Page on-call engineer if sustained >10 minutes

---

#### 3. Status Write Failures

**Condition:**
```kusto
traces
| where message == "status_write_failed"
| where timestamp > ago(10m)
| summarize count() by bin(timestamp, 5m)
| where count_ >= 2
```

**Action:**
1. Check blob storage account health
2. Verify managed identity permissions (Storage Blob Data Contributor)
3. Check for storage account throttling
4. Page on-call engineer

---

### 🟡 Warning Alerts (Investigate During Business Hours)

#### 4. Degraded State Sustained

**Condition:**
```kusto
let status = externaldata(json: dynamic)
  [@"https://{storage}.z13.web.core.windows.net/status.json"];
status | where operationalState == "degraded"
```

**Trigger:** Degraded for >1 hour

**Action:**
1. Review `degradationReasons` in status.json
2. Check feed-specific errors in `/api/status/internal`
3. Create ticket for investigation
4. Notify team via Slack/email

---

#### 5. Feed Consecutive Failures

The following admin-diagnostic examples assume an authenticated collector has fetched `/api/status/internal` and exposed the standard response envelope as `json`. Do not point unauthenticated external monitors at this protected endpoint.

**Condition:**
```kusto
let status = AdminStatusResponses;
status
| extend body = json.data.status
| mv-expand feedStatus = body.sourceStatuses
| where feedStatus.consecutiveFailures >= 3
| project feedId = feedStatus.id, feedName = feedStatus.name,
         consecutiveFailures = feedStatus.consecutiveFailures,
         lastError = feedStatus.error
```

**Action:**
1. Check if feed URL is still valid
2. Verify platform is accessible (check platform status page)
3. Check if feed requires re-authentication
4. Notify team
5. Consider disabling feed if permanently broken

---

#### 6. Events-to-Zero Alert

**Condition:**
```kusto
let status = AdminStatusResponses;
status
| extend body = json.data.status
| mv-expand alert = body.feedChangeAlerts
| where alert.change == "events-to-zero"
| where alert.severity in ("warning", "error")
```

**Action:**
1. Check if this is expected (off-season transition)
2. Verify feed is returning data (manually fetch URL)
3. Check if feed URL changed
4. Review feed on platform's website
5. Notify team

---

#### 7. Significant Event Count Drop

**Condition:**
```kusto
let status = AdminStatusResponses;
status
| extend body = json.data.status
| mv-expand alert = body.feedChangeAlerts
| where alert.change == "significant-drop"
| where alert.percentChange < -50
```

**Action:**
1. Verify feed integrity
2. Check for platform changes
3. Review feed manually
4. Compare with previous snapshot

---

#### 8. Partial Publishing (Sustained)

**Condition:**
```kusto
let status = externaldata(json: dynamic)
  [@"https://{storage}.z13.web.core.windows.net/status.json"];
status
| where calendarPublished != gamesOnlyCalendarPublished
```

**Trigger:** Sustained for >3 refresh cycles

**Action:**
1. Check blob storage write permissions
2. Review publishing error logs
3. Check for storage throttling
4. Create ticket

---

### 🟢 Info Alerts (Log Only)

#### 9. Reschedules Detected

**Condition:**
```kusto
let status = AdminStatusResponses;
status
| extend body = json.data.status
| where array_length(body.rescheduledEvents) > 0
| mv-expand reschedule = body.rescheduledEvents
| project timestamp = body.lastAttemptedRefresh,
         summary = reschedule.summary,
         feedName = reschedule.feedName,
         timeChanged = isnotnull(reschedule.changes.time),
         locationChanged = isnotnull(reschedule.changes.location)
```

**Action:**
- Log for user visibility
- Consider email/push notifications to users
- Normal operation - not an error

---

#### 10. Potential Duplicates Detected

**Condition:**
```kusto
let status = AdminStatusResponses;
status
| extend body = json.data.status
| where array_length(body.potentialDuplicates) > 0
| mv-expand duplicate = body.potentialDuplicates
| where duplicate.confidence == "high"
```

**Action:**
- Review high-confidence duplicates
- Consider cleaning up source feeds
- May indicate feed configuration issue

---

## Dashboard Recommendations

### Overview Dashboard

**Metrics to Display:**
1. **Service Status Badge**
   - 🟢 Healthy
   - 🟡 Degraded
   - 🔴 Failed

2. **Per-Feed Health**
   - Feed name
   - Last successful fetch
   - Event count (current vs previous)
   - Consecutive failures
   - Status (active/suspect/failed)

3. **Calendar Freshness**
   - Full calendar age (hours)
   - Games calendar age (hours)
   - Last attempted refresh
   - Last successful refresh (combined)

4. **Event Insights**
   - Total merged events
   - Games-only events
   - Cancelled events filtered
   - Potential duplicates flagged
   - Reschedules detected

### Feed Health Dashboard

**Per-Feed Metrics:**
```
┌─────────────────────────────────────────────────────┐
│ Feed: GameChanger Team                              │
│ Status: ✅ Healthy                                  │
│ Last Check: 5 minutes ago                           │
│ Event Count: 25 (↑ from 22)                        │
│ Consecutive Failures: 0                             │
│ Detected Platform: GameChanger                      │
│ Polling Interval: 30 minutes                        │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Feed: Athletics                                      │
│ Status: ⚠️ Suspect (0 events)                       │
│ Last Check: 30 minutes ago                          │
│ Event Count: 0 (↓ from 20) -100%                   │
│ Alert: events-to-zero                               │
│ Consecutive Failures: 0                             │
│ Note: May be off-season                             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Feed: School Calendar                                │
│ Status: ❌ Failed                                    │
│ Last Check: 1 hour ago                              │
│ Last Error: HTTP 404 Not Found                      │
│ Consecutive Failures: 5                             │
│ Action Required: Verify feed URL                     │
└─────────────────────────────────────────────────────┘
```

### Change Detection Dashboard

**Recent Changes (Last 7 Days):**
```
Reschedules Detected: 3
├─ Game vs Tigers: Time changed (6:00 PM → 7:30 PM)
├─ Team Practice: Location changed (Field 4 → Gym)
└─ Parent Meeting: Both time and location changed

Feed Changes: 1
└─ Athletics: events-to-zero (20 → 0) ⚠️

Potential Duplicates: 2
├─ "Team Meeting" on 2026-05-01 (High confidence, 2 instances)
└─ "Practice" on 2026-05-03 (Medium confidence, 2 instances)
```

---

## Azure Monitor Alert Rules

### Setup

**Prerequisites:**
- Application Insights connected to Azure Function
- Log Analytics workspace configured
- Alert action groups created (email, SMS, PagerDuty, etc.)

### Rule 1: Service Failed (Critical)

**Resource:** Application Insights
**Signal:** Custom log search
**Query:**
```kusto
customMetrics
| where name == "refresh_finished"
| extend operationalState = tostring(customDimensions.operationalState)
| where operationalState == "failed"
| where timestamp > ago(5m)
| count
```

**Condition:** Result count > 0
**Evaluation frequency:** Every 5 minutes
**Look-back period:** 5 minutes
**Action:** Page on-call via PagerDuty
**Severity:** 0 (Critical)

---

### Rule 2: No Refresh in 6 Hours (Critical)

**Resource:** Storage Account (status.json blob)
**Signal:** Custom availability test
**Method:** Check blob last modified time

**Alternative (Application Insights):**
```kusto
customMetrics
| where name == "refresh_finished"
| summarize lastRefresh = max(timestamp)
| where lastRefresh < ago(6h)
```

**Condition:** No refresh in last 6 hours
**Evaluation frequency:** Every 30 minutes
**Action:** Page on-call after 10-minute grace period
**Severity:** 0 (Critical)

---

### Rule 3: Feed Consecutive Failures (Warning)

**Query:**
```kusto
traces
| where message == "refresh_finished"
| extend sourceStatuses = parse_json(customDimensions.sourceStatuses)
| mv-expand status = sourceStatuses
| where toint(status.consecutiveFailures) >= 3
| summarize arg_max(timestamp, *) by tostring(status.id)
| project timestamp, feedId = status.id, feedName = status.name,
         consecutiveFailures = status.consecutiveFailures,
         error = status.error
```

**Condition:** Any feed with ≥3 consecutive failures
**Evaluation frequency:** Every 30 minutes
**Action:** Email/Slack notification to team
**Severity:** 2 (Warning)

---

### Rule 4: Events-to-Zero (Warning)

**Query:**
```kusto
traces
| where message contains "feed_change_alert"
| extend alert = parse_json(customDimensions)
| where alert.change == "events-to-zero"
| where alert.severity in ("warning", "error")
| project timestamp, feedId = alert.feedId, feedName = alert.feedName,
         previousCount = alert.previousCount, currentCount = alert.currentCount
```

**Condition:** Any events-to-zero alert
**Evaluation frequency:** Every 1 hour
**Action:** Email notification
**Severity:** 2 (Warning)

---

### Rule 5: Partial Publishing (Warning)

**Query:**
```kusto
customMetrics
| where name == "refresh_finished"
| extend calPublished = tobool(customDimensions.calendarPublished)
| extend gamesPublished = tobool(customDimensions.gamesOnlyCalendarPublished)
| where calPublished != gamesPublished
| summarize count() by bin(timestamp, 1h)
| where count_ >= 3
```

**Condition:** Partial publishing sustained for 3+ refreshes
**Evaluation frequency:** Every 1 hour
**Action:** Create support ticket
**Severity:** 2 (Warning)

---

## Azure Function Monitoring

### Metrics to Track

**Execution Metrics:**
- Function execution count (per function)
- Function execution duration (p50, p95, p99)
- Function failures
- HTTP response times

**Resource Metrics:**
- Memory usage
- CPU usage
- Function instance count

### Recommended Alerts

**Function Execution Failures:**
```
Metric: Function Execution Count (Failed)
Condition: Failed count > 0
Window: 5 minutes
Threshold: Any failure in timerRefresh or manualRefresh
Action: Email notification
```

**Function Timeout:**
```
Metric: Function Duration
Condition: Duration > 300 seconds (5 minutes)
Window: 15 minutes
Threshold: Any execution > 5 minutes
Action: Email notification (may indicate hung fetch)
```

---

## Storage Account Monitoring

### Blob Storage Metrics

**Availability:**
- Monitor blob storage availability (should be >99.9%)
- Alert if availability <99% for >5 minutes

**Latency:**
- Monitor blob write latency
- Alert if p95 latency >5 seconds

**Throttling:**
- Monitor for 503 Service Unavailable responses
- Alert if throttling occurs

### Recommended Alerts

**Storage Availability:**
```
Metric: Availability
Condition: Average availability < 99
Window: 5 minutes
Action: Critical alert - page on-call
```

**Write Failures:**
```
Metric: Transactions (Failed)
Condition: Failed transactions > 0
Window: 15 minutes
Filter: API name contains "PutBlob"
Action: Email notification
```

---

## Health Check Integrations

### UptimeRobot / Pingdom

**Endpoint to Monitor:** `https://{functionapp}.azurewebsites.net/api/status`

**Check Configuration:**
- Interval: Every 5 minutes
- HTTP Method: GET
- Expected Status: 200
- Keyword monitoring: Look for `"healthy": true`
- Alert if: No response or HTTP 500/503

**Advanced Check:**
```javascript
// Response body validation
const json = JSON.parse(response.body);
if (json.operationalState === "failed") {
  return "FAILURE: Service in failed state";
}
if (json.operationalState === "degraded" && json.degradationReasons) {
  return `WARNING: ${json.degradationReasons.join(", ")}`;
}
return "OK";
```

---

## Troubleshooting Playbook

### Scenario 1: All Feeds Failed

**Symptoms:**
- `operationalState: "failed"`
- `degradationReasons: ["All feeds failed"]`
- Protected admin status shows all `sourceStatuses` with `ok: false`

**Investigation Steps:**
1. Check network connectivity from Azure Function
2. Verify DNS resolution for feed URLs
3. Check if common platform (e.g., GameChanger) is down
4. Review HTTP status codes in protected admin `sourceStatuses`
5. Test feed URLs manually with curl/Postman

**Common Causes:**
- Azure Function networking issue
- All platforms coincidentally down (unlikely)
- DNS resolution failure
- Firewall blocking outbound HTTP

---

### Scenario 2: One Feed Consistently Failing

**Symptoms:**
- `operationalState: "degraded"`
- One feed has `consecutiveFailures: N` (high number)
- Error message: "HTTP 404" or "Timeout"

**Investigation Steps:**
1. Copy feed URL from Table Storage or config
2. Test URL manually in browser/Postman
3. Check platform's status page
4. Verify URL hasn't changed
5. Check if authentication token expired

**Common Causes:**
- Feed URL changed (team moved, season ended)
- Platform removed public feed access
- Token expired
- Feed deleted on source platform

**Resolution:**
- Update feed URL in management UI
- Re-generate feed URL from platform
- Disable feed if no longer needed

---

### Scenario 3: Events-to-Zero

**Symptoms:**
- Feed returns 0 events (previously had events)
- Protected admin status includes `suspectFeeds: ["feedId"]`
- Protected admin status `feedChangeAlerts` includes "events-to-zero"

**Investigation Steps:**
1. Check if this is expected (season ended)
2. Fetch feed URL manually and inspect ICS content
3. Check platform UI - are events still there?
4. Review feed on platform (permissions changed?)

**Common Causes:**
- Off-season (expected)
- Feed filtered to show only future events and all events are past
- Platform changed feed behavior
- Permissions changed (feed no longer includes events)

**Resolution:**
- If off-season: Acknowledge alert, optionally disable feed
- If unexpected: Update feed URL or investigate platform

---

### Scenario 4: Partial Publishing

**Symptoms:**
- `calendarPublished: true, gamesOnlyCalendarPublished: false` (or vice versa)
- `degradationReasons: ["Games calendar failed to publish"]`
- Publishing error in `errorSummary`

**Investigation Steps:**
1. Check blob storage health
2. Review error message for specific blob path
3. Verify managed identity permissions
4. Check storage account throttling
5. Verify blob paths in configuration

**Common Causes:**
- Storage account throttling (rare)
- Temporary network glitch
- Permissions issue on specific blob path
- Blob name conflict

**Resolution:**
- Usually self-resolves on next refresh
- If sustained: check permissions and storage health

---

### Scenario 5: Reschedules Detected

**Symptoms:**
- Protected admin status `rescheduledEvents` array populated
- `degradationReasons: ["N event(s) rescheduled"]`

**Investigation:**
This is **normal operation** - not an error.

**Action:**
- Review rescheduled events
- Consider user notifications (email, SMS)
- Log for parent visibility

---

### Scenario 6: Status Write Failed

**Symptoms:**
- Service runs but status.json not updated
- `operationalState: "failed"`
- Error: "Failed to write status.json"

**Investigation Steps:**
1. Check managed identity has Storage Blob Data Contributor role
2. Verify storage account exists and is accessible
3. Check for storage account firewall rules
4. Review network security groups
5. Check if storage account is in different region (latency)

**Common Causes:**
- Managed identity permissions not granted
- Storage account firewall blocking function app
- Storage account deleted/moved

**Critical:** Service cannot report status, calendars may be updating but invisible

---

## Metric Baselines

### Establish Baselines

**Collect for 2 weeks to establish normal patterns:**

1. **Event Count per Feed**
   - Normal range: 10-50 events per team
   - Seasonal variation: Expect drops during off-season
   - Alert threshold: >50% drop from 30-day average

2. **Refresh Duration**
   - Normal: <30 seconds
   - Acceptable: <60 seconds
   - Alert: >120 seconds (possible hung feed fetch)

3. **Feed Fetch Duration**
   - Normal: <3 seconds per feed
   - Acceptable: <10 seconds
   - Alert: >30 seconds (possible timeout)

4. **Publishing Duration**
   - Normal: <5 seconds (blob write)
   - Alert: >15 seconds

5. **Reschedule Frequency**
   - Normal: 1-5 reschedules per week during active season
   - High: >10 reschedules per week (schedule volatility)

6. **Duplicate Detection Rate**
   - Expected: 0-2 potential duplicates per refresh
   - High: >5 potential duplicates (may indicate feed issue)

---

## Runbook Quick Commands

### Check Current Status

**Via Azure CLI:**
```powershell
# Get status.json content
$status = az storage blob download `
  --account-name $env:AZ_STORAGE_ACCOUNT `
  --container-name '$web' `
  --name 'status.json' `
  --auth-mode login | ConvertFrom-Json

# Display operational state
Write-Host "State: $($status.operationalState)"
Write-Host "Healthy: $($status.healthy)"
Write-Host "Degradation Reasons: $($status.degradationReasons -join ', ')"
```

**Via Web:**
```powershell
# Fetch and parse status
$statusUrl = "https://$env:AZ_STORAGE_ACCOUNT.z13.web.core.windows.net/status.json"
$status = Invoke-RestMethod -Uri $statusUrl

# Display key metrics
$status | Select-Object operationalState, healthy, lastAttemptedRefresh, mergedEventCount
```

### Manual Refresh

```powershell
# Get function key
$key = az functionapp keys list `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --query "functionKeys.default" `
  --output tsv

# Trigger manual refresh
$response = Invoke-RestMethod `
  -Method POST `
  -Uri "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/refresh?code=$key"

# Display results
Write-Host "Request ID: $($response.requestId)"
Write-Host "Refresh ID: $($response.refreshId)"
Write-Host "State: $($response.operationalState)"
Write-Host "Event Count: $($response.eventCount)"
```

### Review Feed Health

```powershell
# Get protected admin status
$key = az functionapp keys list `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --query "functionKeys.default" `
  --output tsv

$response = Invoke-RestMethod `
  -Uri "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/status/internal" `
  -Headers @{ "x-functions-key" = $key }

$status = $response.data.status

# Display per-feed health
$status.sourceStatuses | Format-Table id, name, ok, eventCount, consecutiveFailures, error
```

### Check for Reschedules

```powershell
# Get protected admin status
$response = Invoke-RestMethod `
  -Uri "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/status/internal" `
  -Headers @{ "x-functions-key" = $key }

$status = $response.data.status

# Display reschedules
if ($status.rescheduledEvents) {
  $status.rescheduledEvents | Format-Table summary, feedName, detectedAt,
    @{N='Time Changed';E={$null -ne $_.changes.time}},
    @{N='Location Changed';E={$null -ne $_.changes.location}}
}
```

### View Potential Duplicates

```powershell
$response = Invoke-RestMethod `
  -Uri "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/status/internal" `
  -Headers @{ "x-functions-key" = $key }

$status = $response.data.status

if ($status.potentialDuplicates) {
  foreach ($dup in $status.potentialDuplicates) {
    Write-Host "`n$($dup.summary) on $($dup.date) - Confidence: $($dup.confidence)"
    $dup.instances | Format-Table feedName, time, location
  }
}
```

---

## SLA Recommendations

### Service Level Objectives (SLOs)

**Availability:**
- Target: 99.5% uptime (operational state != failed)
- Measured: % of time service is healthy or degraded

**Freshness:**
- Target: Calendar data <2 hours old (95% of time)
- Measured: `checkAgeHours.fullCalendar`

**Reliability:**
- Target: ≥95% of feeds succeed on each refresh
- Measured: (successful feeds / total feeds) per refresh

**Change Detection:**
- Target: Detect 100% of reschedules within 7-day window
- Measured: Reschedules reported in protected admin status

### Service Level Indicators (SLIs)

**Measure These Continuously:**

1. **Operational State Percentage**
   ```
   healthy_percentage = (healthy_count / total_refreshes) * 100
   degraded_percentage = (degraded_count / total_refreshes) * 100
   failed_percentage = (failed_count / total_refreshes) * 100
   ```

2. **Feed Success Rate (per feed)**
   ```
   success_rate = (successful_fetches / total_attempts) * 100
   ```

3. **Calendar Freshness**
   ```
   freshness_sli = % of time checkAgeHours.fullCalendar < 2
   ```

4. **Publishing Success Rate**
   ```
   publish_success_rate = (both_calendars_published / total_attempts) * 100
   ```

---

## Incident Response

### Severity 0 (Critical) - Service Down

**Trigger:**
- operationalState: "failed"
- No refresh in 6 hours
- Status write failing

**Response Time:** Immediate (page on-call)

**Steps:**
1. Check Azure Function status
2. Review error logs
3. Verify blob storage connectivity
4. Check managed identity permissions
5. Test feed URLs manually
6. Escalate to Azure support if infrastructure issue

---

### Severity 1 (High) - Degraded Service

**Trigger:**
- operationalState: "degraded" for >1 hour
- Multiple feed failures

**Response Time:** Within 1 hour

**Steps:**
1. Review degradation reasons
2. Check failed feeds
3. Verify feed URLs still valid
4. Check platform status pages
5. Create support ticket if needed

---

### Severity 2 (Medium) - Single Feed Issue

**Trigger:**
- Single feed failing consistently
- Events-to-zero alert

**Response Time:** Next business day

**Steps:**
1. Review feed error
2. Test feed URL
3. Contact feed owner (if internal)
4. Document in ticket
5. Disable feed if permanently broken

---

### Severity 3 (Low) - Info

**Trigger:**
- Reschedules detected
- Potential duplicates found

**Response Time:** As needed

**Steps:**
- Log for visibility
- Review periodically
- No immediate action required

---

## Maintenance Tasks

### Weekly

- [ ] Review degraded states from past week
- [ ] Check for consistently failing feeds
- [ ] Review potential duplicates (consider feed cleanup)
- [ ] Monitor event count trends
- [ ] Check calendar freshness metrics

### Monthly

- [ ] Review feed success rates
- [ ] Update feed URLs if needed
- [ ] Clean up disabled feeds
- [ ] Review reschedule patterns (identify problematic platforms)
- [ ] Check for duplicate platform issues

### Quarterly

- [ ] Review SLO compliance
- [ ] Update alert thresholds based on observed patterns
- [ ] Review and update feed list (add/remove as needed)
- [ ] Platform integration review (new platforms, deprecated features)

---

## Contact Information

**Internal Team:**
- On-Call Engineer: [PagerDuty rotation]
- Team Email: [team@example.com]
- Slack Channel: #calendar-alerts

**Platform Support:**
- GameChanger: https://help.gc.com
- TeamSnap: https://helpme.teamsnap.com
- SportsEngine: https://help.sportsengine.com
- LeagueApps: https://support.leagueapps.com

**Azure Support:**
- Azure Portal: portal.azure.com
- Support Tickets: portal.azure.com → Support
- Documentation: docs.microsoft.com

---

## Appendix: Sample Alert Configurations

### Azure Monitor Action Group

**Name:** CalendarMerge-Alerts

**Actions:**
- Email: team@example.com
- SMS: +1-555-123-4567 (on-call)
- Webhook: PagerDuty integration URL
- Webhook: Slack incoming webhook

### Alert Rule Template (JSON)

```json
{
  "name": "calendar-merge-service-failed",
  "description": "Calendar merge service in failed state",
  "severity": 0,
  "enabled": true,
  "evaluationFrequency": "PT5M",
  "windowSize": "PT5M",
  "criteria": {
    "allOf": [
      {
        "query": "customMetrics | where name == 'refresh_finished' | extend state = tostring(customDimensions.operationalState) | where state == 'failed'",
        "timeAggregation": "Count",
        "operator": "GreaterThan",
        "threshold": 0
      }
    ]
  },
  "actions": [
    {
      "actionGroupId": "/subscriptions/{sub}/resourceGroups/{rg}/providers/microsoft.insights/actionGroups/CalendarMerge-Alerts"
    }
  ]
}
```

---

## Testing Alerts

### Simulate Failures

**Test degraded state:**
```powershell
# Temporarily disable a feed
az functionapp config appsettings set `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --settings SOURCE_FEEDS_JSON='[{"id":"test","name":"Invalid","url":"https://invalid.example.com/404.ics"}]'

# Wait for next refresh (30 minutes)
# Or trigger manual refresh
```

**Test failed state:**
```powershell
# Set all feeds to invalid URLs
# Service will enter failed state on next refresh
```

**Verify alerts:**
1. Check alert fired in Azure Monitor
2. Verify email/SMS received
3. Check PagerDuty incident created
4. Confirm Slack notification sent

**Cleanup:**
```powershell
# Restore original configuration
# Trigger manual refresh to recover
```

---

## Logging Best Practices

### What to Log

**Always Log:**
- Request ID (every API call)
- Refresh ID (every refresh run)
- Operational state transitions
- Feed failures with HTTP status
- Publishing failures with blob path
- Feed change alerts
- Reschedule detections

**Debug Level:**
- Feed fetch durations
- Event counts per feed
- Merge operation details
- Snapshot creation/comparison

**Never Log:**
- Full feed URLs (security - treat as bearer tokens)
- User personal information
- Event attendee details (already stripped)

### Log Retention

**Recommended:**
- Application Insights: 90 days
- Blob storage append logs (if implemented): 30 days
- Alert history: 1 year

---

## Dashboard Tools

### Recommended Tools

1. **Azure Monitor Workbooks** - Built-in, integrated with Application Insights
2. **Grafana** - Rich dashboards, can query Application Insights
3. **Power BI** - For executive/parent-facing dashboards
4. **Custom Web UI** - Built into management portal (Phase 3)

### Sample Workbook Queries

See Azure Monitor alert rules above - same queries work in Workbooks.

---

## Success Metrics

**After implementing this monitoring:**
- [ ] Mean time to detection (MTTD) <5 minutes for critical issues
- [ ] Mean time to resolution (MTTR) <1 hour for critical issues
- [ ] 100% of events-to-zero conditions alerted
- [ ] 100% of feed failures detected within one refresh cycle
- [ ] 0 false positive critical alerts per week
- [ ] <5 false positive warning alerts per week

---

## Changelog

- **2026-04-27**: Initial monitoring guide created based on Phase 1+2 implementation
- Alert rules defined for all severity levels
- Troubleshooting playbooks added
- Runbook commands documented
- Dashboard recommendations provided
