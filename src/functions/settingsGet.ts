import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, generateId, getStorageConnectionString } from "../lib/util";
import { createErrorResponse, createSuccessResponse, ERROR_CODES, toHttpResponse } from "../lib/api-types";

app.http("getSettings", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "settings",
  handler: getSettingsHandler,
});

export async function getSettingsHandler(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  try {
    const config = getConfig();
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const { SettingsStore } = await import("../lib/settingsStore");
    const store = new SettingsStore(connectionString);
    const settings = await store.getSettings();

    logger.info("settings_retrieved", { requestId });

    return toHttpResponse(
      createSuccessResponse(requestId, { settings }),
    );
  } catch (error) {
    logger.error("settings_get_failed", { requestId, error: errorMessage(error) });

    return toHttpResponse(
      createErrorResponse(requestId, ERROR_CODES.INTERNAL_ERROR, "Failed to get settings"),
    );
  }
}
