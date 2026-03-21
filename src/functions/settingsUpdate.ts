import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { AppSettings, SettingsStore } from "../lib/settingsStore";
import { errorMessage, getStorageConnectionString } from "../lib/util";

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
  const logger = createLogger(context);

  try {
    const body = (await request.json()) as Partial<AppSettings>;

    // Validate refresh schedule
    if (body.refreshSchedule && !VALID_SCHEDULES.includes(body.refreshSchedule)) {
      logger.warn("settings_update_invalid_schedule", { schedule: body.refreshSchedule });

      return {
        status: 400,
        jsonBody: {
          error: "Invalid refresh schedule",
          validOptions: VALID_SCHEDULES,
        },
      };
    }

    const config = getConfig();
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const store = new SettingsStore(connectionString);
    const settings = await store.updateSettings(body);

    logger.info("settings_updated", { refreshSchedule: settings.refreshSchedule });

    return {
      status: 200,
      jsonBody: {
        settings,
        message: "Settings updated successfully",
      },
    };
  } catch (error) {
    logger.error("settings_update_failed", { error: errorMessage(error) });

    return {
      status: 500,
      jsonBody: { error: "Failed to update settings" },
    };
  }
}
