# Calendar Merge - Quick Start Guide

## 🚀 Setup GitHub Auto-Deployment

### One-Command Setup

```powershell
.\scripts\azure\setup-github-deployment.ps1 `
  -SubscriptionId "YOUR_SUBSCRIPTION_ID" `
  -ResourceGroup "YOUR_RESOURCE_GROUP" `
  -StorageAccount "YOUR_STORAGE_ACCOUNT" `
  -FunctionAppName "YOUR_FUNCTION_APP" `
  -GitHubOrg "YOUR_GITHUB_USERNAME" `
  -GitHubRepo "YOUR_REPO_NAME"
```

This script will:
- ✅ Create Azure AD app with federated credentials
- ✅ Grant required Azure permissions
- ✅ Display secrets/variables to add to GitHub

### Configure GitHub

**Add Secrets** (Settings → Secrets and variables → Actions → Secrets):
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

**Add Variables** (Settings → Secrets and variables → Actions → Variables):
- `AZ_RESOURCE_GROUP`
- `AZ_FUNCTIONAPP_NAME`
- `AZ_STORAGE_ACCOUNT`

### Test Deployment

**Option 1:** Manual trigger
- Go to **Actions** tab → **Deploy Calendar Merge** → **Run workflow**

**Option 2:** Push to main
```bash
git push origin main
```

---

## 📋 Local Development

### Backend (Terminal 1)

```bash
# Install dependencies
npm ci

# Build TypeScript
npm run build

# Start Azure Functions
func start
```

**Access:** http://localhost:7071/api/status

### Frontend (Terminal 2)

```bash
# Install frontend dependencies
npm run install:frontend

# Start dev server with hot reload
npm run dev:frontend
```

**Access:** http://localhost:5173

The dev server proxies `/api/*` requests to the backend at localhost:7071.

---

## 🔄 Enable Feed Management UI

### 1. Migrate Feeds

```bash
npx tsx scripts/migrate-feeds-to-table.ts
```

### 2. Enable Table Storage

```bash
az functionapp config appsettings set \
  --name YOUR_FUNCTION_APP \
  --resource-group YOUR_RESOURCE_GROUP \
  --settings ENABLE_TABLE_STORAGE=true
```

### 3. Access UI

**Local:** http://localhost:5173

**Production:** `https://YOUR_STORAGE.z13.web.core.windows.net/manage/`

---

## 🌐 Public URLs

After deployment, access:

**Merged Calendar:**
```
https://YOUR_STORAGE.z13.web.core.windows.net/calendar.ics
```

**Feed Management UI:**
```
https://YOUR_STORAGE.z13.web.core.windows.net/manage/
```

**API Health:**
```
https://YOUR_FUNCTION_APP.azurewebsites.net/api/status
```

---

## 📝 Common Tasks

### Add a Calendar Feed

**Via UI:**
1. Go to feed management UI
2. Click "Add New Feed"
3. Enter name and ICS URL
4. Click "Add Feed"

**Via API:**
```bash
curl -X POST https://YOUR_FUNCTION_APP.azurewebsites.net/api/feeds \
  -H "Content-Type: application/json" \
  -d '{"name":"My Calendar","url":"https://example.com/calendar.ics"}'
```

### Trigger Manual Refresh

```bash
# Get function key
REFRESH_KEY=$(az functionapp keys list \
  --resource-group YOUR_RESOURCE_GROUP \
  --name YOUR_FUNCTION_APP \
  --query "functionKeys.default" \
  --output tsv)

# Trigger refresh
curl -X POST "https://YOUR_FUNCTION_APP.azurewebsites.net/api/refresh" \
  -H "x-functions-key: $REFRESH_KEY"
```

### Check Service Status

```bash
curl https://YOUR_FUNCTION_APP.azurewebsites.net/api/status
```

### Build Frontend for Production

```bash
npm run build:frontend
```

Output: `frontend/build/`

---

## 🔧 Troubleshooting

### Frontend won't start locally

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Backend build errors

```bash
rm -rf dist node_modules package-lock.json
npm ci
npm run build
```

### Table Storage not loading feeds

**Check setting:**
```bash
az functionapp config appsettings list \
  --name YOUR_FUNCTION_APP \
  --resource-group YOUR_RESOURCE_GROUP \
  --query "[?name=='ENABLE_TABLE_STORAGE'].value" \
  --output tsv
```

**Check logs:**
```bash
az functionapp logs tail \
  --name YOUR_FUNCTION_APP \
  --resource-group YOUR_RESOURCE_GROUP
```

**Fallback behavior:** If table storage fails, feeds load from `SOURCE_FEEDS_JSON` environment variable.

### GitHub Actions deployment fails

**Check federated credentials:**
```bash
az ad app federated-credential list --id YOUR_APP_ID
```

**Check role assignments:**
```bash
az role assignment list --assignee YOUR_APP_ID
```

**Re-run setup script** to fix permissions.

---

## 📚 Additional Resources

- **Full GitHub Setup:** [GITHUB_DEPLOYMENT.md](GITHUB_DEPLOYMENT.md)
- **Full README:** [README.md](README.md)
- **Implementation Plan:** [.claude/plans/buzzing-petting-feather.md](.claude/plans/buzzing-petting-feather.md)

---

## 🎯 Next Steps

1. ✅ Run `setup-github-deployment.ps1`
2. ✅ Add secrets/variables to GitHub
3. ✅ Push to main branch or trigger workflow manually
4. ✅ Migrate feeds with `migrate-feeds-to-table.ts`
5. ✅ Enable `ENABLE_TABLE_STORAGE=true`
6. ✅ Access feed management UI
7. ✅ Subscribe to merged calendar in your calendar app!

**Questions?** Check [GITHUB_DEPLOYMENT.md](GITHUB_DEPLOYMENT.md) for detailed troubleshooting.
