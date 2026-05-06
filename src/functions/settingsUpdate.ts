import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, generateId, getStorageConnectionString } from "../lib/util";
import type { AppSettings } from "../lib/settingsStore";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse } from "../lib/api-types";

app.http("updateSettings", {
  methods: ["PUT"],
  authLevel: "function",
  route: "settings",
  handler: updateSettingsHandler,
});

const VALID_SCHEDULES = ["every-15-min", "hourly", "every-2-hours", "business-hours", "manual-only"];

export async function updateSettingsHandler(
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

      return toHttpResponse(
        createErrorResponse(
          requestId,
          ERROR_CODES.VALIDATION_ERROR,
          "Invalid refresh schedule",
          `Valid options: ${VALID_SCHEDULES.join(", ")}`,
          { refreshSchedule: VALID_SCHEDULES },
        ),
      );
    }

    const config = getConfig();
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const { SettingsStore } = await import("../lib/settingsStore");
    const store = new SettingsStore(connectionString);
    const settings = await store.updateSettings(body);

    logger.info("settings_updated", { requestId, refreshSchedule: settings.refreshSchedule });

    return toHttpResponse(
      createSuccessResponse(requestId, { settings }, "Settings updated successfully"),
    );
  } catch (error) {
    logger.error("settings_update_failed", { requestId, error: errorMessage(error) });

    return toHttpResponse(
      createErrorResponse(requestId, ERROR_CODES.INTERNAL_ERROR, "Failed to update settings"),
    );
  }
}
