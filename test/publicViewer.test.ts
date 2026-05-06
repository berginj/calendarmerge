import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("public Schedule-X viewer", () => {
  const html = readFileSync(resolve(process.cwd(), "public/index.html"), "utf8");

  it("only configures Schedule-X views exported by the loaded core bundle", () => {
    expect(html).toContain("sx.viewMonthGrid");
    expect(html).toContain("sx.viewWeek");
    expect(html).toContain("sx.viewDay");
    expect(html).toContain("sx.viewMonthAgenda");
    expect(html).not.toContain("sx.viewList");
  });

  it("sets an explicit default view for the mounted calendar", () => {
    expect(html).toContain("defaultView: sx.viewWeek?.name || views[0].name");
    expect(html).toContain(".filter(Boolean)");
  });
});
