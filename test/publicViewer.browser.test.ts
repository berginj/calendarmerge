import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const browserPath = findBrowser();
// Windows Chrome hangs under Vitest with --dump-dom in this workspace; CI Linux runs this when Chrome is present.
const canRunBrowserSmoke = Boolean(browserPath) && process.platform !== "win32";

describe.skipIf(!canRunBrowserSmoke)("public Schedule-X viewer browser smoke", () => {
  it("does not configure non-exported Schedule-X views", () => {
    const html = readFileSync("public/index.html", "utf8");

    expect(html).toContain("sx.viewMonthGrid");
    expect(html).toContain("sx.viewWeek");
    expect(html).toContain("sx.viewDay");
    expect(html).toContain("sx.viewMonthAgenda");
    expect(html).not.toContain("sx.viewList");
  });

  it("renders initial events and switches between games and full views", async () => {
    const tempDir = mkdtempSync(join(process.cwd(), ".calendarmerge-viewer-"));
    const profileDir = join(tempDir, "profile");
    const htmlPath = join(tempDir, "index.html");
    writeFileSync(htmlPath, injectSmokeScript(injectTestRuntime(readFileSync("public/index.html", "utf8"))), "utf8");

    try {
      const result = spawnSync(
        browserPath!,
        [
          "--headless",
          "--disable-gpu",
          "--no-sandbox",
          "--disable-background-networking",
          "--disable-crash-reporter",
          "--disable-breakpad",
          "--disable-component-update",
          "--disable-extensions",
          "--disable-sync",
          `--user-data-dir=${profileDir}`,
          "--virtual-time-budget=12000",
          "--dump-dom",
          pathToFileURL(htmlPath).toString(),
        ],
        { encoding: "utf8", timeout: 30_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);

      const results = parseSmokeResults(result.stdout);
      expect(results).toHaveLength(3);
      expect(results[0]).toMatchObject({
        label: "initial",
        fullPressed: true,
        gamesPressed: false,
        hasFullEvent: true,
      });
      expect(results[1]).toMatchObject({
        label: "games",
        fullPressed: false,
        gamesPressed: true,
        hasGameEvent: true,
      });
      expect(results[2]).toMatchObject({
        label: "full",
        fullPressed: true,
        gamesPressed: false,
        hasFullEvent: true,
      });
      expect(results.every((result) => result.eventCount > 0)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 45_000);
});

const fixtureOutput = {
  calendarBlobPath: "calendar.ics",
  gamesCalendarBlobPath: "calendar-games.ics",
  scheduleXFullBlobPath: "schedule-x-full.json",
  scheduleXGamesBlobPath: "schedule-x-games.json",
};

const fullEvents = [
  {
    id: "full-event",
    title: "Full Calendar Future Event",
    start: "2030-01-02 12:00",
    end: "2030-01-02 13:00",
    calendarId: "primary",
    sourceId: "primary",
    sourceName: "Primary",
  },
];

const gameEvents = [
  {
    id: "game-event",
    title: "Games Calendar Future Event",
    start: "2030-02-03 18:00",
    end: "2030-02-03 19:30",
    calendarId: "games",
    sourceId: "games",
    sourceName: "Games",
  },
];

function injectSmokeScript(html: string): string {
  return html.replace(
    "</body>",
    `<script>
      (function () {
        const snapshots = [];

        function snapshot(label) {
          snapshots.push({
            label,
            fullPressed: document.getElementById("mode-full")?.getAttribute("aria-pressed") === "true",
            gamesPressed: document.getElementById("mode-games")?.getAttribute("aria-pressed") === "true",
            eventCount: document.querySelectorAll(".sx__event").length,
            hasFullEvent: document.body.textContent.includes("Full Calendar Future Event"),
            hasGameEvent: document.body.textContent.includes("Games Calendar Future Event")
          });
        }

        window.addEventListener("load", () => {
          setTimeout(() => {
            snapshot("initial");
            document.getElementById("mode-games")?.click();
            setTimeout(() => {
              snapshot("games");
              document.getElementById("mode-full")?.click();
              setTimeout(() => {
                snapshot("full");
                const resultNode = document.createElement("pre");
                resultNode.id = "smoke-results";
                resultNode.textContent = JSON.stringify(snapshots);
                document.body.appendChild(resultNode);
                setTimeout(() => window.close(), 0);
              }, 1500);
            }, 1500);
          }, 2500);
        });
      })();
    </script></body>`,
  );
}

function injectTestRuntime(html: string): string {
  const withoutExternalAssets = html
    .replace(/<link\s+rel="preconnect"\s+href="https:\/\/cdn\.jsdelivr\.net"\s*\/>\s*/g, "")
    .replace(/<link\s+rel="stylesheet"[\s\S]*?@schedule-x\/theme-default[\s\S]*?\/>\s*/g, "")
    .replace(/<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/[^"]+"><\/script>\s*/g, "");

  return withoutExternalAssets.replace(
    "<script>\n      const fallbackOutput",
    `<script>${fetchStub}${scheduleXStub}</script>\n    <script>\n      const fallbackOutput`,
  );
}

const fetchStub = `
  const fixtureResponses = {
    "./status.json": { output: ${JSON.stringify(fixtureOutput)} },
    "./schedule-x-full.json": { generatedAt: "2026-05-06T12:00:00.000Z", events: ${JSON.stringify(fullEvents)} },
    "./schedule-x-games.json": { generatedAt: "2026-05-06T12:00:00.000Z", events: ${JSON.stringify(gameEvents)} }
  };

  window.fetch = async function (url) {
    const key = String(url);
    if (!Object.prototype.hasOwnProperty.call(fixtureResponses, key)) {
      return { ok: false, status: 404, json: async () => ({}) };
    }

    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(JSON.stringify(fixtureResponses[key]))
    };
  };
`;

const scheduleXStub = `
  window.SXCalendar = {
    viewMonthGrid: { name: "month-grid" },
    viewWeek: { name: "week" },
    viewDay: { name: "day" },
    viewMonthAgenda: { name: "month-agenda" },
    createCalendar(config) {
      const app = {
        _root: null,
        _events: config.events || [],
        _view: config.defaultView,
        events: {
          set(events) {
            app._events = events || [];
            render();
          }
        },
        $app: {
          datePickerState: {
            selectedDate: { value: config.selectedDate }
          },
          calendarState: {
            setView(viewName, selectedDate) {
              app._view = viewName;
              app.$app.datePickerState.selectedDate.value = selectedDate;
              render();
            }
          }
        },
        render(root) {
          app._root = root;
          render();
        }
      };

      function render() {
        if (!app._root) return;
        app._root.innerHTML = '<div class="sx__calendar"><div class="sx__view-container"><div class="sx__week-grid">' +
          app._events.map((event) => '<button class="sx__event" type="button">' + escapeHtml(event.title) + '</button>').join("") +
          '</div></div></div>';
      }

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      return app;
    }
  };
`;

function parseSmokeResults(dom: string): Array<Record<string, any>> {
  const match = dom.match(/<pre id="smoke-results">([^<]+)<\/pre>/);
  expect(match?.[1]).toBeTruthy();

  return JSON.parse(decodeHtml(match![1]));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function findBrowser(): string | undefined {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate));
}
