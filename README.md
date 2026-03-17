# calendarmerge

`calendarmerge` is a small Azure Functions v4 service that merges multiple source ICS feeds into one published ICS file in Azure Blob Storage.

It publishes:

- `calendar.ics`
- `status.json`

It exposes:

- a timer-triggered refresh job
- an HTTP manual refresh endpoint
- an HTTP health/status endpoint

No frontend app is included because this repo folder did not already contain one. The only static asset is a tiny `index.html` for blob static website discoverability.

## Architecture

- Azure Functions handles scheduled and manual refreshes.
- Merge logic is implemented as pure TypeScript library code under `src/lib/`.
- Azure Blob Storage stores the public outputs in `$web/`.
- `status.json` is written on every run.
- `calendar.ics` is only replaced when all feeds succeed, or when there is no previous good calendar and at least one feed succeeds.
- If some feeds fail and a prior `calendar.ics` already exists, the service keeps that last known good file and records the errors in `status.json`.

## Config

The app reads configuration from Azure Functions app settings or `local.settings.json`.

Required:

- `SOURCE_FEEDS_JSON`
- `OUTPUT_STORAGE_ACCOUNT`

Supported settings:

| Setting | Required | Default | Notes |
| --- | --- | --- | --- |
| `SOURCE_FEEDS_JSON` | Yes | none | JSON array of feed objects or URLs. |
| `OUTPUT_STORAGE_ACCOUNT` | Yes | none | Azure Storage account used for published output. |
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

This repo now includes a repo-root workflow at `../.github/workflows/calendarmerge-functions.yml` that:

- installs dependencies
- runs tests
- builds the deployment zip
- logs into Azure with GitHub OIDC
- deploys the backend with `az functionapp deployment source config-zip`

Configure these GitHub secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Configure these GitHub repository variables:

- `AZ_RESOURCE_GROUP`
- `AZ_FUNCTIONAPP_NAME`

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

- `$($web.TrimEnd('/'))/calendar.ics`
- `$($web.TrimEnd('/'))/status.json`

Blob paths written by the app:

- `$web/calendar.ics`
- `$web/status.json`

Function endpoints:

- `https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/status`
- `https://$env:AZ_FUNCTIONAPP_NAME.azurewebsites.net/api/refresh`

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
