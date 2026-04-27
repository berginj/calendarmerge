import { Logger } from "./log";
import { TableStore } from "./tableStore";
import { AppConfig, SourceFeedConfig } from "./types";
import { errorMessage, getStorageConnectionString, isTableStorageEnabled } from "./util";

export async function loadSourceFeeds(
  config: AppConfig,
  logger?: Logger,
): Promise<SourceFeedConfig[]> {
  let allFeeds: SourceFeedConfig[];

  if (!isTableStorageEnabled()) {
    allFeeds = config.sourceFeeds;
  } else {
    try {
      const tableStore = new TableStore(getStorageConnectionString(config.outputStorageAccount));
      const feeds = await tableStore.listFeeds();

      if (feeds.length > 0) {
        logger?.info("feeds_loaded_from_table", { count: feeds.length });
        allFeeds = feeds;
      } else if (config.sourceFeeds.length > 0) {
        logger?.warn("table_storage_empty_fallback_to_json");
        allFeeds = config.sourceFeeds;
      } else {
        logger?.warn("table_storage_empty_no_fallback");
        allFeeds = [];
      }
    } catch (error) {
      if (config.sourceFeeds.length > 0) {
        logger?.error("table_storage_load_failed_fallback_to_json", { error: errorMessage(error) });
        allFeeds = config.sourceFeeds;
      } else {
        throw error;
      }
    }
  }

  // Filter out disabled feeds
  const enabledFeeds = allFeeds.filter((feed) => feed.enabled !== false);
  const disabledCount = allFeeds.length - enabledFeeds.length;

  if (disabledCount > 0) {
    logger?.info("feeds_filtered_disabled", {
      total: allFeeds.length,
      enabled: enabledFeeds.length,
      disabled: disabledCount,
    });
  }

  return enabledFeeds;
}
