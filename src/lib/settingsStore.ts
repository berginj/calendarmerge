import { TableClient } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

export interface AppSettings {
  refreshSchedule: "every-15-min" | "hourly" | "every-2-hours" | "business-hours" | "manual-only";
  lastUpdated: string;
}

interface SettingsEntity {
  partitionKey: string;
  rowKey: string;
  refreshSchedule: string;
  lastUpdated: string;
}

const SETTINGS_PARTITION_KEY = "app-settings";
const SETTINGS_ROW_KEY = "default";

const DEFAULT_SETTINGS: AppSettings = {
  refreshSchedule: "every-15-min",
  lastUpdated: new Date().toISOString(),
};

export class SettingsStore {
  private readonly tableClient: TableClient;

  constructor(storageAccount: string, tableName: string = "AppSettings") {
    this.tableClient = new TableClient(
      `https://${storageAccount}.table.core.windows.net`,
      tableName,
      new DefaultAzureCredential(),
    );
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

  async getSettings(): Promise<AppSettings> {
    await this.ensureTable();

    try {
      const entity = await this.tableClient.getEntity<SettingsEntity>(
        SETTINGS_PARTITION_KEY,
        SETTINGS_ROW_KEY,
      );

      return {
        refreshSchedule: entity.refreshSchedule as AppSettings["refreshSchedule"],
        lastUpdated: entity.lastUpdated,
      };
    } catch (error: unknown) {
      if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) {
        // Settings don't exist yet, create with defaults
        await this.updateSettings(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }
      throw error;
    }
  }

  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    await this.ensureTable();

    const current = await this.getSettings().catch(() => DEFAULT_SETTINGS);
    const updated: AppSettings = {
      ...current,
      ...settings,
      lastUpdated: new Date().toISOString(),
    };

    const entity: SettingsEntity = {
      partitionKey: SETTINGS_PARTITION_KEY,
      rowKey: SETTINGS_ROW_KEY,
      refreshSchedule: updated.refreshSchedule,
      lastUpdated: updated.lastUpdated,
    };

    await this.tableClient.upsertEntity(entity, "Merge");
    return updated;
  }

  /**
   * Check if refresh should run based on current settings and last refresh time
   */
  async shouldRunRefresh(lastRefreshTime?: Date): Promise<boolean> {
    const settings = await this.getSettings();

    if (settings.refreshSchedule === "manual-only") {
      return false;
    }

    if (!lastRefreshTime) {
      // First run or no previous refresh
      return true;
    }

    const now = new Date();
    const minutesSinceLastRefresh = (now.getTime() - lastRefreshTime.getTime()) / (1000 * 60);

    switch (settings.refreshSchedule) {
      case "every-15-min":
        return minutesSinceLastRefresh >= 15;
      case "hourly":
        return minutesSinceLastRefresh >= 60;
      case "every-2-hours":
        return minutesSinceLastRefresh >= 120;
      case "business-hours":
        // Check if we're in business hours (8 AM - 6 PM EST, Mon-Fri)
        const hour = now.getUTCHours();
        const day = now.getUTCDay();

        // EST is UTC-5, EDT is UTC-4. Using EST (worst case)
        // 8 AM EST = 13:00 UTC, 6 PM EST = 23:00 UTC
        const isBusinessHours = hour >= 13 && hour < 23 && day >= 1 && day <= 5;

        if (!isBusinessHours) {
          return false;
        }

        // During business hours, refresh hourly
        return minutesSinceLastRefresh >= 60;
      default:
        return true;
    }
  }
}
