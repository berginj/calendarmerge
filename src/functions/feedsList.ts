import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { TableStore } from "../lib/tableStore";
import { getStorageConnectionString } from "../lib/util";

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
    const config = getConfig();
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const store = new TableStore(connectionString);
    const feeds = await store.listFeeds();

    logger.info("feeds_listed", { count: feeds.length });

    return {
      status: 200,
      jsonBody: { feeds },
    };
  } catch (error) {
    logger.error("feeds_list_failed", { error: String(error) });

    return {
      status: 500,
      jsonBody: { error: "Failed to list feeds" },
    };
  }
}
