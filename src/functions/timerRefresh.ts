import { app, InvocationContext, Timer } from "@azure/functions";

import { BlobStore } from "../lib/blobStore";
import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { runRefresh } from "../lib/refresh";
import { SettingsStore } from "../lib/settingsStore";

// Timer runs every 5 minutes, but actual refresh depends on user settings
app.timer("scheduledRefresh", {
  schedule: "0 */5 * * * *",
  handler: scheduledRefreshHandler,
});

async function scheduledRefreshHandler(_timer: Timer, context: InvocationContext): Promise<void> {
  const logger = createLogger(context);
  const config = getConfig();

  try {
    // Check settings to see if we should actually refresh
    const settingsStore = new SettingsStore(config.outputStorageAccount);
    const blobStore = new BlobStore(config);

    // Get last refresh time from status.json
    let lastRefreshTime: Date | undefined;
    try {
      const status = await blobStore.readStatus();
      if (status?.lastSuccessfulRefresh) {
        lastRefreshTime = new Date(status.lastSuccessfulRefresh);
      }
    } catch {
      // If we can't read status, assume we should refresh
      lastRefreshTime = undefined;
    }

    const shouldRefresh = await settingsStore.shouldRunRefresh(lastRefreshTime);

    if (!shouldRefresh) {
      logger.info("timer_skipped_per_settings", {
        lastRefresh: lastRefreshTime?.toISOString(),
      });
      return;
    }

    logger.info("timer_triggered_refresh");
    await runRefresh(logger, "timer");
  } catch (error) {
    logger.error("timer_settings_check_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    // If settings check fails, run refresh anyway (fail-safe)
    await runRefresh(logger, "timer");
  }
}
