# calendarmerge

`calendarmerge` is an Azure Functions v4 service that merges multiple source ICS feeds into one published ICS file in Azure Blob Storage.

## Features

**Web UI for Feed Management:**
- Add, edit, and delete calendar feed sources
- React-based management interface
- Feeds stored in Azure Table Storage
- Accessible at `https://<storage>.z13.web.core.windows.net/manage/`

**Backend Services:**
- Timer-triggered refresh job (every 15 minutes)
- HTTP manual refresh endpoint
- HTTP health/status endpoint
- REST API for feed management (GET/POST/PUT/DELETE)

**Published Outputs:**
- `calendar.ics` - Merged calendar feed
- `status.json` - Service health and diagnostics
- `manage/` - Feed management web UI

## Architecture

- Azure Functions handles scheduled and manual refreshes.
- Merge logic is implemented as pure TypeScript library code under `src/lib/`.
- Azure Blob Storage stores the public outputs in `$web/`.
- `status.json` is written on every run.
- `calendar.ics` is only replaced when all feeds succeed, or when there is no previous good calendar and at least one feed succeeds.
- If some feeds fail and a prior `calendar.ics` already exists, the service keeps that last known good file and records the errors in `status.json`.

**Duplicate Detection:**
- Two-stage deduplication removes duplicate events
- Stage 1: Identity-based (UID or summary+time+location)
- Stage 2: Same-day deduplication (catches duplicates across sources with different times)
- See [DUPLICATE_DETECTION.md](DUPLICATE_DETECTION.md) for details

## Config

The app reads configuration from Azure Functions app settings or `local.settings.json`.

**Feed Management:**
- Feeds can be managed via the web UI (stored in Azure Table Storage)
- Or configured via `SOURCE_FEEDS_JSON` environment variable (legacy mode)
- Set `ENABLE_TABLE_STORAGE=true` to load feeds from Table Storage

Required:

- `OUTPUT_STORAGE_ACCOUNT`
- `SOURCE_FEEDS_JSON` (used as fallback when table storage is empty or disabled)

Supported settings:

| Setting | Required | Default | Notes |
| --- | --- | --- | --- |
| `SOURCE_FEEDS_JSON` | Yes* | none | JSON array of feed objects or URLs. *Only required if `ENABLE_TABLE_STORAGE=false` |
| `OUTPUT_STORAGE_ACCOUNT` | Yes | none | Azure Storage account used for published output. |
| `ENABLE_TABLE_STORAGE` | No | `false` | Set to `true` to load feeds from Azure Table Storage. |
| `OUTPUT_CONTAINER` | No | `$web` | Blob container for published files. |
| `OUTPUT_BLOB_PATH` | No | `calendar.ics` | Public merged calendar path. |
| `STATUS_BLOB_PATH` | No | `status.json` | Diagnostics path. |
| `REFRESH_SCHEDULE` | No | `0 */15 * * * *` | Azure Functions NCRONTAB schedule. |
| `FETCH_TIMEOUT_MS` | No | `10000` | Per-request timeout. |
| `FETCH_RETRY_COUNT` | No | `2` | Retry count after the initial attempt. |
| `FETCH_RETRY_DELAY_MS` | No | `750` | Base retry backoff in milliseconds. |
| `SERVICE_NAME` | No | `calendarmerge` | Included in logs and `status.json`. |

Example `SOURCE_FEEDS_JSON`:

```json
[
  {
    "id": "school",
    "name": "School Calendar",
    "url": "https://example.com/school.ics"
  },
  {
    "id": "athletics",
    "name": "Athletics",
    "url": "https://example.com/athletics.ics"
  }
]
```

## Migrating to Feed Management UI

To enable the web-based feed management UI:

### 1. Migrate Existing Feeds to Table Storage

```bash
# Run migration script to copy feeds from SOURCE_FEEDS_JSON to Table Storage
npx tsx scripts/migrate-feeds-to-table.ts
```

### 2. Enable Table Storage

```powershell
# Update Azure Function App settings
az functionapp config appsettings set `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --settings ENABLE_TABLE_STORAGE=true
```

### 3. Access the UI

Navigate to: `https://<storage-account>.z13.web.core.windows.net/manage/`

**Features:**
- Add new calendar feeds
- Edit feed names and URLs
- Delete feeds (soft delete)
- Changes take effect on next refresh (automatic or manual)

**Note:** `SOURCE_FEEDS_JSON` is kept as a fallback. If table storage is empty or fails to load, feeds from the environment variable will be used.

## Local Dev

Prerequisites:

- Node.js 20+
- npm
- Azure Functions Core Tools v4
- Azure CLI
- Either Azurite or a real `AzureWebJobsStorage` connection string for local Functions runtime storage

Setup:

```powershell
Copy-Item local.settings.example.json local.settings.json
npm ci
npm run build
```

Run tests:

```powershell
npm test
```

Run locally:

```powershell
func start
```

Local endpoints:

- `GET http://localhost:7071/api/status`
- `POST http://localhost:7071/api/refresh`

## Provision Azure

The bootstrap script assumes you are already signed in with `az login`.

Set the requested placeholders:

```powershell
$env:AZ_SUBSCRIPTION_ID = "AZ_SUBSCRIPTION_ID"
$env:AZ_LOCATION = "AZ_LOCATION"
$env:AZ_RESOURCE_GROUP = "AZ_RESOURCE_GROUP"
$env:AZ_STORAGE_ACCOUNT = "AZ_STORAGE_ACCOUNT"
$env:AZ_FUNCTIONAPP_NAME = "AZ_FUNCTIONAPP_NAME"
$env:AZ_APPINSIGHTS_NAME = "AZ_APPINSIGHTS_NAME"
$env:SOURCE_FEEDS_JSON = '[{"id":"school","name":"School Calendar","url":"https://example.com/calendar.ics"}]'
```

Provision infrastructure:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\azure\bootstrap.ps1
```

What the bootstrap script does:

- runs `az group create`
- deploys `infra/main.bicep`
- creates the Function App with `az functionapp create`
- sets app settings with `az functionapp config appsettings set`
- grants the Function App managed identity `Storage Blob Data Contributor`
- enables blob static website hosting with `az storage blob service-properties update`
- uploads `public/index.html`

## Deploy Functions

Build, package, and zip-deploy the Functions app:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\azure\deploy-functions.ps1
```

That script:

- runs `npm ci`
- runs `npm run build`
- creates a clean deployment package under `.artifacts/`
- installs production dependencies into the staged package
- deploys with `az functionapp deployment source config-zip`

## CI/CD

This repo includes a GitHub Actions workflow at `.github/workflows/calendarmerge-functions.yml` that automatically deploys on push to main:

**Backend:**
- Installs dependencies
- Runs tests
- Builds deployment package
- Deploys to Azure Functions

**Frontend:**
- Builds React app
- Deploys to Azure Blob Storage (`$web/manage/`)

**Authentication:** Uses GitHub OIDC (no secrets stored in code)

### Quick Setup

Run the automated setup script:

```powershell
.\scripts\azure\setup-github-deployment.ps1 `
  -SubscriptionId "your-subscription-id" `
  -ResourceGroup "your-resource-group" `
  -StorageAccount "your-storage-account" `
  -FunctionAppName "your-function-app" `
  -GitHubOrg "your-github-username" `
  -GitHubRepo "your-repo-name"
```

Then add the output values as GitHub secrets and variables.

**Detailed instructions:** See [GITHUB_DEPLOYMENT.md](GITHUB_DEPLOYMENT.md)

### Required GitHub Secrets

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

### Required GitHub Variables

- `AZ_RESOURCE_GROUP`
- `AZ_FUNCTIONAPP_NAME`
- `AZ_STORAGE_ACCOUNT`

## Public URLs

Discover the static website base URL:

```powershell
$web = az storage account show `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_STORAGE_ACCOUNT `
  --query "primaryEndpoints.web" `
  --output tsv
```

Public output URLs:

- `$($web.TrimEnd('/'))/calendar.ics` - Merged calendar feed
- `$($web.TrimEnd('/'))/status.json` - Service status
- `$($web.TrimEnd('/'))/manage/` - Feed management UI

Blob paths written by the app:

- `$web/calendar.ics`
- `$web/status.json`
- `$web/manage/` - Frontend app

Function endpoints:

**Public:**
- `https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/status` - Health check
- `https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/feeds` - List feeds (GET)

**Protected:**
- `https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/refresh` - Manual refresh (POST)
- `https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/feeds` - Create feed (POST)
- `https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/feeds/{id}` - Update/Delete feed (PUT/DELETE)

Manual refresh uses Function auth. Retrieve a key and invoke it like this:

```powershell
$refreshKey = az functionapp keys list `
  --resource-group $env:AZ_RESOURCE_GROUP `
  --name $env:AZ_FUNCTIONAPP_NAME `
  --query "functionKeys.default" `
  --output tsv

Invoke-WebRequest `
  -Method POST `
  -Uri "https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/refresh?code=$refreshKey"
```

## Testing Notes

The unit tests cover:

- duplicate raw UIDs across feeds
- deterministic fallback dedupe when UID is missing
- all-day event preservation
- cancelled event precedence
- malformed ICS input rejection

## Rollback And Troubleshooting

- Partial feed failures do not overwrite an existing `calendar.ics`; check `status.json` for per-feed errors.
- Full failures write `status.json` and keep the existing `calendar.ics` untouched.
- If publishing fails because the Function App cannot write blobs, confirm the managed identity still has `Storage Blob Data Contributor` on the storage account.
- If local runs fail on storage bindings, set `AzureWebJobsStorage` in `local.settings.json` to Azurite or a real storage connection string.
- To roll back code, redeploy a previous commit with `scripts/azure/deploy-functions.ps1` and trigger a manual refresh after the deployment completes.
