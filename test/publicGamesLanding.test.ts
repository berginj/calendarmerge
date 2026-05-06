import { readFileSync } from "node:fs";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

describe("public games subscribe page", () => {
  it("offers only the games ICS subscription action", () => {
    const html = readFileSync("public/games.html", "utf8");
    const anchorCount = (html.match(/<a\b/g) ?? []).length;

    expect(anchorCount).toBe(1);
    expect(html).toContain('href="/calendar-games.ics"');
    expect(html).toContain('data-ics-path="/calendar-games.ics"');
    expect(html).toContain("webcal://${url.host}${url.pathname}${url.search}${url.hash}");
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
    expect(workflow).toContain("--name \"games\"");
    expect(workflow).toContain("--name \"games/index.html\"");
    expect(workflow).toContain('--file "./public/games.html"');
    expect(deployScript).toContain("--name games.html");
    expect(deployScript).toContain("--name games");
    expect(deployScript).toContain("--name games/index.html");
    expect(deployScript).toContain('"public/games.html"');
    expect(bootstrapScript).toContain("--name games.html");
    expect(bootstrapScript).toContain("--name games");
    expect(bootstrapScript).toContain("--name games/index.html");
    expect(bootstrapScript).toContain('"public/games.html"');
  });

  it.each([
    "https://calendarmergeprod01.z13.web.core.windows.net/games.html",
    "https://calendarmergeprod01.z13.web.core.windows.net/games",
    "https://calendarmergeprod01.z13.web.core.windows.net/games/",
  ])("rewrites the lone subscription action to a root webcal URL from %s", (pageUrl) => {
    const html = readFileSync("public/games.html", "utf8");
    const script = extractInlineScript(html);
    const link = {
      dataset: { icsPath: "/calendar-games.ics" },
      href: "",
    };
    const context = vm.createContext({
      URL,
      window: {
        location: {
          href: pageUrl,
        },
      },
      document: {
        getElementById(id: string) {
          return id === "subscribe-link" ? link : null;
        },
      },
    });

    vm.runInContext(script, context);

    expect(link.href).toBe("webcal://calendarmergeprod01.z13.web.core.windows.net/calendar-games.ics");
  });
});

function extractInlineScript(html: string): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const subscriptionScript = scripts.find((script) => script.includes("buildSubscribeUrl"));

  expect(subscriptionScript).toBeTruthy();

  return subscriptionScript!;
}
