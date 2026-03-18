#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Add Storage Blob Data Contributor role for GitHub Actions deployment

.DESCRIPTION
    This script grants the GitHub Actions service principal permission to deploy
    the frontend to Azure Blob Storage.

.PARAMETER ResourceGroup
    Azure resource group name

.PARAMETER StorageAccount
    Azure storage account name

.PARAMETER ServicePrincipalClientId
    The client ID from AZUREAPPSERVICE_CLIENTID_* secret
    (Find in GitHub: Settings -> Secrets -> Look for AZUREAPPSERVICE_CLIENTID_*)
#>

param(
  [Parameter(Mandatory=$true)]
  [string]$ResourceGroup,

  [Parameter(Mandatory=$true)]
  [string]$StorageAccount,

  [Parameter(Mandatory=$true)]
  [string]$ServicePrincipalClientId
)

$ErrorActionPreference = "Stop"

Write-Host "Adding Storage Blob Data Contributor role..." -ForegroundColor Cyan
Write-Host ""

# Get storage account resource ID
$storageId = az storage account show `
  --name $StorageAccount `
  --resource-group $ResourceGroup `
  --query id `
  --output tsv

Write-Host "Storage Account: $StorageAccount" -ForegroundColor Gray
Write-Host "Storage ID: $storageId" -ForegroundColor Gray
Write-Host "Service Principal: $ServicePrincipalClientId" -ForegroundColor Gray
Write-Host ""

# Check if role already exists
$existingRole = az role assignment list `
  --assignee $ServicePrincipalClientId `
  --scope $storageId `
  --role "Storage Blob Data Contributor" `
  --query "[0].id" `
  --output tsv 2>$null

if ($existingRole) {
  Write-Host "Storage Blob Data Contributor role already assigned!" -ForegroundColor Green
  exit 0
}

# Add the role
Write-Host "Assigning Storage Blob Data Contributor role..." -ForegroundColor Yellow

az role assignment create `
  --assignee $ServicePrincipalClientId `
  --role "Storage Blob Data Contributor" `
  --scope $storageId `
  --output none

Write-Host ""
Write-Host "✓ Role assigned successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "The GitHub Actions workflow can now deploy the frontend to blob storage." -ForegroundColor Cyan
