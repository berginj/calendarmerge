---
name: calendarmerge
description: Work on the CalendarMerge repository, an Azure Functions v4 TypeScript service with a React management UI that merges ICS calendar feeds, publishes sanitized ICS and Schedule-X JSON outputs, tracks operational state, and deploys to Azure. Use when Codex needs to inspect, modify, test, debug, document, run locally, deploy, or review calendarmerge code, configuration, frontend behavior, feed management, refresh logic, monitoring, duplicate/reschedule detection, or Azure/GitHub Actions workflows.
---

# CalendarMerge

## Start Here

Use this skill for the `calendarmerge` app. The canonical local repo is usually `C:\Users\bergi\App\calendarmerge`.

Before changing code:

1. Inspect git state and do not overwrite unrelated user changes.
2. Read [references/project-guide.md](references/project-guide.md) for the repo map, authoritative contracts, and commands relevant to the task.
3. Read the specific project docs named by the guide when a change touches API contracts, refresh state, feed storage, deployment, public outputs, security, or frontend design.
4. Follow existing code patterns in `src/lib`, `src/functions`, `test`, and `frontend/src` before adding new abstractions.

## Common Workflows

For backend work, prefer focused library changes under `src/lib/` and thin Azure Function handlers under `src/functions/`. Add or update Vitest coverage under `test/`, including integration or security tests when behavior crosses module boundaries.

For frontend work, use the existing React, TanStack Query, Radix, lucide, and local `ui` component patterns under `frontend/src`. Verify layout and behavior with frontend tests and a browser check when the UI changes.

For operational or deployment work, treat `README.md`, `DEPLOYMENT_GUIDE.md`, `GITHUB_DEPLOYMENT.md`, `MONITORING_GUIDE.md`, `STATE_MACHINE.md`, and `scripts/azure/` as the source of truth. Avoid changing Azure schedules, auth, storage paths, or publication semantics without checking the related contracts.

## Validate

Run the narrowest useful tests first, then broaden when the change has shared impact:

```powershell
npm test
npm run build
npm run build:frontend
```

Use `npm run dev:frontend` for the management UI and `npm start` or `func start` for local Azure Functions when end-to-end behavior matters.
