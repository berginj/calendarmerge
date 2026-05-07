import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, generateId, getStorageConnectionString } from "../lib/util";
import type { AppSettings } from "../lib/settingsStore";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse, ValidationResult } from "../lib/api-types";
import { fieldError, invalid, parseJsonObjectRequest, valid, validationErrorResponse } from "../lib/httpValidation";

app.http("updateSettings", {
  methods: ["PUT"],
  authLevel: "function",
  route: "settings",
  handler: updateSettingsHandler,
});

const VALID_SCHEDULES = ["every-15-min", "hourly", "every-2-hours", "business-hours", "manual-only"] as const;

export async function updateSettingsHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  try {
    const parsed = await parseJsonObjectRequest(request);
    if (!parsed.valid) {
      logger.warn("settings_update_invalid_json", { requestId, errors: parsed.errors });
      return validationErrorResponse(requestId, parsed.message, parsed.errors, parsed.code);
    }

    const validation = validateSettingsUpdate(parsed.data);
    if (!validation.valid) {
      logger.warn("settings_update_validation_failed", { requestId, errors: validation.errors });
      return validationErrorResponse(requestId, "Validation failed", validation.errors);
    }
    const body = validation.data;

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

function validateSettingsUpdate(input: Record<string, unknown>): ValidationResult<Partial<AppSettings>> {
  const errors: Record<string, string[]> = {};
  const updates: Partial<AppSettings> = {};

  if (input.refreshSchedule !== undefined) {
    if (typeof input.refreshSchedule !== "string") {
      fieldError(errors, "refreshSchedule", "Refresh schedule must be a string");
    } else if (!isValidSchedule(input.refreshSchedule)) {
      fieldError(errors, "refreshSchedule", `Valid options: ${VALID_SCHEDULES.join(", ")}`);
    } else {
      updates.refreshSchedule = input.refreshSchedule;
    }
  }

  if (Object.keys(errors).length > 0) {
    return invalid(errors);
  }

  return valid(updates);
}

function isValidSchedule(value: string): value is AppSettings["refreshSchedule"] {
  return VALID_SCHEDULES.includes(value as (typeof VALID_SCHEDULES)[number]);
}
