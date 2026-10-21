// Phase-2/3 boundary: live files may not import components/goal until their
// surface migrates. Goal-native surfaces are allowlisted here as they land
// (Landing, D-120; sign-in), phase-3 waves add each moved surface to
// MOVED_SURFACES (W0 is the shell), and the token block sits exactly once,
// appended after the previous last rule of index.css (§6b).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const CLIENT_SRC = join(__dirname, "..", "..");
const ALLOWLIST = /components[\\/]goal[\\/]|pages[\\/]ComponentShowcase\.tsx$|pages[\\/]GoalLanding\.tsx$|pages[\\/]GoalSignIn\.tsx$|\.test\.tsx?$/;

// Phase-3 waves that have landed, one entry per moved surface.
const MOVED_SURFACES = new Set(["components/AppShell.tsx"]); // W0: the app shell

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { if (entry !== "node_modules") yield* walk(path); }
    else if (/\.(ts|tsx)$/.test(entry)) yield path;
  }
}

describe("goal boundary", () => {
  it("only moved surfaces import components/goal", () => {
    const offenders: string[] = [];
    for (const file of walk(CLIENT_SRC)) {
      const rel = relative(CLIENT_SRC, file);
      if (ALLOWLIST.test(rel) || MOVED_SURFACES.has(rel)) continue;
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
