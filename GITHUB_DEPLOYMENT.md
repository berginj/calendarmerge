# GitHub Actions Deployment Setup

This guide walks you through setting up automatic deployment from GitHub using GitHub Actions with OIDC authentication (no secrets needed!).

## Prerequisites

- Azure subscription
- GitHub repository with this code
- Azure CLI installed locally
- Already provisioned Azure resources (run `bootstrap.ps1` first)

## Step 1: Create Azure AD Application for GitHub OIDC

Run these commands to create a service principal for GitHub Actions:

```bash
# Set your values
SUBSCRIPTION_ID="your-subscription-id"
RESOURCE_GROUP="your-resource-group"
STORAGE_ACCOUNT="your-storage-account"
FUNCTION_APP="your-function-app"
GITHUB_ORG="your-github-username-or-org"
GITHUB_REPO="your-repo-name"

# Create Azure AD application
APP_ID=$(az ad app create \
  --display-name "GitHub-${GITHUB_REPO}" \
  --query appId \
  --output tsv)

echo "App ID: $APP_ID"

# Create service principal
az ad sp create --id $APP_ID

# Get the service principal object ID
SP_OBJECT_ID=$(az ad sp show --id $APP_ID --query id --output tsv)

echo "Service Principal Object ID: $SP_OBJECT_ID"
```

## Step 2: Configure Federated Credentials for GitHub

```bash
# Create federated credential for main branch
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "GitHub-Main-Branch",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:'"$GITHUB_ORG"'/'"$GITHUB_REPO"':ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Optional: Create federated credential for pull requests
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "GitHub-PR",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:'"$GITHUB_ORG"'/'"$GITHUB_REPO"':pull_request",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

## Step 3: Grant Azure Permissions

Grant the service principal access to your Azure resources:

```bash
# Get tenant ID
TENANT_ID=$(az account show --query tenantId --output tsv)

echo "Tenant ID: $TENANT_ID"

# Grant Contributor access to resource group
az role assignment create \
  --assignee $APP_ID \
  --role "Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"

# Grant Storage Blob Data Contributor for frontend deployment
STORAGE_ID=$(az storage account show \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query id \
  --output tsv)

az role assignment create \
  --assignee $APP_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID
```

## Step 4: Configure GitHub Repository Secrets

Go to your GitHub repository settings:

**Settings → Secrets and variables → Actions**

### Add these Secrets:

1. **AZURE_CLIENT_ID**: `$APP_ID` (from Step 1)
2. **AZURE_TENANT_ID**: `$TENANT_ID` (from Step 3)
3. **AZURE_SUBSCRIPTION_ID**: `$SUBSCRIPTION_ID`

### Add these Variables (not secrets):

**Settings → Secrets and variables → Actions → Variables tab**

1. **AZ_RESOURCE_GROUP**: Your resource group name
2. **AZ_FUNCTIONAPP_NAME**: Your function app name
3. **AZ_STORAGE_ACCOUNT**: Your storage account name

## Step 5: Test the Deployment

### Option 1: Manual Trigger

1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **Deploy Calendar Merge** workflow
4. Click **Run workflow** → **Run workflow**

### Option 2: Push to Main

```bash
git add .
git commit -m "Set up GitHub Actions deployment"
git push origin main
```

The workflow will automatically:
- Install backend dependencies
- Run tests
- Build backend deployment package
- Install frontend dependencies
- Build frontend React app
- Deploy backend to Azure Functions
- Deploy frontend to Azure Blob Storage (`$web/manage/`)

## Step 6: Verify Deployment

After the workflow completes:

1. **Check Function App:**
   ```bash
   curl https://$FUNCTION_APP.azurewebsites.net/api/status
   ```

2. **Check Frontend:**
   ```bash
   STORAGE_ENDPOINT=$(az storage account show \
     --name $STORAGE_ACCOUNT \
     --resource-group $RESOURCE_GROUP \
     --query "primaryEndpoints.web" \
     --output tsv)

   echo "Frontend URL: ${STORAGE_ENDPOINT}manage/"
   ```

3. **View Deployment Logs:**
   - Go to GitHub Actions tab
   - Click on the latest workflow run
   - Expand each step to see logs

## Troubleshooting

### "Failed to get federated token" Error

**Cause:** Federated credentials not configured correctly.

**Fix:**
```bash
# Verify federated credentials
az ad app federated-credential list --id $APP_ID

# Make sure subject matches your repo:
# repo:OWNER/REPO:ref:refs/heads/main
```

### "Insufficient permissions" Error

**Cause:** Service principal doesn't have required permissions.

**Fix:**
```bash
# Re-grant permissions
az role assignment create \
  --assignee $APP_ID \
  --role "Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"
```

### Frontend Not Deploying

**Cause:** Missing Storage Blob Data Contributor role.

**Fix:**
```bash
az role assignment create \
  --assignee $APP_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID
```

### Workflow Skipped

**Cause:** Changes in paths not monitored by workflow.

**Fix:** The workflow triggers on changes to:
- `src/**`
- `frontend/**`
- `scripts/**`
- `package.json`
- Workflow file itself

If you changed other files, manually trigger the workflow.

## CI/CD Best Practices

### Branch Protection

Add branch protection rules for `main`:

1. Go to **Settings → Branches → Add rule**
2. Branch name pattern: `main`
3. Enable:
   - Require pull request before merging
   - Require status checks to pass (select your workflow)
   - Require branches to be up to date

### Deployment Environments

For production deployments, consider:

1. **Staging Environment:**
   - Create a separate workflow for staging
   - Deploy on pull requests
   - Different Azure resources

2. **Production Environment:**
   - Require manual approval
   - Add deployment protection rules in GitHub

Example with environments:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://your-app.azurewebsites.net
    steps:
      # ... deployment steps
```

### Secrets Rotation

Federated credentials don't expire, but if you need to rotate:

```bash
# Delete old credential
az ad app federated-credential delete \
  --id $APP_ID \
  --federated-credential-id <credential-id>

# Create new one (Step 2)
```

## Summary of What Gets Deployed

Each push to `main` triggers:

1. ✅ Backend Functions (`src/`) → Azure Functions
2. ✅ Frontend React App (`frontend/`) → Blob Storage `$web/manage/`
3. ✅ Tests run before deployment
4. ✅ Build artifacts created
5. ✅ Zero-downtime deployment

**Deployment Time:** ~2-3 minutes

**Cost:** GitHub Actions is free for public repos, 2000 minutes/month for private repos.

## Next Steps

- Set up branch protection rules
- Configure deployment notifications (Slack, Teams, email)
- Add staging environment
- Set up monitoring alerts for failed deployments

Your deployment pipeline is now fully automated! 🚀
