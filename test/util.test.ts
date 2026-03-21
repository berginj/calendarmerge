import { describe, expect, it } from "vitest";

import { buildOutputPaths, looksLikeConnectionString, normalizeFeedUrl } from "../src/lib/util";

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
      statusBlobPath: "status.json",
      refreshSchedule: "0 */15 * * * *",
      fetchTimeoutMs: 10_000,
      fetchRetryCount: 2,
      fetchRetryDelayMs: 750,
    });

    expect(output.blobBaseUrl).toBe("https://calendarmergeprod.z13.web.core.windows.net");
    expect(output.blobCalendarUrl).toBe("https://calendarmergeprod.z13.web.core.windows.net/calendar.ics");
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
});
