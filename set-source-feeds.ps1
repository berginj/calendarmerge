#!/usr/bin/env pwsh
# Properly set SOURCE_FEEDS_JSON with correct JSON formatting

$jsonValue = @'
[{"id":"us-holidays","name":"US Holidays","url":"https://www.google.com/calendar/ical/en.usa%23holiday@group.v.calendar.google.com/public/basic.ics"}]
'@

Write-Host "Setting SOURCE_FEEDS_JSON..." -ForegroundColor Cyan
Write-Host "Value: $jsonValue" -ForegroundColor Gray
Write-Host ""

# Verify it's valid JSON first
try {
    $jsonValue | ConvertFrom-Json | Out-Null
    Write-Host "✓ JSON is valid" -ForegroundColor Green
} catch {
    Write-Host "✗ JSON is invalid!" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# Apply the setting
az functionapp config appsettings set `
    --name calendarmerge-func-prod `
    --resource-group calendarmerge-rg `
    --settings "SOURCE_FEEDS_JSON=$jsonValue" `
    --output none

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Setting applied successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Wait 30 seconds for app restart, then test:" -ForegroundColor Yellow
    Write-Host "https://calendarmerge-func-prod.azurewebsites.net/api/diagnostic" -ForegroundColor Cyan
} else {
    Write-Host "✗ Failed to apply setting" -ForegroundColor Red
}
