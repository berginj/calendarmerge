import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { getInvalidGameFilterRegex, normalizeGameFilterRules } from "../lib/eventFilter";
import { fetchFeed } from "../lib/fetchFeeds";
import { createLogger } from "../lib/log";
import { mergeFeedEvents } from "../lib/merge";
import { buildPublicCalendarArtifacts } from "../lib/publicCalendars";
import { DEFAULT_SETTINGS } from "../lib/settingsStore";
import { loadSourceFeeds } from "../lib/sourceFeeds";
import type { GameFilterRules, ParsedEvent } from "../lib/types";
import { errorMessage, generateId, getStorageConnectionString } from "../lib/util";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse, ValidationResult } from "../lib/api-types";
import { fieldError, invalid, parseJsonObjectRequest, valid, validationErrorResponse } from "../lib/httpValidation";

app.http("previewGameFilter", {
  methods: ["POST"],
  authLevel: "function",
  route: "settings/game-filter/preview",
  handler: previewGameFilterHandler,
});

interface PreviewRequest {
  gameFilter?: GameFilterRules;
}

export async function previewGameFilterHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  try {
    const parsed = await parseJsonObjectRequest(request);
    if (!parsed.valid) {
      logger.warn("game_filter_preview_invalid_json", { requestId, errors: parsed.errors });
      return validationErrorResponse(requestId, parsed.message, parsed.errors, parsed.code);
    }

    const validation = validatePreviewRequest(parsed.data);
    if (!validation.valid) {
      logger.warn("game_filter_preview_validation_failed", { requestId, errors: validation.errors });
      return validationErrorResponse(requestId, "Validation failed", validation.errors);
    }

    const config = getConfig();
    const { SettingsStore } = await import("../lib/settingsStore");
    const settingsStore = new SettingsStore(getStorageConnectionString(config.outputStorageAccount));
    const currentSettings = await settingsStore.getSettings().catch(() => DEFAULT_SETTINGS);
    const gameFilter = validation.data.gameFilter ?? currentSettings.gameFilter;
    const sourceFeeds = await loadSourceFeeds(config, logger);
    const sourceResults = await Promise.all(
      sourceFeeds.map((source) => fetchFeed(source, config, logger.setCategory("feed"))),
    );
    const successfulResults = sourceResults.filter((result) => result.status.ok);
    const failedFeeds = sourceResults
      .filter((result) => !result.status.ok)
      .map((result) => ({
        id: result.source.id,
        name: result.source.name,
        error: result.status.error ?? "Unknown feed failure",
      }));
    const mergeResult = successfulResults.length > 0
      ? mergeFeedEvents(successfulResults)
      : { events: [], potentialDuplicates: [] };
    const artifacts = buildPublicCalendarArtifacts(
      mergeResult.events,
      config.serviceName,
      new Date(),
      gameFilter,
    );
    const matchedIds = new Set(artifacts.publicGamesEvents.map((event) => event.mergedUid));
    const excludedEvents = artifacts.publicEvents.filter((event) => !matchedIds.has(event.mergedUid));

    logger.info("game_filter_preview_succeeded", {
      requestId,
      sourceFeedCount: sourceFeeds.length,
      publicEventCount: artifacts.publicEvents.length,
      matchedGameCount: artifacts.publicGamesEvents.length,
      failedFeedCount: failedFeeds.length,
    });

    return toHttpResponse(
      createSuccessResponse(requestId, {
        preview: {
          sourceFeedCount: sourceFeeds.length,
          fetchedFeedCount: successfulResults.length,
          failedFeedCount: failedFeeds.length,
          candidateEventCount: mergeResult.events.length,
          publicEventCount: artifacts.publicEvents.length,
          matchedGameCount: artifacts.publicGamesEvents.length,
          excludedEventCount: excludedEvents.length,
          cancelledEventsFiltered: artifacts.cancelledEventsFiltered,
          failedFeeds,
          matchedSamples: artifacts.publicGamesEvents.slice(0, 10).map(toPreviewEvent),
          excludedSamples: excludedEvents.slice(0, 10).map(toPreviewEvent),
        },
      }),
    );
  } catch (error) {
    logger.error("game_filter_preview_failed", { requestId, error: errorMessage(error) });

    return toHttpResponse(
      createErrorResponse(
        requestId,
        ERROR_CODES.INTERNAL_ERROR,
        "Failed to preview game filter",
        errorMessage(error),
      ),
    );
  }
}

function validatePreviewRequest(input: Record<string, unknown>): ValidationResult<PreviewRequest> {
  const errors: Record<string, string[]> = {};

  if (input.gameFilter === undefined) {
    return valid({});
  }

  if (!isRecord(input.gameFilter)) {
    fieldError(errors, "gameFilter", "Game filter rules must be an object");
    return invalid(errors);
  }

  const invalidRegex = getInvalidGameFilterRegex(input.gameFilter as Partial<GameFilterRules>);
  if (invalidRegex.length > 0) {
    fieldError(errors, "gameFilter", `Invalid regex pattern(s): ${invalidRegex.join(", ")}`);
  }

  if (Object.keys(errors).length > 0) {
    return invalid(errors);
  }

  return valid({
    gameFilter: normalizeGameFilterRules(input.gameFilter as Partial<GameFilterRules>),
  });
}

function toPreviewEvent(event: ParsedEvent): { title: string; start: string; sourceName: string; location?: string } {
  return {
    title: event.summary,
    start: event.start.iso,
    sourceName: event.sourceName,
    location: event.location || undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
