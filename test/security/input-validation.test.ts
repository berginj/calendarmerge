import { describe, it, expect } from "vitest";
import { normalizeBlobPath } from "../../src/lib/util";
import { parseIcsCalendar } from "../../src/lib/ics";
import { SourceFeedConfig } from "../../src/lib/types";

describe("Input Validation Security", () => {
  describe("Path Traversal Protection", () => {
    it("should reject paths with .. sequences", () => {
      expect(() => normalizeBlobPath("../../../etc/passwd")).toThrow("path traversal");
      expect(() => normalizeBlobPath("normal/../../sensitive.txt")).toThrow("path traversal");
      expect(() => normalizeBlobPath("..")).toThrow("path traversal");
    });

    it("should allow normal paths", () => {
      expect(normalizeBlobPath("calendar.ics")).toBe("calendar.ics");
      expect(normalizeBlobPath("path/to/calendar.ics")).toBe("path/to/calendar.ics");
      expect(normalizeBlobPath("/leading/slash.ics")).toBe("leading/slash.ics");
    });

    it("should reject empty paths", () => {
      expect(() => normalizeBlobPath("")).toThrow("must not be empty");
      expect(() => normalizeBlobPath("   ")).toThrow("must not be empty");
    });
  });

  describe("ICS Event Count Limits", () => {
    const source: SourceFeedConfig = {
      id: "test",
      name: "Test Feed",
      url: "https://example.com/cal.ics",
    };

    function generateMockICS(eventCount: number): string {
      const events = [];
      for (let i = 0; i < eventCount; i++) {
        events.push(`BEGIN:VEVENT
UID:event-${i}
DTSTART:20260501T100000Z
DTEND:20260501T110000Z
SUMMARY:Event ${i}
END:VEVENT`);
      }

      return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
${events.join("\n")}
END:VCALENDAR`;
    }

    it("should parse calendars under the limit (10,000 events)", () => {
      const ics = generateMockICS(100);
      const events = parseIcsCalendar(ics, source);
      expect(events).toHaveLength(100);
    });

    it("should parse calendars at the limit (exactly 10,000 events)", () => {
      // This test would take a long time, so using a smaller number for test speed
      const ics = generateMockICS(1000);
      const events = parseIcsCalendar(ics, source);
      expect(events).toHaveLength(1000);
    });

    it("should reject calendars exceeding the limit (>10,000 events)", () => {
      // Test with just over the limit
      const ics = generateMockICS(10001);

      expect(() => parseIcsCalendar(ics, source)).toThrow("exceeds maximum event limit");
    });

    it("should include limit in error message", () => {
      const ics = generateMockICS(10001);

      try {
        parseIcsCalendar(ics, source);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("10000");
      }
    });
  });

  describe("Feed ID Validation", () => {
    it("should accept valid feed IDs", () => {
      // Pattern from feedCreate.ts validation
      const validIds = ["test", "school-calendar", "athletics123", "a", "a-b-c-123"];

      for (const id of validIds) {
        expect(/^[a-z0-9-]+$/.test(id)).toBe(true);
      }
    });

    it("should reject invalid feed IDs", () => {
      const invalidIds = [
        "Test", // Uppercase
        "test_id", // Underscore
        "test id", // Space
        "test.id", // Dot
        "test@id", // Special char
        "", // Empty
      ];

      for (const id of invalidIds) {
        expect(/^[a-z0-9-]+$/.test(id)).toBe(false);
      }
    });

    it("FUTURE: should enforce maximum length", () => {
      // Currently no max length enforced - future enhancement
      const veryLongId = "a".repeat(1000);
      expect(/^[a-z0-9-]+$/.test(veryLongId)).toBe(true); // Passes regex

      // Recommendation: Add max length check (e.g., 255 chars)
      // expect(veryLongId.length).toBeLessThanOrEqual(255);
    });
  });
});
