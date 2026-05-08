import { describe, expect, it, vi } from "vitest";

import { ManualRefreshRateLimitStore, type RateLimitScope } from "../src/lib/manualRefreshRateLimit";

const scopes: RateLimitScope[] = [
  { partitionKey: "manual-refresh", rowKey: "global" },
  { partitionKey: "manual-refresh", rowKey: "function-key-abc123" },
];

function storeWithTable(tableClient: unknown): ManualRefreshRateLimitStore {
  const store = new ManualRefreshRateLimitStore("teststorage");
  (store as unknown as { tableClient: unknown }).tableClient = tableClient;
  return store;
}

describe("ManualRefreshRateLimitStore", () => {
  it("allows refresh when no durable cooldown row exists", async () => {
    const tableClient = {
      createTable: vi.fn().mockResolvedValue(undefined),
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    };
    const store = storeWithTable(tableClient);

    await expect(store.check(scopes, 30_000, new Date("2026-05-07T12:00:00.000Z")))
      .resolves.toEqual({ allowed: true });
  });

  it("returns the longest retry-after when any scope is still cooling down", async () => {
    const tableClient = {
      createTable: vi.fn().mockResolvedValue(undefined),
      getEntity: vi.fn()
        .mockResolvedValueOnce({
          partitionKey: "manual-refresh",
          rowKey: "global",
          lastSuccessfulRefreshAt: "2026-05-07T11:59:45.000Z",
          updatedAt: "2026-05-07T11:59:45.000Z",
        })
        .mockResolvedValueOnce({
          partitionKey: "manual-refresh",
          rowKey: "function-key-abc123",
          lastSuccessfulRefreshAt: "2026-05-07T11:59:50.000Z",
          updatedAt: "2026-05-07T11:59:50.000Z",
        }),
    };
    const store = storeWithTable(tableClient);

    await expect(store.check(scopes, 30_000, new Date("2026-05-07T12:00:00.000Z")))
      .resolves.toEqual({ allowed: false, retryAfterSeconds: 20 });
  });

  it("allows refresh after the cooldown expires", async () => {
    const tableClient = {
      createTable: vi.fn().mockResolvedValue(undefined),
      getEntity: vi.fn().mockResolvedValue({
        partitionKey: "manual-refresh",
        rowKey: "global",
        lastSuccessfulRefreshAt: "2026-05-07T11:59:29.000Z",
        updatedAt: "2026-05-07T11:59:29.000Z",
      }),
    };
    const store = storeWithTable(tableClient);

    await expect(store.check([scopes[0]], 30_000, new Date("2026-05-07T12:00:00.000Z")))
      .resolves.toEqual({ allowed: true });
  });

  it("records successful refreshes for every active scope", async () => {
    const tableClient = {
      createTable: vi.fn().mockResolvedValue(undefined),
      upsertEntity: vi.fn().mockResolvedValue(undefined),
    };
    const store = storeWithTable(tableClient);

    await store.recordSuccess(scopes, new Date("2026-05-07T12:00:00.000Z"));

    expect(tableClient.upsertEntity).toHaveBeenCalledTimes(2);
    expect(tableClient.upsertEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionKey: "manual-refresh",
        rowKey: "global",
        lastSuccessfulRefreshAt: "2026-05-07T12:00:00.000Z",
      }),
      "Merge",
    );
    expect(tableClient.upsertEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionKey: "manual-refresh",
        rowKey: "function-key-abc123",
        lastSuccessfulRefreshAt: "2026-05-07T12:00:00.000Z",
      }),
      "Merge",
    );
  });
});
