import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { errorMessage, generateId, getStorageConnectionString } from "../lib/util";

app.http("deleteFeed", {
  methods: ["DELETE"],
  authLevel: "function",
  route: "feeds/{feedId}",
  handler: deleteFeedHandler,
});

async function deleteFeedHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = generateId();
  const logger = createLogger(context).withContext(undefined, requestId).setCategory("api");

  try {
    const feedId = request.params.feedId;
    if (!feedId) {
      return {
        status: 400,
        jsonBody: { requestId, error: "Feed ID is required" },
      };
    }

    const config = getConfig();
    const connectionString = getStorageConnectionString(config.outputStorageAccount);
    const { TableStore } = await import("../lib/tableStore");
    const store = new TableStore(connectionString);

    // Check if feed exists
    const existing = await store.getFeed(feedId);
    if (!existing) {
      logger.warn("feed_delete_not_found", { requestId, feedId });

      return {
        status: 404,
        jsonBody: { requestId, error: "Feed not found" },
      };
    }

    // Soft delete (set enabled=false)
    await store.softDeleteFeed(feedId);

    logger.info("feed_deleted", { requestId, feedId });

    return {
      status: 200,
      jsonBody: { requestId, message: "Feed deleted successfully" },
    };
  } catch (error) {
    logger.error("feed_delete_failed", { requestId, error: errorMessage(error) });

    return {
      status: 500,
      jsonBody: { requestId, error: "Failed to delete feed" },
    };
  }
}
