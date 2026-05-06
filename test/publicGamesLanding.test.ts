import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("public games subscribe page", () => {
  it("offers only the games ICS subscription action", () => {
    const html = readFileSync("public/games.html", "utf8");
    const anchorCount = (html.match(/<a\b/g) ?? []).length;

    expect(anchorCount).toBe(1);
    expect(html).toContain('href="./calendar-games.ics"');
    expect(html).toContain('data-ics-path="calendar-games.ics"');
    expect(html).toContain('icsUrl.protocol = "webcal:"');
    expect(html).not.toContain("calendar.ics");
    expect(html).not.toContain("schedule-x-full.json");
    expect(html).not.toContain("schedule-x-games.json");
    expect(html).not.toContain("status.json");
    expect(html).not.toContain("manage/");
    expect(html).not.toContain("index.html");
  });

  it("is deployed by the GitHub workflow and local deploy scripts", () => {
    const workflow = readFileSync(".github/workflows/calendarmerge-functions.yml", "utf8");
    const deployScript = readFileSync("scripts/azure/deploy-functions.ps1", "utf8");
    const bootstrapScript = readFileSync("scripts/azure/bootstrap.ps1", "utf8");

    expect(workflow).toContain("--name \"games.html\"");
    expect(workflow).toContain('--file "./public/games.html"');
    expect(deployScript).toContain("--name games.html");
    expect(deployScript).toContain('"public/games.html"');
    expect(bootstrapScript).toContain("--name games.html");
    expect(bootstrapScript).toContain('"public/games.html"');
  });
});
