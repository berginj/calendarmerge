#!/usr/bin/env pwsh
# Simple script to set SOURCE_FEEDS_JSON with proper JSON encoding

$settings = @{
    SOURCE_FEEDS_JSON = '[{"id":"us-holidays","name":"US Holidays","url":"https://www.google.com/calendar/ical/en.usa%23holiday@group.v.calendar.google.com/public/basic.ics"}]'
}

$tempFile = New-TemporaryFile

try {
    # Write settings as JSON
    $settings | ConvertTo-Json -Depth 10 | Set-Content -Path $tempFile.FullName -Encoding UTF8

    Write-Host "Applying settings to calendarmerge-func-prod..." -ForegroundColor Cyan

    # Apply using file
    az functionapp config appsettings set `
        --name calendarmerge-func-prod `
        --resource-group calendarmerge-rg `
        --settings `@$($tempFile.FullName)

    Write-Host "✓ Settings applied!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Wait 30 seconds for app restart, then test:" -ForegroundColor Yellow
    Write-Host "https://calendarmerge-func-prod.azurewebsites.net/api/diagnostic" -ForegroundColor Cyan

} finally {
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
}
