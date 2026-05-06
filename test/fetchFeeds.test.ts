import { describe, expect, it, vi } from "vitest";

import { fetchFeedText } from "../src/lib/fetchFeeds";
import { FeedDnsLookup } from "../src/lib/util";

const publicLookup: FeedDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("fetchFeedText", () => {
  it("rejects redirect chains that land on private addresses", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://192.168.1.10/calendar.ics" },
    }));

    await expect(
      fetchFeedText("https://calendar.example.com/cal.ics", 1000, {
        lookupAddress: publicLookup,
        fetchImpl,
      }),
    ).rejects.toThrow("private or local");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("enforces the response byte limit while streaming chunked bodies", async () => {
    const fetchImpl = vi.fn(async () => new Response("x".repeat(32), {
      status: 200,
      headers: { "content-type": "text/calendar" },
    }));

    await expect(
      fetchFeedText("https://calendar.example.com/cal.ics", 1000, {
        lookupAddress: publicLookup,
        fetchImpl,
        maxBytes: 16,
      }),
    ).rejects.toThrow("size limit");
  });
});
