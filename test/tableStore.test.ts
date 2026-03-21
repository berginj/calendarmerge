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
});
