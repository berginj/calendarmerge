import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

// Diagnostic endpoint to test config loading
app.http("diagnostic", {
  methods: ["GET"],
  authLevel: "function",
  route: "diagnostic",
  handler: diagnosticHandler,
});

async function diagnosticHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    env: {},
    configTest: {},
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
    const config = getConfig();
    diagnostics.configTest = {
      success: true,
      serviceName: config.serviceName,
      feedCount: config.sourceFeeds.length,
      outputStorageAccount: config.outputStorageAccount,
    };
  } catch (error) {
    diagnostics.configTest = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    status: 200,
    jsonBody: diagnostics,
  };
}
