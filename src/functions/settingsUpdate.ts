import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { buildAdminUnauthorizedResponse, verifyAdminSession, verifyCsrfHeader } from "../lib/adminSession";
import { getConfig } from "../lib/config";
import { getInvalidGameFilterRegex, normalizeGameFilterRules } from "../lib/eventFilter";
import { createLogger } from "../lib/log";
import { errorMessage, generateId, getStorageConnectionString } from "../lib/util";
import type { AppSettings } from "../lib/settingsStore";
import type { GameFilterRules } from "../lib/types";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse, ValidationResult } from "../lib/api-types";
import { fieldError, invalid, parseJsonObjectRequest, valid, validationErrorResponse } from "../lib/httpValidation";

app.http("updateSettings", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "settings",
  handler: updateSettingsHandler,
});

const VALID_SCHEDULES = ["every-15-min", "hourly", "every-2-hours", "every-4-hours", "business-hours", "manual-only"] as const;
const GAME_FILTER_LIST_FIELDS = [
  "forceIncludeFeedIds",
  "forceExcludeFeedIds",
  "includeKeywords",
  "excludeKeywords",
  "includeRegex",
  "excludeRegex",
  "teamAliases",
] as const;

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
    if (!verifyAdminSession(request, config)) {
      return buildAdminUnauthorizedResponse(requestId);
    }
    if (["POST", "PUT", "DELETE"].includes(request.method.toUpperCase()) && !verifyCsrfHeader(request)) {
      return buildAdminUnauthorizedResponse(requestId, "Missing CSRF header");
    }
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

  if (input.gameFilter !== undefined) {
    if (!isRecord(input.gameFilter)) {
      fieldError(errors, "gameFilter", "Game filter rules must be an object");
    } else {
      const gameFilterValidation = validateGameFilter(input.gameFilter);
      if (!gameFilterValidation.valid) {
        for (const [field, messages] of Object.entries(gameFilterValidation.errors)) {
          for (const message of messages) {
            fieldError(errors, field, message);
          }
        }
      } else {
        updates.gameFilter = gameFilterValidation.data;
      }
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

function validateGameFilter(input: Record<string, unknown>): ValidationResult<GameFilterRules> {
  const errors: Record<string, string[]> = {};

  for (const field of GAME_FILTER_LIST_FIELDS) {
    const value = input[field];
    if (value === undefined) {
      continue;
    }

    if (!Array.isArray(value)) {
      fieldError(errors, `gameFilter.${field}`, "Must be an array of strings");
      continue;
    }

    const invalidEntry = value.find((entry) => typeof entry !== "string");
    if (invalidEntry !== undefined) {
      fieldError(errors, `gameFilter.${field}`, "All entries must be strings");
    }
  }

  const normalized = normalizeGameFilterRules(input as Partial<GameFilterRules>);
  const invalidPatterns = getInvalidGameFilterRegex(normalized);
  if (invalidPatterns.length > 0) {
    fieldError(errors, "gameFilter.includeRegex", `Invalid regex pattern(s): ${invalidPatterns.join(", ")}`);
  }

  if (Object.keys(errors).length > 0) {
    return invalid(errors);
  }

  return valid(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
