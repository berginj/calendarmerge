import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, SettingsStore } from "../src/lib/settingsStore";

describe("SettingsStore", () => {
  it("uses a four-hour default refresh cadence", () => {
    expect(DEFAULT_SETTINGS.refreshSchedule).toBe("every-4-hours");
  });

  it("waits four hours before running the default scheduled refresh", async () => {
    const store = new SettingsStore("teststorage");
    vi.spyOn(store, "getSettings").mockResolvedValue({
      ...DEFAULT_SETTINGS,
      refreshSchedule: "every-4-hours",
      lastUpdated: "2026-01-01T00:00:00.000Z",
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T04:00:00.000Z"));

    try {
      await expect(store.shouldRunRefresh(new Date("2026-01-01T00:01:00.000Z"))).resolves.toBe(false);
      await expect(store.shouldRunRefresh(new Date("2026-01-01T00:00:00.000Z"))).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
