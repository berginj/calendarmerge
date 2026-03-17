#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Configure GitHub Actions deployment with OIDC authentication

.DESCRIPTION
    This script sets up federated credentials and role assignments for GitHub Actions
    to deploy your calendarmerge app to Azure without storing secrets.

.PARAMETER SubscriptionId
    Azure subscription ID

.PARAMETER ResourceGroup
    Azure resource group name

.PARAMETER StorageAccount
    Azure storage account name

.PARAMETER FunctionAppName
    Azure Function App name

.PARAMETER GitHubOrg
    GitHub organization or username

.PARAMETER GitHubRepo
    GitHub repository name

.EXAMPLE
    .\setup-github-deployment.ps1 `
      -SubscriptionId "xxx" `
      -ResourceGroup "calendarmerge-rg" `
      -StorageAccount "calendarmergestore" `
      -FunctionAppName "calendarmerge-func" `
      -GitHubOrg "myusername" `
      -GitHubRepo "calendarmerge"
#>

param(
  [Parameter(Mandatory=$true)]
  [string]$SubscriptionId,

  [Parameter(Mandatory=$true)]
  [string]$ResourceGroup,

  [Parameter(Mandatory=$true)]
  [string]$StorageAccount,

  [Parameter(Mandatory=$true)]
  [string]$FunctionAppName,

  [Parameter(Mandatory=$true)]
  [string]$GitHubOrg,

  [Parameter(Mandatory=$true)]
  [string]$GitHubRepo
)

$ErrorActionPreference = "Stop"

Write-Host "Setting up GitHub Actions deployment for $GitHubOrg/$GitHubRepo" -ForegroundColor Cyan
Write-Host ""

# Set subscription context
Write-Host "Setting Azure subscription context..." -ForegroundColor Yellow
az account set --subscription $SubscriptionId
$tenantId = az account show --query tenantId --output tsv

Write-Host "  Subscription ID: $SubscriptionId" -ForegroundColor Gray
Write-Host "  Tenant ID: $tenantId" -ForegroundColor Gray
Write-Host ""

# Create Azure AD application
Write-Host "Creating Azure AD application..." -ForegroundColor Yellow
$appDisplayName = "GitHub-$GitHubRepo"

# Check if app already exists
$existingAppId = az ad app list --display-name $appDisplayName --query "[0].appId" --output tsv 2>$null

if ($existingAppId) {
  Write-Host "  App already exists, using existing: $existingAppId" -ForegroundColor Gray
  $appId = $existingAppId
} else {
  $appId = az ad app create --display-name $appDisplayName --query appId --output tsv
  Write-Host "  Created new app: $appId" -ForegroundColor Green
}

# Create service principal
Write-Host "Creating service principal..." -ForegroundColor Yellow
$existingSp = az ad sp show --id $appId --query id --output tsv 2>$null

if (-not $existingSp) {
  az ad sp create --id $appId --output none
  Write-Host "  Service principal created" -ForegroundColor Green
} else {
  Write-Host "  Service principal already exists" -ForegroundColor Gray
}

$spObjectId = az ad sp show --id $appId --query id --output tsv
Write-Host ""

# Configure federated credentials
Write-Host "Configuring federated credentials..." -ForegroundColor Yellow

# Main branch credential
$mainBranchCred = @{
  name = "GitHub-Main-Branch"
  issuer = "https://token.actions.githubusercontent.com"
  subject = "repo:$GitHubOrg/${GitHubRepo}:ref:refs/heads/main"
  audiences = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Compress

$existingMainCred = az ad app federated-credential list --id $appId --query "[?name=='GitHub-Main-Branch'].name" --output tsv 2>$null

if (-not $existingMainCred) {
  az ad app federated-credential create --id $appId --parameters $mainBranchCred --output none
  Write-Host "  Created federated credential for main branch" -ForegroundColor Green
} else {
  Write-Host "  Federated credential for main branch already exists" -ForegroundColor Gray
}

# PR credential (optional)
$prCred = @{
  name = "GitHub-PR"
  issuer = "https://token.actions.githubusercontent.com"
  subject = "repo:$GitHubOrg/${GitHubRepo}:pull_request"
  audiences = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Compress

$existingPrCred = az ad app federated-credential list --id $appId --query "[?name=='GitHub-PR'].name" --output tsv 2>$null

if (-not $existingPrCred) {
  az ad app federated-credential create --id $appId --parameters $prCred --output none
  Write-Host "  Created federated credential for pull requests" -ForegroundColor Green
} else {
  Write-Host "  Federated credential for pull requests already exists" -ForegroundColor Gray
}
Write-Host ""

# Grant permissions
Write-Host "Granting Azure permissions..." -ForegroundColor Yellow

# Contributor on resource group
$rgScope = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup"
$existingRgRole = az role assignment list --assignee $appId --scope $rgScope --role "Contributor" --query "[0].id" --output tsv 2>$null

if (-not $existingRgRole) {
  az role assignment create --assignee $appId --role "Contributor" --scope $rgScope --output none
  Write-Host "  Granted Contributor on resource group" -ForegroundColor Green
} else {
  Write-Host "  Contributor role already assigned to resource group" -ForegroundColor Gray
}

# Storage Blob Data Contributor
$storageId = az storage account show --name $StorageAccount --resource-group $ResourceGroup --query id --output tsv
$existingStorageRole = az role assignment list --assignee $appId --scope $storageId --role "Storage Blob Data Contributor" --query "[0].id" --output tsv 2>$null

if (-not $existingStorageRole) {
  az role assignment create --assignee $appId --role "Storage Blob Data Contributor" --scope $storageId --output none
  Write-Host "  Granted Storage Blob Data Contributor" -ForegroundColor Green
} else {
  Write-Host "  Storage Blob Data Contributor role already assigned" -ForegroundColor Gray
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "GitHub Actions Setup Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Add these SECRETS to your GitHub repository:" -ForegroundColor White
Write-Host "   Settings → Secrets and variables → Actions → Secrets" -ForegroundColor Gray
Write-Host ""
Write-Host "   AZURE_CLIENT_ID:        $appId" -ForegroundColor Cyan
Write-Host "   AZURE_TENANT_ID:        $tenantId" -ForegroundColor Cyan
Write-Host "   AZURE_SUBSCRIPTION_ID:  $SubscriptionId" -ForegroundColor Cyan
Write-Host ""

Write-Host "2. Add these VARIABLES to your GitHub repository:" -ForegroundColor White
Write-Host "   Settings → Secrets and variables → Actions → Variables" -ForegroundColor Gray
Write-Host ""
Write-Host "   AZ_RESOURCE_GROUP:      $ResourceGroup" -ForegroundColor Cyan
Write-Host "   AZ_FUNCTIONAPP_NAME:    $FunctionAppName" -ForegroundColor Cyan
Write-Host "   AZ_STORAGE_ACCOUNT:     $StorageAccount" -ForegroundColor Cyan
Write-Host ""

Write-Host "3. Test deployment:" -ForegroundColor White
Write-Host "   - Go to Actions tab in GitHub" -ForegroundColor Gray
Write-Host "   - Run 'Deploy Calendar Merge' workflow manually" -ForegroundColor Gray
Write-Host ""

Write-Host "4. Or push to main branch to trigger automatic deployment" -ForegroundColor White
Write-Host ""

Write-Host "Repository: https://github.com/$GitHubOrg/$GitHubRepo" -ForegroundColor Blue
Write-Host ""
