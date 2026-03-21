import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, getStorageConnectionString } from "../lib/util";
import type { AppSettings } from "../lib/settingsStore";

app.http("updateSettings", {
  methods: ["PUT"],
  authLevel: "function",
  route: "settings",
  handler: updateSettingsHandler,
});

const VALID_SCHEDULES = ["every-15-min", "hourly", "every-2-hours", "business-hours", "manual-only"];
const VALID_EVENT_FILTERS = ["all-events", "games-only"];

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

    if (body.eventFilter && !VALID_EVENT_FILTERS.includes(body.eventFilter)) {
      logger.warn("settings_update_invalid_event_filter", { eventFilter: body.eventFilter });

      return {
        status: 400,
        jsonBody: {
          error: "Invalid event filter",
          validOptions: VALID_EVENT_FILTERS,
        },
      };
    }

    const config = getConfig();
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const { SettingsStore } = await import("../lib/settingsStore");
    const store = new SettingsStore(connectionString);
    const settings = await store.updateSettings(body);

    logger.info("settings_updated", {
      refreshSchedule: settings.refreshSchedule,
      eventFilter: settings.eventFilter,
    });

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
