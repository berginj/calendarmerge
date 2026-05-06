param(
  [string]$SubscriptionId = $env:AZ_SUBSCRIPTION_ID,
  [string]$Location = $env:AZ_LOCATION,
  [string]$ResourceGroup = $env:AZ_RESOURCE_GROUP,
  [string]$StorageAccount = $env:AZ_STORAGE_ACCOUNT,
  [string]$FunctionAppName = $env:AZ_FUNCTIONAPP_NAME,
  [string]$AppInsightsName = $env:AZ_APPINSIGHTS_NAME,
  [string]$SourceFeedsJson = $env:SOURCE_FEEDS_JSON,
  [string]$EnableTableStorage = $(if ($env:ENABLE_TABLE_STORAGE) { $env:ENABLE_TABLE_STORAGE } else { 'false' }),
  [string]$OutputContainer = $(if ($env:OUTPUT_CONTAINER) { $env:OUTPUT_CONTAINER } else { '$web' }),
  [string]$OutputBlobPath = $(if ($env:OUTPUT_BLOB_PATH) { $env:OUTPUT_BLOB_PATH } else { 'calendar.ics' }),
  [string]$GamesOutputBlobPath = $(if ($env:OUTPUT_GAMES_BLOB_PATH) { $env:OUTPUT_GAMES_BLOB_PATH } else { 'calendar-games.ics' }),
  [string]$ScheduleXFullBlobPath = $(if ($env:SCHEDULE_X_FULL_BLOB_PATH) { $env:SCHEDULE_X_FULL_BLOB_PATH } else { 'schedule-x-full.json' }),
  [string]$ScheduleXGamesBlobPath = $(if ($env:SCHEDULE_X_GAMES_BLOB_PATH) { $env:SCHEDULE_X_GAMES_BLOB_PATH } else { 'schedule-x-games.json' }),
  [string]$StatusBlobPath = $(if ($env:STATUS_BLOB_PATH) { $env:STATUS_BLOB_PATH } else { 'status.json' }),
  [string]$InternalStatusContainer = $(if ($env:INTERNAL_STATUS_CONTAINER) { $env:INTERNAL_STATUS_CONTAINER } else { 'calendarmerge-internal' }),
  [string]$InternalStatusBlobPath = $(if ($env:INTERNAL_STATUS_BLOB_PATH) { $env:INTERNAL_STATUS_BLOB_PATH } else { 'status-internal.json' }),
  [string]$RefreshSchedule = $(if ($env:REFRESH_SCHEDULE) { $env:REFRESH_SCHEDULE } else { '0 */30 * * * *' }),
  [string]$FetchTimeoutMs = $(if ($env:FETCH_TIMEOUT_MS) { $env:FETCH_TIMEOUT_MS } else { '10000' }),
  [string]$FetchRetryCount = $(if ($env:FETCH_RETRY_COUNT) { $env:FETCH_RETRY_COUNT } else { '2' }),
  [string]$FetchRetryDelayMs = $(if ($env:FETCH_RETRY_DELAY_MS) { $env:FETCH_RETRY_DELAY_MS } else { '750' })
)

$ErrorActionPreference = "Stop"

function Assert-Required([string]$Value, [string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required."
  }
}

function Invoke-AzCli {
  param(
    [switch]$IgnoreErrors,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  $quotedArgs = $Arguments | ForEach-Object {
    if ($_ -match '[\s"&<>|^]') {
      '"' + ($_ -replace '"', '\"') + '"'
    } else {
      $_
    }
  }

  $commandLine = "az.cmd $($quotedArgs -join ' ') 2>&1"
  $output = & cmd.exe /d /c $commandLine
  $exitCode = $LASTEXITCODE

  if (-not $IgnoreErrors -and $exitCode -ne 0) {
    if ($output) {
      (($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim() | Write-Host
    }

    throw "az $($Arguments -join ' ') failed with exit code $exitCode."
  }

  if ($IgnoreErrors -and $exitCode -ne 0) {
    return ""
  }

  return (($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$deploymentName = "calendarmerge-bootstrap"

Assert-Required $Location "AZ_LOCATION"
Assert-Required $ResourceGroup "AZ_RESOURCE_GROUP"
Assert-Required $StorageAccount "AZ_STORAGE_ACCOUNT"
Assert-Required $FunctionAppName "AZ_FUNCTIONAPP_NAME"
Assert-Required $AppInsightsName "AZ_APPINSIGHTS_NAME"
if ($EnableTableStorage -ne "true") {
  Assert-Required $SourceFeedsJson "SOURCE_FEEDS_JSON"
}

if ($SubscriptionId) {
  Invoke-AzCli account set --subscription $SubscriptionId | Out-Null
}

Invoke-AzCli account show --output none | Out-Null

Invoke-AzCli group create --name $ResourceGroup --location $Location --output none | Out-Null

Invoke-AzCli deployment group create `
  --resource-group $ResourceGroup `
  --name $deploymentName `
  --template-file (Join-Path $projectRoot "infra/main.bicep") `
  --parameters location=$Location storageAccountName=$StorageAccount appInsightsName=$AppInsightsName `
  --output none | Out-Null

$existingFunctionName = Invoke-AzCli -IgnoreErrors functionapp show `
  --resource-group $ResourceGroup `
  --name $FunctionAppName `
  --query name `
  --output tsv

$functionExists = -not [string]::IsNullOrWhiteSpace($existingFunctionName)

if (-not $functionExists) {
  Invoke-AzCli functionapp create `
    --resource-group $ResourceGroup `
    --name $FunctionAppName `
    --storage-account $StorageAccount `
    --consumption-plan-location $Location `
    --os-type Windows `
    --functions-version 4 `
    --runtime node `
    --runtime-version 22 `
    --app-insights $AppInsightsName `
    --assign-identity "[system]" `
    --output none | Out-Null

  $createdFunctionName = Invoke-AzCli -IgnoreErrors functionapp show `
    --resource-group $ResourceGroup `
    --name $FunctionAppName `
    --query name `
    --output tsv

  if ([string]::IsNullOrWhiteSpace($createdFunctionName)) {
    throw "Function App creation did not succeed for $FunctionAppName."
  }
}

$settingsFile = [System.IO.Path]::GetTempFileName()
$settings = @{
  SERVICE_NAME = "calendarmerge"
  OUTPUT_STORAGE_ACCOUNT = $StorageAccount
  OUTPUT_CONTAINER = $OutputContainer
  OUTPUT_BLOB_PATH = $OutputBlobPath
  OUTPUT_GAMES_BLOB_PATH = $GamesOutputBlobPath
  SCHEDULE_X_FULL_BLOB_PATH = $ScheduleXFullBlobPath
  SCHEDULE_X_GAMES_BLOB_PATH = $ScheduleXGamesBlobPath
  STATUS_BLOB_PATH = $StatusBlobPath
  INTERNAL_STATUS_CONTAINER = $InternalStatusContainer
  INTERNAL_STATUS_BLOB_PATH = $InternalStatusBlobPath
  REFRESH_SCHEDULE = $RefreshSchedule
  FETCH_TIMEOUT_MS = $FetchTimeoutMs
  FETCH_RETRY_COUNT = $FetchRetryCount
  FETCH_RETRY_DELAY_MS = $FetchRetryDelayMs
  ENABLE_TABLE_STORAGE = $EnableTableStorage
  WEBSITE_RUN_FROM_PACKAGE = "1"
}

if (-not [string]::IsNullOrWhiteSpace($SourceFeedsJson)) {
  $settings.SOURCE_FEEDS_JSON = $SourceFeedsJson
}

try {
  $settings | ConvertTo-Json -Depth 4 | Set-Content -Path $settingsFile -Encoding utf8

  Invoke-AzCli functionapp config appsettings set `
    --resource-group $ResourceGroup `
    --name $FunctionAppName `
    --settings "@$settingsFile" `
    --output none | Out-Null
} finally {
  Remove-Item $settingsFile -Force -ErrorAction SilentlyContinue
}

$principalId = ""
for ($attempt = 0; $attempt -lt 12 -and [string]::IsNullOrWhiteSpace($principalId); $attempt += 1) {
  if ($attempt -gt 0) {
    Start-Sleep -Seconds 5
  }

  $principalId = Invoke-AzCli -IgnoreErrors functionapp identity show `
    --resource-group $ResourceGroup `
    --name $FunctionAppName `
    --query principalId `
    --output tsv
}

if ([string]::IsNullOrWhiteSpace($principalId)) {
  throw "Unable to resolve the Function App managed identity principal ID for $FunctionAppName."
}

$storageAccountId = Invoke-AzCli storage account show `
  --resource-group $ResourceGroup `
  --name $StorageAccount `
  --query id `
  --output tsv

$existingRoleAssignment = Invoke-AzCli -IgnoreErrors role assignment list `
  --assignee-object-id $principalId `
  --scope $storageAccountId `
  --role "Storage Blob Data Contributor" `
  --query "[0].id" `
  --output tsv

if (-not $existingRoleAssignment) {
  Invoke-AzCli role assignment create `
    --assignee-object-id $principalId `
    --assignee-principal-type ServicePrincipal `
    --scope $storageAccountId `
    --role "Storage Blob Data Contributor" `
    --output none | Out-Null
}

$existingTableRoleAssignment = Invoke-AzCli -IgnoreErrors role assignment list `
  --assignee-object-id $principalId `
  --scope $storageAccountId `
  --role "Storage Table Data Contributor" `
  --query "[0].id" `
  --output tsv

if (-not $existingTableRoleAssignment) {
  Invoke-AzCli role assignment create `
    --assignee-object-id $principalId `
    --assignee-principal-type ServicePrincipal `
    --scope $storageAccountId `
    --role "Storage Table Data Contributor" `
    --output none | Out-Null
}

$storageAccountKey = Invoke-AzCli storage account keys list `
  --resource-group $ResourceGroup `
  --account-name $StorageAccount `
  --query "[0].value" `
  --output tsv

Invoke-AzCli storage blob service-properties update `
  --account-name $StorageAccount `
  --account-key $storageAccountKey `
  --static-website true `
  --index-document index.html `
  --404-document index.html `
  --output none | Out-Null

Invoke-AzCli storage table create `
  --account-name $StorageAccount `
  --account-key $storageAccountKey `
  --name SourceFeeds `
  --output none | Out-Null

Invoke-AzCli storage table create `
  --account-name $StorageAccount `
  --account-key $storageAccountKey `
  --name AppSettings `
  --output none | Out-Null

Invoke-AzCli storage blob upload `
  --account-name $StorageAccount `
  --account-key $storageAccountKey `
  --container-name '$web' `
  --name index.html `
  --file (Join-Path $projectRoot "public/index.html") `
  --overwrite true `
  --content-type "text/html; charset=utf-8" `
  --only-show-errors `
  --output none | Out-Null

Invoke-AzCli storage blob upload `
  --account-name $StorageAccount `
  --account-key $storageAccountKey `
  --container-name '$web' `
  --name games.html `
  --file (Join-Path $projectRoot "public/games.html") `
  --overwrite true `
  --content-type "text/html; charset=utf-8" `
  --only-show-errors `
  --output none | Out-Null

Write-Host "Building frontend..."
Push-Location (Join-Path $projectRoot "frontend")
try {
  npm ci --silent 2>&1 | Out-Null
  npm run build --silent 2>&1 | Out-Null
} finally {
  Pop-Location
}

Write-Host "Uploading frontend to blob storage..."
$frontendBuildPath = Join-Path $projectRoot "frontend/build"
if (Test-Path $frontendBuildPath) {
  Get-ChildItem -Path $frontendBuildPath -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($frontendBuildPath.Length + 1).Replace('\', '/')
    $blobName = "manage/$relativePath"

    $contentType = switch ($_.Extension) {
      '.html' { 'text/html; charset=utf-8' }
      '.css' { 'text/css; charset=utf-8' }
      '.js' { 'application/javascript; charset=utf-8' }
      '.json' { 'application/json; charset=utf-8' }
      '.svg' { 'image/svg+xml' }
      '.png' { 'image/png' }
      '.jpg' { 'image/jpeg' }
      '.ico' { 'image/x-icon' }
      default { 'application/octet-stream' }
    }

    Invoke-AzCli storage blob upload `
      --account-name $StorageAccount `
      --account-key $storageAccountKey `
      --container-name '$web' `
      --name $blobName `
      --file $_.FullName `
      --overwrite true `
      --content-type $contentType `
      --only-show-errors `
      --output none | Out-Null
  }
}

$webEndpoint = Invoke-AzCli storage account show `
  --resource-group $ResourceGroup `
  --name $StorageAccount `
  --query "primaryEndpoints.web" `
  --output tsv

Invoke-AzCli functionapp config appsettings set `
  --resource-group $ResourceGroup `
  --name $FunctionAppName `
  --settings OUTPUT_BASE_URL=$($webEndpoint.TrimEnd('/')) `
  --output none | Out-Null

Write-Host "Provisioned resource group: $ResourceGroup"
Write-Host "Function App: $FunctionAppName"
Write-Host "Status endpoint: https://$FunctionAppName.azurewebsites.net/api/status"
Write-Host "Static website endpoint: $webEndpoint"
Write-Host "Feed management UI: $($webEndpoint.TrimEnd('/'))/manage/"
Write-Host "Public ICS URL: $($webEndpoint.TrimEnd('/'))/$OutputBlobPath"
Write-Host "Games ICS URL: $($webEndpoint.TrimEnd('/'))/$GamesOutputBlobPath"
Write-Host "Schedule-X full feed URL: $($webEndpoint.TrimEnd('/'))/$ScheduleXFullBlobPath"
Write-Host "Schedule-X games feed URL: $($webEndpoint.TrimEnd('/'))/$ScheduleXGamesBlobPath"
