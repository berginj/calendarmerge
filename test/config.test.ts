import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/lib/config";

describe("Config", () => {
  it("should load config with required fields", () => {
    const env = {
      SOURCE_FEEDS_JSON: '[{"id":"test","name":"Test","url":"https://example.com/cal.ics"}]',
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
    };

    const config = loadConfig(env);

    expect(config.serviceName).toBe("calendarmerge");
    expect(config.sourceFeeds).toHaveLength(1);
    expect(config.sourceFeeds[0].id).toBe("test");
    expect(config.outputStorageAccount).toBe("teststorage");
  });

  it("should use default values for optional fields", () => {
    const env = {
      SOURCE_FEEDS_JSON: '[{"id":"test","name":"Test","url":"https://example.com/cal.ics"}]',
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
    };

    const config = loadConfig(env);

    expect(config.outputContainer).toBe("$web");
    expect(config.outputBlobPath).toBe("calendar.ics");
    expect(config.gamesOutputBlobPath).toBe("calendar-games.ics");
    expect(config.scheduleXFullBlobPath).toBe("schedule-x-full.json");
    expect(config.scheduleXGamesBlobPath).toBe("schedule-x-games.json");
    expect(config.statusBlobPath).toBe("status.json");
    expect(config.refreshSchedule).toBe("0 */15 * * * *");
    expect(config.fetchTimeoutMs).toBe(10000);
    expect(config.fetchRetryCount).toBe(2);
    expect(config.fetchRetryDelayMs).toBe(750);
  });

  it("should throw error if SOURCE_FEEDS_JSON is missing", () => {
    const env = {
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
    };

    expect(() => loadConfig(env)).toThrow("SOURCE_FEEDS_JSON must be set");
  });

  it("should throw error if OUTPUT_STORAGE_ACCOUNT is missing", () => {
    const env = {
      SOURCE_FEEDS_JSON: '[{"id":"test","name":"Test","url":"https://example.com/cal.ics"}]',
    };

    expect(() => loadConfig(env)).toThrow("OUTPUT_STORAGE_ACCOUNT must be set");
  });

  it("should validate storage account name format", () => {
    const env = {
      SOURCE_FEEDS_JSON: '[{"id":"test","name":"Test","url":"https://example.com/cal.ics"}]',
      OUTPUT_STORAGE_ACCOUNT: "INVALID-NAME",
    };

    expect(() => loadConfig(env)).toThrow("valid Azure storage account name");
  });

  it("should parse feed URLs from string format", () => {
    const env = {
      SOURCE_FEEDS_JSON: '["https://example.com/cal1.ics", "https://example.com/cal2.ics"]',
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
    };

    const config = loadConfig(env);

    expect(config.sourceFeeds).toHaveLength(2);
    expect(config.sourceFeeds[0].url).toBe("https://example.com/cal1.ics");
    expect(config.sourceFeeds[1].url).toBe("https://example.com/cal2.ics");
  });

  it("should auto-generate feed IDs from URLs", () => {
    const env = {
      SOURCE_FEEDS_JSON: '["https://school.example.com/calendar.ics"]',
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
    };

    const config = loadConfig(env);

    expect(config.sourceFeeds[0].id).toMatch(/school-example-com/);
  });

  it("should filter out disabled feeds", () => {
    const env = {
      SOURCE_FEEDS_JSON:
        '[{"id":"a","name":"A","url":"https://a.com/cal.ics","enabled":true},{"id":"b","name":"B","url":"https://b.com/cal.ics","enabled":false}]',
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
    };

    const config = loadConfig(env);

    expect(config.sourceFeeds).toHaveLength(1);
    expect(config.sourceFeeds[0].id).toBe("a");
  });

  it("should reject duplicate feed IDs", () => {
    const env = {
      SOURCE_FEEDS_JSON:
        '[{"id":"test","name":"A","url":"https://a.com/cal.ics"},{"id":"test","name":"B","url":"https://b.com/cal.ics"}]',
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
    };

    expect(() => loadConfig(env)).toThrow("duplicate feed id");
  });

  it("should allow table-storage mode without SOURCE_FEEDS_JSON", () => {
    const env = {
      ENABLE_TABLE_STORAGE: "true",
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
    };

    const config = loadConfig(env);

    expect(config.sourceFeeds).toEqual([]);
  });

  it("should parse OUTPUT_BASE_URL when provided", () => {
    const env = {
      ENABLE_TABLE_STORAGE: "true",
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
      OUTPUT_BASE_URL: "https://teststorage.z13.web.core.windows.net/",
    };

    const config = loadConfig(env);

    expect(config.outputBaseUrl).toBe("https://teststorage.z13.web.core.windows.net");
  });

  it("should normalize webcal feed URLs from config", () => {
    const env = {
      SOURCE_FEEDS_JSON: '[{"id":"test","name":"Test","url":"webcal://example.com/cal.ics"}]',
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
    };

    const config = loadConfig(env);

    expect(config.sourceFeeds[0].url).toBe("https://example.com/cal.ics");
  });

  it("should keep tokenized provider URLs distinct when IDs are auto-generated", () => {
    const env = {
      SOURCE_FEEDS_JSON:
        '["webcal://example.com/ical_feed?token=alpha","https://example.com/ical_feed?token=beta&1=1"]',
      OUTPUT_STORAGE_ACCOUNT: "teststorage",
    };

    const config = loadConfig(env);

    expect(config.sourceFeeds).toHaveLength(2);
    expect(config.sourceFeeds[0].url).toBe("https://example.com/ical_feed?token=alpha");
    expect(config.sourceFeeds[1].url).toBe("https://example.com/ical_feed?token=beta&1=1");
    expect(config.sourceFeeds[0].id).not.toBe(config.sourceFeeds[1].id);
  });
});
