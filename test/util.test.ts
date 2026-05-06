import { describe, expect, it } from "vitest";

import { buildOutputPaths, looksLikeConnectionString, normalizeFeedUrl, redactFeedUrl } from "../src/lib/util";

describe("util", () => {
  it("should recognize UseDevelopmentStorage as a connection string", () => {
    expect(looksLikeConnectionString("UseDevelopmentStorage=true")).toBe(true);
  });

  it("should not treat a storage account name as a connection string", () => {
    expect(looksLikeConnectionString("calendarmergeprod")).toBe(false);
  });

  it("should use OUTPUT_BASE_URL for published output paths", () => {
    const output = buildOutputPaths({
      serviceName: "calendarmerge",
      sourceFeeds: [],
      outputStorageAccount: "calendarmergeprod",
      outputBaseUrl: "https://calendarmergeprod.z13.web.core.windows.net",
      outputContainer: "$web",
      outputBlobPath: "calendar.ics",
      gamesOutputBlobPath: "calendar-games.ics",
      scheduleXFullBlobPath: "schedule-x-full.json",
      scheduleXGamesBlobPath: "schedule-x-games.json",
      statusBlobPath: "status.json",
      refreshSchedule: "0 */15 * * * *",
      fetchTimeoutMs: 10_000,
      fetchRetryCount: 2,
      fetchRetryDelayMs: 750,
    });

    expect(output.blobBaseUrl).toBe("https://calendarmergeprod.z13.web.core.windows.net");
    expect(output.blobCalendarUrl).toBe("https://calendarmergeprod.z13.web.core.windows.net/calendar.ics");
    expect(output.blobGamesCalendarUrl).toBe("https://calendarmergeprod.z13.web.core.windows.net/calendar-games.ics");
    expect(output.blobScheduleXFullUrl).toBe("https://calendarmergeprod.z13.web.core.windows.net/schedule-x-full.json");
    expect(output.blobScheduleXGamesUrl).toBe("https://calendarmergeprod.z13.web.core.windows.net/schedule-x-games.json");
    expect(output.blobStatusUrl).toBe("https://calendarmergeprod.z13.web.core.windows.net/status.json");
  });

  it("should normalize webcal feed URLs to https", () => {
    expect(normalizeFeedUrl("webcal://example.com/calendar.ics")).toBe("https://example.com/calendar.ics");
  });

  it("should reject unsupported feed URL protocols", () => {
    expect(() => normalizeFeedUrl("ftp://example.com/calendar.ics")).toThrow(
      "Feed URL must use http, https, or webcal",
    );
  });

  it("should redact feed URL paths and query strings", () => {
    expect(redactFeedUrl("https://example.com/ical_feed?token=secret&user=abc")).toBe(
      "https://example.com/[redacted]",
    );
  });

  it("should redact private Google calendar tokens embedded in URL paths", () => {
    const redacted = redactFeedUrl(
      "https://calendar.google.com/calendar/ical/person%40example.com/private-token/basic.ics",
    );

    expect(redacted).toBe("https://calendar.google.com/[redacted]");
    expect(redacted).not.toContain("person");
    expect(redacted).not.toContain("private-token");
  });
});
