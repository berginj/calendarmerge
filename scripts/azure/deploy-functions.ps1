param(
  [string]$SubscriptionId = $env:AZ_SUBSCRIPTION_ID,
  [string]$ResourceGroup = $env:AZ_RESOURCE_GROUP,
  [string]$FunctionAppName = $env:AZ_FUNCTIONAPP_NAME,
  [string]$OutputZip = ".artifacts/calendarmerge-functions.zip"
)

$ErrorActionPreference = "Stop"

function Assert-Required([string]$Value, [string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required."
  }
}

Assert-Required $ResourceGroup "AZ_RESOURCE_GROUP"
Assert-Required $FunctionAppName "AZ_FUNCTIONAPP_NAME"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$packageScript = Join-Path $PSScriptRoot "package-functions.ps1"

if ($SubscriptionId) {
  & az account set --subscription $SubscriptionId | Out-Null
}

$packageOutput = & $packageScript -OutputZip $OutputZip
$zipPath = ($packageOutput | Select-Object -Last 1).ToString().Trim()

if ([string]::IsNullOrWhiteSpace($zipPath) -or -not (Test-Path $zipPath)) {
  throw "Unable to resolve the deployment zip path from package-functions.ps1."
}

Push-Location $projectRoot
try {
  & az functionapp deployment source config-zip `
    --resource-group $ResourceGroup `
    --name $FunctionAppName `
    --src $zipPath `
    --build-remote false `
    --output none
} finally {
  Pop-Location
}

Write-Host "Deployed package: $zipPath"
Write-Host "Status endpoint: https://$FunctionAppName.azurewebsites.net/api/status"
