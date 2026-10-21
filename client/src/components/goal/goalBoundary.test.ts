// Phase-2 boundary: nothing live imports components/goal yet (phase 3 adds
// each moved surface), and the token block sits exactly once, appended after
// the previous last rule of index.css (§6b).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const CLIENT_SRC = join(__dirname, "..", "..");
// Phase 3 adds each moved surface (and the components it composes): /queue on
// 2026-10-21, surface parts in components/queue and the page itself.
const ALLOWLIST = /components[\\/]goal[\\/]|components[\\/]queue[\\/]|pages[\\/]ComponentShowcase\.tsx$|pages[\\/]MyCompanyInbox\.tsx$|\.test\.tsx?$/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { if (entry !== "node_modules") yield* walk(path); }
    else if (/\.(ts|tsx)$/.test(entry)) yield path;
  }
}

describe("goal boundary", () => {
  it("no live file imports components/goal", () => {
    const offenders: string[] = [];
    for (const file of walk(CLIENT_SRC)) {
      const rel = relative(CLIENT_SRC, file);
      if (ALLOWLIST.test(rel)) continue;
      if (/components\/goal|@\/components\/goal/.test(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("index.css carries the phase-2 marker once, after the previous last rule", () => {
    const css = readFileSync(join(CLIENT_SRC, "index.css"), "utf8");
    const marker = "D-048 phase 2 · goal-UI tokens";
    expect(css.split(marker).length - 1).toBe(1);
    const lastRule = ".app-footer a{max-width:none;white-space:nowrap;}";
    expect(css.indexOf(lastRule)).toBeGreaterThan(-1);
    expect(css.indexOf(marker)).toBeGreaterThan(css.indexOf(lastRule));
  });
});
