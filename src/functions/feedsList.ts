import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { getConfig } from "../lib/config";
import { createLogger } from "../lib/log";
import { loadSourceFeeds } from "../lib/sourceFeeds";
import { errorMessage } from "../lib/util";

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
    const feeds = await loadSourceFeeds(config, logger);

    return {
      status: 200,
      jsonBody: {
        feeds,
        count: feeds.length,
      },
    };
  } catch (error) {
    logger.error("feeds_list_failed", { error: errorMessage(error) });

    return {
      status: 500,
      jsonBody: {
        error: "Failed to load feeds",
        details: errorMessage(error),
      },
    };
  }
}
