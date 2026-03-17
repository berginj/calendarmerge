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

  it("should slugify non-URL input", () => {
    const feedId = TableStore.generateFeedId("My Calendar Feed!");
    expect(feedId).toBe("my-calendar-feed");
  });

  it("should handle special characters in slugify", () => {
    const feedId = TableStore.generateFeedId("Test@#$%Calendar");
    expect(feedId).toBe("test-calendar");
  });
});
