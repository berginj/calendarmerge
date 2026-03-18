# Fix: Storage Blob Permission Error

## Problem

GitHub Actions workflow is failing with:
```
Storage Queue Data Reader
Storage Table Data Contributor
Storage Table Data Reader

Error: Process completed with exit code 1.
```

The service principal can read/write tables but **cannot upload to blob storage** (missing Storage Blob Data Contributor role).

---

## Solution: Add Storage Blob Data Contributor Role

### Step 1: Find Your Client ID

**Go to GitHub:**
https://github.com/berginj/calendarmerge/settings/secrets/actions

**Find the secret named:**
`AZUREAPPSERVICE_CLIENTID_4AFC0F50DAC647279FA31EE99554BFE6`

**Copy the value** - this is your `$CLIENT_ID`

---

### Step 2: Set Your Variables

```powershell
# Replace these with YOUR actual values
$CLIENT_ID = "PASTE_YOUR_CLIENT_ID_HERE"  # From GitHub secrets
$RESOURCE_GROUP = "YOUR_RESOURCE_GROUP"    # e.g., calendarmerge-rg
$STORAGE_ACCOUNT = "YOUR_STORAGE_ACCOUNT"  # e.g., calendarmergestorage
```

**Don't know your resource group/storage account?**

```bash
# List all your resources
az resource list --output table

# Or search for function apps
az functionapp list --query "[].{name:name,resourceGroup:resourceGroup}" --output table
```

---

### Step 3: Run the Fix Script

```powershell
.\scripts\azure\add-blob-permissions.ps1 `
  -ResourceGroup $RESOURCE_GROUP `
  -StorageAccount $STORAGE_ACCOUNT `
  -ServicePrincipalClientId $CLIENT_ID
```

---

## Alternative: Quick Fix with Azure CLI

If you have the values, run this one-liner:

```bash
# Get storage account ID
STORAGE_ID=$(az storage account show \
  --name YOUR_STORAGE_ACCOUNT \
  --resource-group YOUR_RESOURCE_GROUP \
  --query id \
  --output tsv)

# Add role
az role assignment create \
  --assignee YOUR_CLIENT_ID \
  --role "Storage Blob Data Contributor" \
  --scope $STORAGE_ID
```

---

## Verification

After running the script, verify the role was added:

```bash
az role assignment list \
  --assignee YOUR_CLIENT_ID \
  --scope $(az storage account show --name YOUR_STORAGE_ACCOUNT --resource-group YOUR_RESOURCE_GROUP --query id -o tsv) \
  --query "[].roleDefinitionName" \
  --output table
```

**Should show:**
- Storage Queue Data Reader
- Storage Table Data Contributor
- Storage Table Data Reader
- **Storage Blob Data Contributor** ← New!

---

## Re-run the Deployment

**Option 1:** Trigger manually
- Go to: https://github.com/berginj/calendarmerge/actions
- Click "Deploy Calendar Merge"
- Click "Re-run all jobs"

**Option 2:** Push a small change
```bash
git commit --allow-empty -m "Trigger deployment after fixing permissions"
git push origin main
```

---

## What This Fixes

With **Storage Blob Data Contributor** role:
- ✅ Frontend can deploy to `$web/manage/`
- ✅ Bootstrap script can upload `index.html`
- ✅ All blob storage operations work
- ✅ Workflow completes successfully

---

## Why This Happened

Azure Portal auto-created the service principal but only added:
- Table permissions (for feed storage)
- Queue permissions (not used yet)

But **forgot** blob permissions (needed for frontend deployment).

This script adds the missing permission.
