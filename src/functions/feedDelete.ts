import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { TableStore } from "../lib/tableStore";
import { errorMessage } from "../lib/util";

app.http("deleteFeed", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "feeds/{feedId}",
  handler: deleteFeedHandler,
});

async function deleteFeedHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const logger = createLogger(context);

  try {
    const feedId = request.params.feedId;
    if (!feedId) {
      return {
        status: 400,
        jsonBody: { error: "Feed ID is required" },
      };
    }

    const config = getConfig();
    const store = new TableStore(config.outputStorageAccount);

    // Check if feed exists
    const existing = await store.getFeed(feedId);
    if (!existing) {
      logger.warn("feed_delete_not_found", { feedId });

      return {
        status: 404,
        jsonBody: { error: "Feed not found" },
      };
    }

    // Soft delete (set enabled=false)
    await store.softDeleteFeed(feedId);

    logger.info("feed_deleted", { feedId });

    return {
      status: 200,
      jsonBody: { message: "Feed deleted successfully" },
    };
  } catch (error) {
    logger.error("feed_delete_failed", { error: errorMessage(error) });

    return {
      status: 500,
      jsonBody: { error: "Failed to delete feed" },
    };
  }
}
