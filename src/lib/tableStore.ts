import { TableClient } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

import { SourceFeedConfig } from "./types";
import { looksLikeConnectionString, slugifyId } from "./util";

export interface SourceFeedEntity {
  partitionKey: string; // "default" now, userId later
  rowKey: string; // feed.id
  id: string; // same as rowKey
  name: string;
  url: string;
  enabled: boolean; // for soft deletes
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

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

  async listFeeds(partitionKey: string = "default"): Promise<SourceFeedConfig[]> {
    const filter = `PartitionKey eq '${partitionKey}' and enabled eq true`;
    const entities: SourceFeedConfig[] = [];

    for await (const entity of this.tableClient.listEntities<SourceFeedEntity>({
      queryOptions: { filter },
    })) {
      entities.push({
        id: entity.id,
        name: entity.name,
        url: entity.url,
      });
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

    // Merge updates
    const updated: SourceFeedEntity = {
      ...existing,
      ...updates,
      partitionKey, // Ensure partition key doesn't change
      rowKey: feedId, // Ensure row key doesn't change
      updatedAt: new Date().toISOString(),
    };

    await this.tableClient.updateEntity(updated, "Merge");
    return updated;
  }

  async softDeleteFeed(feedId: string, partitionKey: string = "default"): Promise<void> {
    await this.updateFeed(feedId, { enabled: false }, partitionKey);
  }

  async hardDeleteFeed(feedId: string, partitionKey: string = "default"): Promise<void> {
    await this.tableClient.deleteEntity(partitionKey, feedId);
  }

  /**
   * Generate a unique feed ID from a URL or custom input
   */
  static generateFeedId(input: string, fallbackIndex?: number): string {
    try {
      const url = new URL(input);
      const pathTail = url.pathname.split("/").filter(Boolean).pop();
      return slugifyId(`${url.hostname}-${pathTail ?? fallbackIndex ?? 1}`);
    } catch {
      // If not a valid URL, just slugify the input
      return slugifyId(input);
    }
  }
}
