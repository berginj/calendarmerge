# Deployment Guide - Phases 1 & 2

This guide walks through deploying the Phase 1 and Phase 2 enhancements to an existing calendar merge deployment.

---

## Pre-Deployment Checklist

- [ ] Review [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) for Phase 1 changes
- [ ] Review [PHASE2_SUMMARY.md](PHASE2_SUMMARY.md) for Phase 2 changes
- [ ] Review [MONITORING_GUIDE.md](MONITORING_GUIDE.md) for new monitoring setup
- [ ] Understand breaking changes (Phase 1 only - duplicate detection behavior)
- [ ] Backup current deployment (if possible)
- [ ] Plan maintenance window (optional - service remains operational during deploy)

---

## Breaking Changes Summary

### Phase 1 - Breaking Changes

**1. Duplicate Detection Behavior Changed**
- **Old:** Events with same summary + same day were automatically suppressed
- **New:** ALL events kept, duplicates flagged in status.json
- **Impact:** Merged event count will increase
- **User Impact:** May see events they expected to be deduplicated
- **Action:** Review `potentialDuplicates` in status.json after deployment

**2. Health Field Semantics Changed**
- **Old:** `healthy: true` for partial failures (some feeds failed but data served)
- **New:** `healthy: false` for degraded state
- **Impact:** Monitoring systems checking `healthy` field may trigger alerts
- **Action:** Update monitors to check `operationalState` instead

**3. Default Refresh Schedule Changed**
- **Old:** Every 15 minutes
- **New:** Every 30 minutes
- **Impact:** Calendars update less frequently
- **Rationale:** Platform research shows 30 min is safer for rate limiting
- **Action:** None required (or override with REFRESH_SCHEDULE env var)

### Phase 2 - No Breaking Changes

Phase 2 is fully additive:
- All new fields in status.json are optional
- All new API response fields are additive
- Backward compatible with existing integrations

---

## Deployment Steps

### Step 1: Review Current Configuration

```powershell
# View current app settings
az functionapp config appsettings list `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --query "[].{Name:name, Value:value}" `
  --output table

# Check current refresh schedule
az functionapp config appsettings list `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --query "[?name=='REFRESH_SCHEDULE'].value" `
  --output tsv
```

**Save these settings** - you may want to restore some values.

---

### Step 2: Deploy Code

**Option A: Using Deployment Script (Recommended)**
```powershell
# From repository root
powershell -ExecutionPolicy Bypass -File .\scripts\azure\deploy-functions.ps1
```

This script:
1. Runs `npm ci`
2. Runs `npm run build`
3. Runs `npm test` (deployment blocked if tests fail)
4. Creates clean deployment package
5. Installs production dependencies
6. Deploys via `az functionapp deployment source config-zip`

**Option B: Manual Deployment**
```powershell
# Build
npm ci
npm run build
npm test

# Package
powershell -ExecutionPolicy Bypass -File .\scripts\azure\package-functions.ps1

# Deploy
az functionapp deployment source config-zip `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --src .artifacts/package.zip
```

---

### Step 3: Deploy Frontend (Management UI)

```powershell
# Build frontend
npm run build --prefix frontend

# Upload to blob storage
az storage blob upload-batch `
  --account-name $env:AZ_STORAGE_ACCOUNT `
  --destination '$web/manage' `
  --source frontend/build `
  --auth-mode login `
  --overwrite
```

---

### Step 4: Verify Deployment

**Check Function App Status:**
```powershell
# View recent logs
az webapp log tail `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME
```

**Test Health Endpoint:**
```powershell
$statusUrl = "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/status"
$status = Invoke-RestMethod -Uri $statusUrl

# Verify new fields present
$status | Select-Object operationalState, refreshId, lastSuccessfulCheck, checkAgeHours
```

**Trigger Manual Refresh:**
```powershell
$key = az functionapp keys list `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --query "functionKeys.default" `
  --output tsv

$refreshUrl = "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/refresh?code=$key"
$result = Invoke-RestMethod -Method POST -Uri $refreshUrl

# Verify new response fields
Write-Host "Request ID: $($result.requestId)"
Write-Host "Refresh ID: $($result.refreshId)"
Write-Host "Operational State: $($result.operationalState)"
Write-Host "Potential Duplicates: $($result.potentialDuplicates.Count)"
Write-Host "Reschedules: $($result.rescheduledEvents.Count)"
```

**Check status.json:**
```powershell
$publicStatus = Invoke-RestMethod "https://$env:AZ_STORAGE_ACCOUNT.z13.web.core.windows.net/status.json"

# Verify Phase 1 fields
$publicStatus.operationalState
$publicStatus.degradationReasons
$publicStatus.potentialDuplicates

# Verify Phase 2 fields
$publicStatus.feedChangeAlerts
$publicStatus.rescheduledEvents
$publicStatus.suspectFeeds
```

---

### Step 5: Monitor First Refresh Cycle

**Watch for:**
1. Increased event count (duplicates no longer suppressed)
2. Potential duplicates flagged
3. Operational state (should be healthy or degraded, not failed)
4. Feed change alerts (may show changes since last refresh)
5. Reschedules detected (if any events changed)

**Expected Behavior After First Refresh:**
- Event count MAY increase (previously suppressed duplicates now kept)
- `potentialDuplicates` array may be populated
- `feedChangeAlerts` may show event count changes
- `operationalState` should match actual service health

---

### Step 6: Update Monitoring Alerts

**Update Alert Queries:**
```powershell
# Example: Update alert to check operationalState instead of healthy
# In Azure Portal:
# Monitor → Alerts → Alert Rules → [Your Rule] → Edit

# Old query:
# | where tobool(customDimensions.healthy) == false

# New query:
# | where tostring(customDimensions.operationalState) == "failed"
```

**Add New Alerts:**
1. Events-to-zero alerts (see MONITORING_GUIDE.md)
2. Consecutive failure alerts
3. Reschedule detection logging

**Test Alerts:**
```powershell
# Temporarily add invalid feed to trigger degraded state
# Verify alerts fire correctly
# Remove test feed
```

---

## Post-Deployment Tasks

### Day 1: Immediate Verification

- [ ] Verify automatic timer refreshes are working
- [ ] Check status.json is being updated
- [ ] Verify calendars are publishing
- [ ] Check for any unexpected errors in logs
- [ ] Review first set of potential duplicates

### Week 1: Observation Period

- [ ] Monitor operational state distribution (expect mostly healthy)
- [ ] Review feed change alerts (expect some during first week)
- [ ] Check reschedule detection is working
- [ ] Monitor for any performance issues
- [ ] Review potential duplicates with users

### Month 1: Optimization

- [ ] Review feed success rates
- [ ] Identify consistently failing feeds
- [ ] Review duplicate patterns (consider feed cleanup)
- [ ] Adjust refresh schedules if needed (per-platform)
- [ ] Update documentation based on learnings

---

## Rollback Procedure

If critical issues occur after deployment:

### Quick Rollback (Code Only)

```powershell
# Find previous commit
git log --oneline -5

# Example: Rollback to commit before Phase 1
git checkout <previous-commit-hash>

# Redeploy
powershell -ExecutionPolicy Bypass -File .\scripts\azure\deploy-functions.ps1

# Trigger manual refresh
$key = az functionapp keys list `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --query "functionKeys.default" `
  --output tsv

Invoke-RestMethod -Method POST -Uri "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/refresh?code=$key"
```

### Partial Rollback (Config Only)

If you just want to revert the refresh schedule:

```powershell
# Restore 15-minute schedule
az functionapp config appsettings set `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --settings REFRESH_SCHEDULE="0 */15 * * * *"
```

---

## Configuration Changes

### Optional: Override Refresh Schedule

If 30 minutes is too long for your use case:

```powershell
# Set to 15 minutes (aggressive)
az functionapp config appsettings set `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --settings REFRESH_SCHEDULE="0 */15 * * * *"

# Set to hourly (conservative)
az functionapp config appsettings set `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --settings REFRESH_SCHEDULE="0 0 * * * *"
```

**Note:** Timer function runs every 5 minutes but checks settings. Actual refresh interval controlled by Settings API or timer schedule.

---

## Migration Notes

### Handling Increased Event Count

After deployment, merged event count will likely increase because:
- Duplicate suppression removed
- Events with same summary + different times now kept

**Review Process:**
1. Check `potentialDuplicates` in status.json
2. Identify high-confidence duplicates
3. Investigate source feeds
4. Clean up true duplicates at the source if possible
5. Document decision (keep or clean up)

**Example:**
```powershell
# Get potential duplicates
$status = Invoke-RestMethod "https://$env:AZ_STORAGE_ACCOUNT.z13.web.core.windows.net/status.json"

$status.potentialDuplicates | Where-Object { $_.confidence -eq "high" } | ForEach-Object {
  Write-Host "`nPotential Duplicate: $($_.summary) on $($_.date)"
  Write-Host "Confidence: $($_.confidence)"
  Write-Host "Instances:"
  $_.instances | Format-Table feedName, time, location
}
```

### Updating Monitoring Dashboards

**Update Widgets:**
1. Change health check from `healthy` to `operationalState`
2. Add degradation reasons display
3. Add feed change alerts panel
4. Add reschedule detection panel
5. Add per-calendar freshness metrics

**Example Azure Workbook Update:**
```json
{
  "type": "metric",
  "query": "customMetrics | where name == 'refresh_finished' | extend state = tostring(customDimensions.operationalState) | summarize count() by state",
  "visualization": "piechart"
}
```

---

## Platform-Specific Considerations

### GameChanger Feeds

- Default 30-minute polling is recommended
- May see reschedules frequently (game times change often)
- Expect 10-30 events per team during active season
- Off-season: Expect events-to-zero alerts

### LeagueApps Feeds

- Use 120-minute polling (longer interval)
- Watch for "RESCHEDULED" markers (now filtered automatically)
- May see separate old/new events for reschedules
- 1 month past, 6 months future window

### TeamSnap Feeds

- 60-minute polling recommended
- 6-month historical window
- Older events may disappear from feed (expected)

---

## Troubleshooting Common Issues

### Issue: Tests Fail During Deployment

**Cause:** Breaking change in code

**Solution:**
```powershell
# Run tests locally
npm test

# Fix any failures before deploying
# Tests must pass for deployment script to continue
```

---

### Issue: Deployment Succeeds but Functions Don't Start

**Symptoms:** Functions not appearing in Azure Portal

**Check:**
```powershell
# View function app logs
az webapp log tail `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME
```

**Common Causes:**
- Missing dependencies in package
- Runtime error in function initialization
- Configuration error

---

### Issue: Status.json Not Updating

**Symptoms:** status.json shows old timestamp

**Check:**
1. Is timer trigger firing?
2. Can function write to blob storage?
3. Are there errors in logs?

**Verify:**
```powershell
# Check managed identity permissions
az role assignment list `
  --assignee $(az functionapp identity show `
    --resource-group $env:AZ_RESOURCE_GROUP `
    --name $env:AZ_FUNCTIONAPP_NAME `
    --query principalId --output tsv) `
  --scope "/subscriptions/$env:AZ_SUBSCRIPTION_ID/resourceGroups/$env:AZ_RESOURCE_GROUP/providers/Microsoft.Storage/storageAccounts/$env:AZ_STORAGE_ACCOUNT" `
  --output table
```

**Should have:** `Storage Blob Data Contributor` role

---

### Issue: Feed Validation Failing

**Symptoms:** Cannot update feed URLs, validation fails

**Check:**
1. Is feed URL accessible from Azure Function?
2. Does ICS parse correctly?
3. Is network connectivity working?

**Test Locally:**
```powershell
# Run validation locally
npm start

# Then test feed validation
Invoke-RestMethod -Method PUT `
  -Uri "http://localhost:7071/api/feeds/test-feed" `
  -Body '{"url":"https://example.com/calendar.ics"}' `
  -ContentType "application/json"
```

---

### Issue: Automatic Refresh Not Triggering

**Symptoms:** Feed URL updated but refresh doesn't trigger

**Check Logs:**
```kusto
traces
| where message contains "triggering_refresh_after_feed_update"
| project timestamp, feedId = customDimensions.feedId, reason = customDimensions.reason
```

**Common Causes:**
- Update didn't actually change URL
- Feed not enabled (only URL change + enable trigger refresh)
- Refresh failed asynchronously (check error logs)

---

## Monitoring Setup

### Application Insights

**Verify Connected:**
```powershell
# Get instrumentation key
az monitor app-insights component show `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --app $env:AZ_APPINSIGHTS_NAME `
  --query instrumentationKey `
  --output tsv

# Verify function app is using it
az functionapp config appsettings list `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --query "[?name=='APPINSIGHTS_INSTRUMENTATIONKEY'].value" `
  --output tsv
```

**Setup Alerts:**
See [MONITORING_GUIDE.md](MONITORING_GUIDE.md) for complete alert rule configurations.

---

## Testing in Production

### Test 1: Manual Refresh

```powershell
$key = az functionapp keys list `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --query "functionKeys.default" `
  --output tsv

$result = Invoke-RestMethod -Method POST `
  -Uri "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/refresh?code=$key"

# Verify new fields
Write-Host "✓ requestId: $($result.requestId)"
Write-Host "✓ refreshId: $($result.refreshId)"
Write-Host "✓ operationalState: $($result.operationalState)"
Write-Host "✓ potentialDuplicates count: $($result.potentialDuplicates.Count ?? 0)"
Write-Host "✓ rescheduledEvents count: $($result.rescheduledEvents.Count ?? 0)"
```

### Test 2: Feed Management

**Test Enable/Disable:**
```powershell
# Disable a feed
$disableResult = Invoke-RestMethod -Method PUT `
  -Uri "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/feeds/test-feed?code=$key" `
  -Body '{"enabled":false}' `
  -ContentType "application/json"

Write-Host "✓ requestId: $($disableResult.requestId)"
Write-Host "✓ enabled: $($disableResult.feed.enabled)"

# Re-enable (should trigger refresh)
$enableResult = Invoke-RestMethod -Method PUT `
  -Uri "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/feeds/test-feed?code=$key" `
  -Body '{"enabled":true}' `
  -ContentType "application/json"

Write-Host "✓ refreshTriggered: $($enableResult.refreshTriggered)"
```

**Test Feed Validation:**
```powershell
# Update feed URL (will validate before saving)
$updateResult = Invoke-RestMethod -Method PUT `
  -Uri "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/feeds/test-feed?code=$key" `
  -Body '{"url":"https://new-url.com/calendar.ics"}' `
  -ContentType "application/json"

Write-Host "✓ validated: $($updateResult.validated)"
Write-Host "✓ eventCount: $($updateResult.validationDetails.eventCount)"
Write-Host "✓ detectedPlatform: $($updateResult.validationDetails.detectedPlatform)"
Write-Host "✓ refreshTriggered: $($updateResult.refreshTriggered)"
```

### Test 3: Verify status.json

```powershell
$status = Invoke-RestMethod "https://$env:AZ_STORAGE_ACCOUNT.z13.web.core.windows.net/status.json"

# Phase 1 fields
Write-Host "✓ refreshId: $($status.refreshId)"
Write-Host "✓ operationalState: $($status.operationalState)"
Write-Host "✓ degradationReasons: $($status.degradationReasons -join '; ')"
Write-Host "✓ lastSuccessfulCheck.fullCalendar: $($status.lastSuccessfulCheck.fullCalendar)"
Write-Host "✓ checkAgeHours.fullCalendar: $($status.checkAgeHours.fullCalendar)"
Write-Host "✓ potentialDuplicates count: $(($status.potentialDuplicates ?? @()).Count)"
Write-Host "✓ cancelledEventsFiltered: $($status.cancelledEventsFiltered ?? 0)"

# Phase 2 fields
Write-Host "✓ feedChangeAlerts count: $(($status.feedChangeAlerts ?? @()).Count)"
Write-Host "✓ suspectFeeds count: $(($status.suspectFeeds ?? @()).Count)"
Write-Host "✓ rescheduledEvents count: $(($status.rescheduledEvents ?? @()).Count)"
Write-Host "✓ eventSnapshots count: $(($status.eventSnapshots ?? @{}).Count)"
```

---

## Performance Validation

### Expected Performance

**Refresh Duration:**
- 1-3 feeds: <10 seconds
- 4-6 feeds: <20 seconds
- 7-10 feeds: <30 seconds

**Per-Feed Fetch:**
- Typical: 1-3 seconds
- With retries: Up to 30 seconds (if timeouts occur)

**Publishing:**
- Blob writes: <2 seconds
- JSON writes: <1 second

**Query Performance:**
```kusto
customMetrics
| where name == "refresh_finished"
| extend duration = toint(customDimensions.durationMs)
| summarize avg(duration), p50=percentile(duration, 50),
           p95=percentile(duration, 95), p99=percentile(duration, 99)
```

**Alert if:**
- p95 duration >60 seconds (sustained for 1 hour)
- Any single refresh >300 seconds (5 minutes)

---

## Common Post-Deployment Scenarios

### Scenario 1: Increased Event Count Concerns

**User reports:** "I'm seeing duplicate events!"

**Investigation:**
1. Check `potentialDuplicates` in status.json
2. Verify these are flagged duplicates
3. Determine confidence level
4. Decide: true duplicates or legitimate events

**Resolution:**
- If true duplicates: Clean up source feeds
- If legitimate events: Explain new behavior to users
- Document decision

---

### Scenario 2: Events-to-Zero Alerts

**Alert fires:** "Athletics: events to zero"

**Investigation:**
1. Check calendar - is season over?
2. Fetch feed URL manually
3. Check platform website for events

**Resolution:**
- If off-season: Acknowledge alert, optionally disable feed
- If unexpected: Contact platform admin, update feed URL

---

### Scenario 3: Many Reschedules Detected

**Alert fires:** "15 events rescheduled"

**Investigation:**
1. Review `rescheduledEvents` in status.json
2. Check if weather event or league-wide change
3. Verify changes are real (check platform)

**Resolution:**
- Normal operation - log for user visibility
- Consider user notification (email, push)
- No action needed unless pattern is suspicious

---

## Security Post-Deployment

### Verify Feed URL Security

**Feed URLs contain sensitive tokens:**
```powershell
# Check logs aren't exposing full URLs
az monitor app-insights query `
  --app $env:AZ_APPINSIGHTS_NAME `
  --analytics-query "traces | where message contains 'feed' | project message, customDimensions | take 10"

# Verify URLs are redacted in logs
# Should see: "https://example.com/calendar.ics" (query string removed)
# Should NOT see: "https://example.com/calendar.ics?token=secret123"
```

**Verify:**
- [ ] Feed URLs in logs are redacted
- [ ] Full URLs not in error messages
- [ ] Table storage connection secured
- [ ] Function keys rotated regularly

---

## Documentation Updates

**Update Internal Docs:**
- [ ] Update runbooks with new status fields
- [ ] Update on-call guide with new alert types
- [ ] Update user-facing docs with new features
- [ ] Add reschedule notification examples

**Update User Communications:**
- [ ] Inform users about duplicate detection changes
- [ ] Explain potential duplicate flagging
- [ ] Document how to view reschedules
- [ ] Provide guidance on off-season alerts

---

## Success Criteria

**Deployment is successful when:**
- [x] All tests passing (62/62 in Phase 2)
- [x] Build completes without errors
- [ ] Azure Function deploys successfully
- [ ] Timer refresh runs and completes
- [ ] status.json updates with new fields
- [ ] Manual refresh returns new response structure
- [ ] No critical errors in Application Insights
- [ ] Feed management UI works with validation
- [ ] Monitoring alerts configured and tested

**Operational success (Week 1):**
- [ ] Service maintains >95% healthy state
- [ ] Feed success rate >90%
- [ ] No critical alerts (except during incidents)
- [ ] Reschedule detection working
- [ ] Feed change alerts accurate

---

## Support Contacts

**Deployment Issues:**
- Azure Function deployment failures → Azure support
- Build/test failures → Development team
- Configuration issues → DevOps team

**Operational Issues:**
- Feed failures → Platform-specific support (see MONITORING_GUIDE.md)
- Publishing failures → Azure storage support
- Performance issues → Application Insights analysis

**User-Facing Issues:**
- Duplicate events → Review potential duplicates, explain new behavior
- Missing events → Check cancelled event filtering, reschedule detection
- Stale data → Check operational state and calendar ages

---

## Appendix: Deployment Checklist

### Pre-Deployment
- [ ] Code reviewed and approved
- [ ] All tests passing locally
- [ ] Documentation reviewed
- [ ] Breaking changes communicated
- [ ] Backup plan ready (rollback commits identified)
- [ ] Maintenance window scheduled (if needed)

### Deployment
- [ ] Deploy backend (Azure Functions)
- [ ] Deploy frontend (management UI)
- [ ] Verify deployment successful
- [ ] Trigger manual refresh
- [ ] Check status.json updated

### Post-Deployment
- [ ] Verify automatic timer working
- [ ] Test API endpoints
- [ ] Test feed management UI
- [ ] Setup monitoring alerts
- [ ] Test alert rules
- [ ] Update documentation
- [ ] Notify stakeholders

### Week 1 Follow-Up
- [ ] Review operational state logs
- [ ] Check feed success rates
- [ ] Review potential duplicates
- [ ] Monitor reschedule detection
- [ ] Address any issues
- [ ] Collect user feedback

---

## References

- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Phase 1 details
- [PHASE2_SUMMARY.md](PHASE2_SUMMARY.md) - Phase 2 details
- [MONITORING_GUIDE.md](MONITORING_GUIDE.md) - Complete monitoring reference
- [STATE_MACHINE.md](STATE_MACHINE.md) - State transitions
- [DUPLICATE_DETECTION.md](DUPLICATE_DETECTION.md) - Duplicate handling
- [PLATFORM_INTEGRATION_NOTES.md](PLATFORM_INTEGRATION_NOTES.md) - Platform specifics

---

## Version History

- **2026-04-27**: Initial deployment guide for Phase 1 & 2
- Covers deployment, verification, monitoring setup, and troubleshooting
