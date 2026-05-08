import { TableClient } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

import { looksLikeConnectionString } from "./util";

interface AlertDedupeEntity {
  partitionKey: string;
  rowKey: string;
  lastSentAt: string;
  updatedAt: string;
}

const TABLE_NAME = "AlertDedupe";
const PARTITION_KEY = "operational-alerts";

export class AlertDedupeStore {
  private readonly tableClient: TableClient;

  constructor(connectionStringOrAccount: string, tableName: string = TABLE_NAME) {
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

  async filterDueKeys(keys: string[], cooldownMinutes: number, now = new Date()): Promise<string[]> {
    await this.ensureTable();

    const due: string[] = [];
    const cooldownMs = cooldownMinutes * 60 * 1000;
    for (const key of keys) {
      const entity = await this.getEntity(key);
      if (!entity) {
        due.push(key);
        continue;
      }

      const lastSent = Date.parse(entity.lastSentAt);
      if (!Number.isFinite(lastSent) || now.getTime() - lastSent >= cooldownMs) {
        due.push(key);
      }
    }

    return due;
  }

  async recordSent(keys: string[], now = new Date()): Promise<void> {
    await this.ensureTable();

    const timestamp = now.toISOString();
    await Promise.all(keys.map((key) => this.tableClient.upsertEntity({
      partitionKey: PARTITION_KEY,
      rowKey: key,
      lastSentAt: timestamp,
      updatedAt: timestamp,
    }, "Merge")));
  }

  private async getEntity(key: string): Promise<AlertDedupeEntity | null> {
    try {
      return await this.tableClient.getEntity<AlertDedupeEntity>(PARTITION_KEY, key) as AlertDedupeEntity;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) {
        return null;
      }

      throw error;
    }
  }
}
