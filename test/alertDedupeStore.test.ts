import { describe, expect, it, vi } from "vitest";

import { AlertDedupeStore } from "../src/lib/alertDedupeStore";

function storeWithTable(tableClient: unknown): AlertDedupeStore {
  const store = new AlertDedupeStore("teststorage");
  (store as unknown as { tableClient: unknown }).tableClient = tableClient;
  return store;
}

describe("AlertDedupeStore", () => {
  it("returns keys without existing rows as due", async () => {
    const tableClient = {
      createTable: vi.fn().mockResolvedValue(undefined),
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    };
    const store = storeWithTable(tableClient);

    await expect(store.filterDueKeys(["a", "b"], 60, new Date("2026-05-08T01:00:00.000Z")))
      .resolves.toEqual(["a", "b"]);
  });

  it("suppresses keys inside the cooldown and allows expired rows", async () => {
    const tableClient = {
      createTable: vi.fn().mockResolvedValue(undefined),
      getEntity: vi.fn()
        .mockResolvedValueOnce({
          partitionKey: "operational-alerts",
          rowKey: "recent",
          lastSentAt: "2026-05-08T00:30:00.000Z",
          updatedAt: "2026-05-08T00:30:00.000Z",
        })
        .mockResolvedValueOnce({
          partitionKey: "operational-alerts",
          rowKey: "expired",
          lastSentAt: "2026-05-07T23:00:00.000Z",
          updatedAt: "2026-05-07T23:00:00.000Z",
        }),
    };
    const store = storeWithTable(tableClient);

    await expect(store.filterDueKeys(["recent", "expired"], 60, new Date("2026-05-08T01:00:00.000Z")))
      .resolves.toEqual(["expired"]);
  });

  it("records sent alert keys", async () => {
    const tableClient = {
      createTable: vi.fn().mockResolvedValue(undefined),
      upsertEntity: vi.fn().mockResolvedValue(undefined),
    };
    const store = storeWithTable(tableClient);

    await store.recordSent(["alert-1"], new Date("2026-05-08T01:00:00.000Z"));

    expect(tableClient.upsertEntity).toHaveBeenCalledWith(
      {
        partitionKey: "operational-alerts",
        rowKey: "alert-1",
        lastSentAt: "2026-05-08T01:00:00.000Z",
        updatedAt: "2026-05-08T01:00:00.000Z",
      },
      "Merge",
    );
  });
});
