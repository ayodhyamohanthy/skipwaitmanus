// D-048 phase 2: fixture tests for the design-token audit rules A1-A3, R1-R8
// (scripts/designTokenAuditCore.mjs), plus the goal-token source-of-truth
// check against the approved comp tokens (design/goal-ui/pick/tokens.css).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  APPROVED, G_THEME, G_VARS, GOAL_BLOCK_HEXES, GOAL_BLOCK_MARKER,
  auditFiles,
} from "./designTokenAuditCore.mjs";

const goal = (source: string, file = "client/src/components/goal/GoalButton.tsx") => ({ path: file, source });
const live = (source: string, file = "client/src/pages/Plans.tsx") => ({ path: file, source });
const run = (files: Array<{ path: string; source: string }>, opts: Record<string, unknown> = {}) =>
  auditFiles(files as never, opts as never).findings;
const rules = (files: Array<{ path: string; source: string }>, opts: Record<string, unknown> = {}) =>
  run(files, opts).map(f => (f as { rule: string }).rule);

describe("A1: the live migration-union hex check is unchanged", () => {
  it("passes an approved kit hex and a third-party brand hex", () => {
    expect(run([live('x "bg-[#0000ff]" y "text-[#25d366]"')])).toEqual([]);
  });
  it("rejects an off-brand arbitrary hex", () => {
    expect(rules([live('"bg-[#123456]"')])).toEqual(["palette"]);
  });
});

describe("A2: goal scope accepts g-* utilities, var(--g-*) and layout arbitrary values", () => {
  it("passes a representative goal primitive", () => {
    expect(run([goal('"text-g-display text-g-ink bg-g-surface w-(--g-rail-w) duration-(--g-dur-hover) grid-cols-[28px_auto_minmax(0,1fr)_auto] gdesk:flex max-gdesk:hidden"')])).toEqual([]);
  });
});

describe("A3: the index.css phase-2 block carries only the approved goal hexes", () => {
  const blockWith = (extra: string) => `/* ${GOAL_BLOCK_MARKER} */\n:root { --g-ink: #0a0a0a; ${extra} }`;
  it("passes with an approved hex", () => {
    expect(run([], { cssFiles: [{ path: "client/src/index.css", source: blockWith("--g-trust: #1d4ed8;") }] }).filter(r => r === "A3")).toEqual([]);
  });
  it("rejects a foreign hex in the block", () => {
    expect(rules([], { cssFiles: [{ path: "client/src/index.css", source: blockWith("/* #123456 */") }] })).toContain("A3");
  });
});

describe("R1: no colour literal in goal scope", () => {
  it("rejects a hex", () => { expect(rules([goal('"#fff"')])).toEqual(["R1"]); });
  it("covers pages/goal/** after D-048-F-flags", () => {
    expect(rules([goal('"#fff"', "client/src/pages/goal/inbox/GoalInbox.tsx")])).toEqual(["R1"]);
    expect(rules([goal('"text-g-display text-g-ink"', "client/src/pages/goal/inbox/GoalInbox.tsx")])).toEqual([]);
  });
  it("rejects an rgb() function", () => { expect(rules([goal('"rgb(0 0 0 / 0.1)"')])).toEqual(["R1"]); });
  it("rejects oklch", () => { expect(rules([goal('"oklch(0.5 0.1 250)"')])).toEqual(["R1"]); });
});

describe("R2: trust blue only in GoalVerifiedMark", () => {
  it("passes inside GoalVerifiedMark", () => {
    expect(run([goal('"text-g-trust"', "client/src/components/goal/GoalVerifiedMark.tsx")])).toEqual([]);
  });
  it("rejects g-trust in another goal file", () => { expect(rules([goal('"text-g-trust"')])).toEqual(["R2"]); });
  it("rejects --g-trust in a live file", () => { expect(rules([live('"var(--g-trust)"')])).toEqual(["R2"]); });
  it("ignores the Kinetic draft's bg-trust-surface look-alike", () => {
    expect(run([live('"bg-trust-surface text-trust-text"', "client/src/components/ui/primitives.tsx")])).toEqual([]);
  });
});

describe("R3: status hues stay inside the goal scope", () => {
  it("passes inside goal scope", () => { expect(run([goal('"text-g-emerald"')])).toEqual([]); });
  it("rejects g-amber in a live file", () => { expect(rules([live('"text-g-amber"')])).toEqual(["R3"]); });
  it("ignores Tailwind's own bg-emerald-600", () => { expect(run([live('"bg-emerald-600"')])).toEqual([]); });
});

describe("R4: no kit/shadcn tokens in goal scope", () => {
  it("rejects shadcn colour utilities", () => { expect(rules([goal('"bg-primary text-muted-foreground"')])).toEqual(["R4"]); });
  it("rejects the live radius scale and font-mono", () => { expect(rules([goal('"rounded-md font-mono"')])).toEqual(["R4"]); });
  it("rejects kit aliases and brand-button", () => { expect(rules([goal('"text-ink brand-button"')])).toEqual(["R4"]); });
  it("rejects shadcn animation classes and sm:/md: breakpoints", () => { expect(rules([goal('"animate-in fade-in sm:flex md:grid"')])).toEqual(["R4"]); });
  it("passes goal look-alikes (text-g-ink, border-g-hairline, gdesk:)", () => {
    expect(run([goal('"text-g-ink border-g-hairline gdesk:flex max-gdesk:hidden rounded-g-tile"')])).toEqual([]);
  });
});

describe("R5: banned effects in goal scope", () => {
  it("rejects gradients, blur and arbitrary shadows", () => { expect(rules([goal('"bg-linear-to-r backdrop-blur shadow-[0_1px_2px]"')])).toEqual(["R5"]); });
  it("rejects animate-pulse and opacity-faded disabled", () => { expect(rules([goal('"animate-pulse aria-disabled:opacity-50"')])).toEqual(["R5"]); });
});

describe("R6: comp sample data and the compensation row", () => {
  it("rejects a comp company name anywhere in client/src", () => {
    expect(rules([live('"Fernhill Bank"')], { sampleNames: ["Fernhill Bank"] })).toEqual(["R6"]);
  });
  it("rejects a comp ref even in an excluded file (no exclusions)", () => {
    expect(rules([], { sampleNames: ["R-8F3K2"], r6Files: [live('"R-8F3K2"', "client/src/pages/ComponentShowcase.tsx")] })).toEqual(["R6"]);
  });
  it("rejects the word compensation in goal scope", () => { expect(rules([goal('"compensation"')])).toEqual(["R6"]); });
  it("excuses only the exact shared draft-handoff storage key", () => {
    expect(rules([goal('localStorage.removeItem("bridge-target-compensation")')])).toEqual([]);
    expect(rules([goal('"bridge-target-compensation" + "Compensation details"')])).toEqual(["R6"]);
    expect(rules([goal('"target-compensation"')])).toEqual(["R6"]);
  });
  it("passes neutral placeholders", () => {
    expect(run([goal('"Company A"')], { sampleNames: ["Fernhill Bank"] })).toEqual([]);
  });
  it("excuses the legitimate post-opportunity field but still bans the queue copy there", () => {
    const postOpp = (source: string) => goal(source, "client/src/pages/goal/post-opportunity/GoalPostOpportunity.tsx");
    expect(rules([postOpp('"compensation" "Compensation (optional)"')])).toEqual([]);
    expect(rules([postOpp('"Compensation (Recommended)"')])).toEqual(["R6"]);
    expect(rules([postOpp('"expected compensation"')])).toEqual(["R6"]);
    expect(rules([postOpp('"Recommended compensation"')])).toEqual(["R6"]);
  });
});

describe("R7: no token drift in the phase-2 block", () => {
  const real = fs.readFileSync("client/src/index.css", "utf8");
  const css = (source: string) => ({ cssFiles: [{ path: "client/src/index.css", source }] });
  it("passes the real index.css", () => { expect(run([], css(real))).toEqual([]); });
  it("rejects a changed value", () => {
    expect(rules([], css(real.replace("--g-ink: #0a0a0a;", "--g-ink: #111111;")))).toContain("R7");
  });
  it("rejects a missing declaration", () => {
    expect(rules([], css(real.replace("--g-touch: 44px;", "")))).toContain("R7");
  });
  it("rejects an extra goal declaration", () => {
    expect(rules([], css(real.replace("--g-touch: 44px;", "--g-touch: 44px; --g-bogus: 1px;")))).toContain("R7");
  });
  it("rejects a duplicate or missing marker", () => {
    expect(rules([], css(real.replace(GOAL_BLOCK_MARKER, `${GOAL_BLOCK_MARKER} ${GOAL_BLOCK_MARKER}`)))).toContain("R7");
  });
});

describe("R8: only index.css and kit.css may exist, and --g- only in index.css", () => {
  it("passes the allowed pair", () => {
    const real = fs.readFileSync("client/src/index.css", "utf8");
    expect(run([], { cssFiles: [{ path: "client/src/index.css", source: real }, { path: "client/src/styles/kit.css", source: fs.readFileSync("client/src/styles/kit.css", "utf8") }] })).toEqual([]);
  });
  it("rejects a third CSS file", () => {
    expect(rules([], { cssFiles: [{ path: "client/src/styles/globals.css", source: "" }] })).toContain("R8");
  });
  it("rejects a --g- declaration in kit.css", () => {
    expect(rules([], { cssFiles: [{ path: "client/src/styles/kit.css", source: ":root{--g-ink:#0a0a0a;}" }] })).toContain("R8");
  });
});

describe("goal tokens match the approved comp tokens", () => {
  const compSource = fs.readFileSync("design/goal-ui/pick/tokens.css", "utf8");
  const comp = new Map<string, string>();
  for (const match of compSource.matchAll(/(--sw-[a-z0-9-]+)\s*:\s*([^;]+);/g)) if (!comp.has(match[1]!)) comp.set(match[1]!, match[2]!.trim().replace(/\s+/g, " ")); // first occurrence: its own reduced-motion override redeclares durations
  // Documented deviations (packet §3a/R7): the drawer-out duration is 200ms by
  // D-077/AGENTS.md (comp 150ms); --g-on-primary-edge comes from shell.css, not
  // tokens.css; shadows and the focus ring name var(--g-*) in place of the
  // identical literals; font stacks carry fallback chains.
  const SKIP = new Set(["--sw-dur-drawer-out", "--sw-focus-ring", "--sw-shadow-popover", "--sw-shadow-drawer", "--sw-font-sans", "--sw-font-mono", "--sw-numeric"]);
  it("every directly-mapped literal equals its --sw-* source", () => {
    const mismatches: string[] = [];
    for (const [gName, gValue] of Object.entries(G_VARS)) {
      const swName = gName.replace(/^--g-/, "--sw-");
      if (SKIP.has(swName) || !comp.has(swName)) continue;
      const swValue = comp.get(swName)!;
      if (/var\(/.test(gValue) || /var\(/.test(swValue)) continue;
      // The packet lower-cases the comp hexes to match index.css:68-77.
      if (gValue.toLowerCase() !== swValue.toLowerCase()) mismatches.push(`${gName}: ${gValue} vs ${swName}: ${swValue}`);
    }
    expect(mismatches).toEqual([]);
  });
  it("the documented deviation is exactly 200ms vs 150ms", () => {
    expect(G_VARS["--g-dur-drawer-out"]).toBe("200ms");
    expect(comp.get("--sw-dur-drawer-out")).toBe("150ms");
  });
  it("every goal block hex is a comp literal", () => {
    const compHexes = new Set([...comp.values()].filter(v => v.startsWith("#")).map(v => v.toLowerCase()));
    for (const hex of GOAL_BLOCK_HEXES) expect(compHexes.has(hex), hex).toBe(true);
  });
  it("theme and var tables stay internally consistent", () => {
    for (const name of Object.keys(G_THEME)) {
      if (name.startsWith("--color-g-")) expect(G_VARS[name.replace("--color-g-", "--g-")], name).toBeDefined();
    }
    expect(APPROVED.has("#b45309")).toBe(true);
  });
});
