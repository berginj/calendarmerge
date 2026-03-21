import { Logger } from "./log";
import { TableStore } from "./tableStore";
import { AppConfig, SourceFeedConfig } from "./types";
import { errorMessage, getStorageConnectionString, isTableStorageEnabled } from "./util";

export async function loadSourceFeeds(
  config: AppConfig,
  logger?: Logger,
): Promise<SourceFeedConfig[]> {
  if (!isTableStorageEnabled()) {
    return config.sourceFeeds;
  }

  const tableStore = new TableStore(getStorageConnectionString(config.outputStorageAccount));

  try {
    const feeds = await tableStore.listFeeds();

    if (feeds.length > 0) {
      logger?.info("feeds_loaded_from_table", { count: feeds.length });
      return feeds;
    }

    if (config.sourceFeeds.length > 0) {
      logger?.warn("table_storage_empty_fallback_to_json");
      return config.sourceFeeds;
    }

    logger?.warn("table_storage_empty_no_fallback");
    return [];
  } catch (error) {
    if (config.sourceFeeds.length > 0) {
      logger?.error("table_storage_load_failed_fallback_to_json", { error: errorMessage(error) });
      return config.sourceFeeds;
    }

    throw error;
  }
}
