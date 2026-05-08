import { TableClient } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

import { looksLikeConnectionString } from "./util";

export interface ManualRefreshRateLimitEntity {
  partitionKey: string;
  rowKey: string;
  lastSuccessfulRefreshAt: string;
  updatedAt: string;
}

export interface RateLimitScope {
  partitionKey: string;
  rowKey: string;
}

export interface RateLimitCheck {
  allowed: boolean;
  retryAfterSeconds?: number;
}

const DEFAULT_TABLE_NAME = "ManualRefreshRateLimits";

export class ManualRefreshRateLimitStore {
  private readonly tableClient: TableClient;

  constructor(connectionStringOrAccount: string, tableName: string = DEFAULT_TABLE_NAME) {
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
      if (error && typeof error === "object" && "statusCode" in error && error.statusCode !== 409) {
        throw error;
      }
    }
  }

  async check(scopes: RateLimitScope[], cooldownMs: number, now = new Date()): Promise<RateLimitCheck> {
    await this.ensureTable();

    let retryAfterSeconds = 0;
    for (const scope of scopes) {
      const entity = await this.getEntity(scope);
      if (!entity) {
        continue;
      }

      const lastSuccessfulRefreshTime = Date.parse(entity.lastSuccessfulRefreshAt);
      if (!Number.isFinite(lastSuccessfulRefreshTime)) {
        continue;
      }

      const elapsedMs = now.getTime() - lastSuccessfulRefreshTime;
      if (elapsedMs < cooldownMs) {
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          Math.ceil((cooldownMs - elapsedMs) / 1000),
        );
      }
    }

    if (retryAfterSeconds > 0) {
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true };
  }

  async recordSuccess(scopes: RateLimitScope[], now = new Date()): Promise<void> {
    await this.ensureTable();

    const timestamp = now.toISOString();
    await Promise.all(scopes.map((scope) => {
      const entity: ManualRefreshRateLimitEntity = {
        ...scope,
        lastSuccessfulRefreshAt: timestamp,
        updatedAt: timestamp,
      };

      return this.tableClient.upsertEntity(entity, "Merge");
    }));
  }

  private async getEntity(scope: RateLimitScope): Promise<ManualRefreshRateLimitEntity | null> {
    try {
      const entity = await this.tableClient.getEntity<ManualRefreshRateLimitEntity>(
        scope.partitionKey,
        scope.rowKey,
      );

      return entity as ManualRefreshRateLimitEntity;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) {
        return null;
      }

      throw error;
    }
  }
}
