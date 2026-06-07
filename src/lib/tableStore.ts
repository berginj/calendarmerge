import { TableClient } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

import { SourceFeedConfig } from "./types";
import { deriveFeedIdFromUrl, looksLikeConnectionString, slugifyId, truncateFeedId } from "./util";

export interface SourceFeedEntity {
  partitionKey: string; // "default" now, userId later
  rowKey: string; // feed.id
  id: string; // same as rowKey
  name: string;
  url: string;
  enabled?: boolean; // for soft deletes; legacy rows may omit it
  disabledAt?: string;
  restoreAvailableUntil?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface ListFeedsOptions {
  includeDisabled?: boolean;
  now?: Date;
}

export const FEED_RESTORE_WINDOW_DAYS = 15;

export class TableStore {
  private readonly tableClient: TableClient;
  private readonly tableName: string;

  constructor(connectionStringOrAccount: string, tableName: string = "SourceFeeds") {
    this.tableName = tableName;

    if (looksLikeConnectionString(connectionStringOrAccount)) {
      this.tableClient = TableClient.fromConnectionString(connectionStringOrAccount, tableName);
    } else {
      this.tableClient = new TableClient(
        `https://${connectionStringOrAccount}.table.core.windows.net`,
        tableName,
        new DefaultAzureCredential(),
      );
    }
  }

  async ensureTable(): Promise<void> {
    try {
      await this.tableClient.createTable();
    } catch (error: unknown) {
      // Ignore if table already exists (409 Conflict)
      if (error && typeof error === "object" && "statusCode" in error && error.statusCode !== 409) {
        throw error;
      }
    }
  }

  async listFeeds(
    partitionKey: string = "default",
    options: ListFeedsOptions = {},
  ): Promise<SourceFeedConfig[]> {
    const filter = `PartitionKey eq '${escapeODataString(partitionKey)}'`;
    const entities: SourceFeedConfig[] = [];
    const now = options.now ?? new Date();

    for await (const entity of this.tableClient.listEntities<SourceFeedEntity>({
      queryOptions: { filter },
    })) {
      if (entity.enabled === false) {
        if (!options.includeDisabled || !isDisabledFeedVisible(entity, now)) {
          continue;
        }
      }

      entities.push(toSourceFeedConfig(entity));
    }

    return entities;
  }

  async getFeed(feedId: string, partitionKey: string = "default"): Promise<SourceFeedEntity | null> {
    try {
      const entity = await this.tableClient.getEntity<SourceFeedEntity>(partitionKey, feedId);
      return entity as SourceFeedEntity;
    } catch (error: unknown) {
      // Return null for 404 Not Found
      if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async createFeed(
    feed: Omit<SourceFeedEntity, "createdAt" | "updatedAt">,
  ): Promise<SourceFeedEntity> {
    const now = new Date().toISOString();
    const entity: SourceFeedEntity = {
      ...feed,
      createdAt: now,
      updatedAt: now,
    };

    await this.tableClient.createEntity(entity);
    return entity;
  }

  async updateFeed(
    feedId: string,
    updates: Partial<Omit<SourceFeedEntity, "partitionKey" | "rowKey" | "createdAt" | "updatedAt">>,
    partitionKey: string = "default",
  ): Promise<SourceFeedEntity> {
    // Get existing entity
    const existing = await this.getFeed(feedId, partitionKey);
    if (!existing) {
      throw new Error(`Feed not found: ${feedId}`);
    }

    const normalizedUpdates = normalizeFeedUpdates(existing, updates);

    // Merge updates
    const updated: SourceFeedEntity = {
      ...existing,
      ...normalizedUpdates,
      partitionKey, // Ensure partition key doesn't change
      rowKey: feedId, // Ensure row key doesn't change
      updatedAt: new Date().toISOString(),
    };

    await this.tableClient.updateEntity(updated, "Merge");
    return updated;
  }

  async softDeleteFeed(feedId: string, partitionKey: string = "default"): Promise<void> {
    const now = new Date();
    await this.updateFeed(feedId, {
      enabled: false,
      disabledAt: now.toISOString(),
      restoreAvailableUntil: getRestoreAvailableUntil(now),
    }, partitionKey);
  }

  async hardDeleteFeed(feedId: string, partitionKey: string = "default"): Promise<void> {
    await this.tableClient.deleteEntity(partitionKey, feedId);
  }

  /**
   * Generate a unique feed ID from a URL or custom input
   */
  static generateFeedId(input: string, fallbackIndex?: number): string {
    try {
      return deriveFeedIdFromUrl(input, fallbackIndex);
    } catch {
      // If not a valid URL, just slugify the input
      return truncateFeedId(slugifyId(input));
    }
  }
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function normalizeFeedUpdates(
  existing: SourceFeedEntity,
  updates: Partial<Omit<SourceFeedEntity, "partitionKey" | "rowKey" | "createdAt" | "updatedAt">>,
): Partial<Omit<SourceFeedEntity, "partitionKey" | "rowKey" | "createdAt" | "updatedAt">> {
  if (updates.enabled === false && existing.enabled !== false && updates.disabledAt === undefined) {
    const now = new Date();
    return {
      ...updates,
      disabledAt: now.toISOString(),
      restoreAvailableUntil: getRestoreAvailableUntil(now),
    };
  }

  if (updates.enabled === true) {
    return {
      ...updates,
      disabledAt: undefined,
      restoreAvailableUntil: undefined,
    };
  }

  return updates;
}

function toSourceFeedConfig(entity: SourceFeedEntity): SourceFeedConfig {
  const enabled = entity.enabled ?? true;
  const feed: SourceFeedConfig = {
    id: entity.id,
    name: entity.name,
    url: entity.url,
    enabled,
  };

  if (enabled === false) {
    feed.disabledAt = entity.disabledAt;
    feed.restoreAvailableUntil = entity.restoreAvailableUntil ?? getRestoreAvailableUntil(entity.disabledAt);
  }

  return feed;
}

function isDisabledFeedVisible(entity: SourceFeedEntity, now: Date): boolean {
  const restoreUntil = entity.restoreAvailableUntil ?? getRestoreAvailableUntil(entity.disabledAt);
  if (!restoreUntil) {
    return true;
  }

  const restoreUntilTime = new Date(restoreUntil).getTime();
  return Number.isNaN(restoreUntilTime) || restoreUntilTime >= now.getTime();
}

function getRestoreAvailableUntil(value: string | Date | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const disabledAt = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(disabledAt.getTime())) {
    return undefined;
  }

  return new Date(disabledAt.getTime() + FEED_RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
