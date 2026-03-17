import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { SettingsStore } from "../lib/settingsStore";
import { errorMessage } from "../lib/util";

app.http("getSettings", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "settings",
  handler: getSettingsHandler,
});

async function getSettingsHandler(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const logger = createLogger(context);

  try {
    const config = getConfig();
    const store = new SettingsStore(config.outputStorageAccount);
    const settings = await store.getSettings();

    logger.info("settings_retrieved");

    return {
      status: 200,
      jsonBody: { settings },
    };
  } catch (error) {
    logger.error("settings_get_failed", { error: errorMessage(error) });

    return {
      status: 500,
      jsonBody: { error: "Failed to get settings" },
    };
  }
}
