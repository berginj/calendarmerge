import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, generateId, getStorageConnectionString } from "../lib/util";
import type { AppSettings } from "../lib/settingsStore";

app.http("updateSettings", {
  methods: ["PUT"],
  authLevel: "function",
  route: "settings",
  handler: updateSettingsHandler,
});

const VALID_SCHEDULES = ["every-15-min", "hourly", "every-2-hours", "business-hours", "manual-only"];

async function updateSettingsHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  try {
    const body = (await request.json()) as Partial<AppSettings>;

    // Validate refresh schedule
    if (body.refreshSchedule && !VALID_SCHEDULES.includes(body.refreshSchedule)) {
      logger.warn("settings_update_invalid_schedule", { requestId, schedule: body.refreshSchedule });

      return {
        status: 400,
        jsonBody: {
          requestId,
          error: "Invalid refresh schedule",
          validOptions: VALID_SCHEDULES,
        },
      };
    }

    const config = getConfig();
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const { SettingsStore } = await import("../lib/settingsStore");
    const store = new SettingsStore(connectionString);
    const settings = await store.updateSettings(body);

    logger.info("settings_updated", { requestId, refreshSchedule: settings.refreshSchedule });

    return {
      status: 200,
      jsonBody: {
        requestId,
        settings,
        message: "Settings updated successfully",
      },
    };
  } catch (error) {
    logger.error("settings_update_failed", { requestId, error: errorMessage(error) });

    return {
      status: 500,
      jsonBody: { requestId, error: "Failed to update settings" },
    };
  }
}
