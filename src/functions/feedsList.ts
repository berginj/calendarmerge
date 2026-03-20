import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { createLogger } from "../lib/log";

app.http("listFeeds", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "feeds",
  handler: listFeedsHandler,
});

async function listFeedsHandler(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const logger = createLogger(context);

  try {
    logger.info("feeds_list_requested");

    // Use dynamic imports to avoid module loading issues
    const { getConfig } = await import("../lib/config");
    const config = getConfig();
    logger.info("config_loaded", { feedCount: config.sourceFeeds.length });

    const enableTableStorage = process.env.ENABLE_TABLE_STORAGE?.toLowerCase() === "true";
    logger.info("table_storage_check", { enabled: enableTableStorage });

    let feeds;
    if (enableTableStorage) {
      logger.info("loading_from_table_storage");
      const { getStorageConnectionString } = await import("../lib/util");
      const { TableStore } = await import("../lib/tableStore");
      const connectionString = getStorageConnectionString(config.outputStorageAccount);
      const store = new TableStore(connectionString);
      feeds = await store.listFeeds();
      logger.info("table_storage_loaded", { count: feeds.length });
    } else {
      logger.info("loading_from_config");
      feeds = config.sourceFeeds;
    }

    logger.info("feeds_listed", { count: feeds.length, source: enableTableStorage ? "table" : "config" });

    return {
      status: 200,
      jsonBody: { feeds },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error("feeds_list_failed", {
      error: errorMsg,
      stack: errorStack,
      type: error?.constructor?.name,
    });

    return {
      status: 500,
      jsonBody: {
        error: "Failed to list feeds",
        details: errorMsg,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
