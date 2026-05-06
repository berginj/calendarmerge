import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createSuccessResponse, toHttpResponse } from "../lib/api-types";
import { generateId } from "../lib/util";

// Diagnostic endpoint to test config loading
app.http("diagnostic", {
  methods: ["GET"],
  authLevel: "function",
  route: "diagnostic",
  handler: diagnosticHandler,
});

export async function diagnosticHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const diagnostics = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    env: {},
    configTest: {},
    storageTests: {},
  };

  // Check environment variables
  diagnostics.env = {
    hasSourceFeedsJson: Boolean(process.env.SOURCE_FEEDS_JSON),
    OUTPUT_STORAGE_ACCOUNT: process.env.OUTPUT_STORAGE_ACCOUNT,
    ENABLE_TABLE_STORAGE: process.env.ENABLE_TABLE_STORAGE,
    hasStorageConnectionString: Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING),
  };

  // Test config loading
  try {
    const { getConfig } = await import("../lib/config");
    const { loadSourceFeeds } = await import("../lib/sourceFeeds");
    const { SettingsStore } = await import("../lib/settingsStore");
    const { getStorageConnectionString } = await import("../lib/util");
    const config = getConfig();
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const settingsStore = new SettingsStore(connectionString);
    const settings = await settingsStore.getSettings();
    const feeds = await loadSourceFeeds(config);

    diagnostics.configTest = {
      success: true,
      serviceName: config.serviceName,
      feedCount: config.sourceFeeds.length,
      outputStorageAccount: config.outputStorageAccount,
    };
    diagnostics.storageTests = {
      success: true,
      resolvedFeedCount: feeds.length,
      refreshSchedule: settings.refreshSchedule,
      outputBaseUrl: config.outputBaseUrl ?? null,
      gamesOutputBlobPath: config.gamesOutputBlobPath,
    };
  } catch (error) {
    diagnostics.configTest = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    diagnostics.storageTests = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return toHttpResponse(createSuccessResponse(requestId, diagnostics));
}
