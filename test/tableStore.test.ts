import { describe, it, expect } from "vitest";
import { TableStore } from "../src/lib/tableStore";

describe("TableStore", () => {
  it("should generate feed ID from URL", () => {
    const feedId = TableStore.generateFeedId("https://example.com/calendar.ics");
    expect(feedId).toMatch(/^example-com-/);
  });

  it("should generate feed ID from hostname when no path", () => {
    const feedId = TableStore.generateFeedId("https://example.com");
    expect(feedId).toMatch(/^example-com/);
  });

  it("should normalize webcal URLs before generating an ID", () => {
    const webcalId = TableStore.generateFeedId("webcal://example.com/calendar.ics");
    const httpsId = TableStore.generateFeedId("https://example.com/calendar.ics");

    expect(webcalId).toBe(httpsId);
  });

  it("should generate distinct IDs for tokenized calendar URLs on the same path", () => {
    const first = TableStore.generateFeedId("webcal://example.com/ical_feed?token=alpha");
    const second = TableStore.generateFeedId("https://example.com/ical_feed?token=beta");

    expect(first).not.toBe(second);
    expect(first).toMatch(/^example-com-ical-feed-/);
    expect(second).toMatch(/^example-com-ical-feed-/);
  });

  it("should slugify non-URL input", () => {
    const feedId = TableStore.generateFeedId("My Calendar Feed!");
    expect(feedId).toBe("my-calendar-feed");
  });

  it("should handle special characters in slugify", () => {
    const feedId = TableStore.generateFeedId("Test@#$%Calendar");
    expect(feedId).toBe("test-calendar");
  });

  it("should keep generated feed IDs within the supported length", () => {
    const feedId = TableStore.generateFeedId(`https://example.com/${"calendar-".repeat(80)}.ics?token=secret`);

    expect(feedId.length).toBeLessThanOrEqual(255);
    expect(feedId).toMatch(/-[a-f0-9]{8}$/);
  });

  it("should keep generated non-URL feed IDs within the supported length", () => {
    const feedId = TableStore.generateFeedId("Calendar ".repeat(100));

    expect(feedId.length).toBeLessThanOrEqual(255);
  });

  it("should treat missing enabled values as enabled when listing feeds", async () => {
    async function* listEntities() {
      yield {
        partitionKey: "default",
        rowKey: "legacy-feed",
        id: "legacy-feed",
        name: "Legacy Feed",
        url: "https://example.com/calendar.ics",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      yield {
        partitionKey: "default",
        rowKey: "disabled-feed",
        id: "disabled-feed",
        name: "Disabled Feed",
        url: "https://example.com/disabled.ics",
        enabled: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
    }

    const store = new TableStore("teststorage");
    (store as unknown as { tableClient: { listEntities: () => AsyncGenerator<unknown> } }).tableClient = {
      listEntities,
    };

    const feeds = await store.listFeeds();

    expect(feeds).toEqual([
      {
        id: "legacy-feed",
        name: "Legacy Feed",
        url: "https://example.com/calendar.ics",
        enabled: true,
      },
    ]);
  });
});
