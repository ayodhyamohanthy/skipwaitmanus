import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditFiles, auditGoalTokens, GOAL_TOKENS, readGoalTokens } from "./designTokenAuditCore.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const GOAL = "client/src/components/goal/Example.tsx";
const SCREEN = "client/src/pages/goal/Example.tsx";
const LIVE = "client/src/pages/Example.tsx";
const rules = (path: string, source: string, sampleNames: string[] = []) => auditFiles([{ path, source }], { sampleNames }).findings.map(finding => finding.rule);

describe("design-token audit: unmoved Kit v4 files (A1)", () => {
  it("accepts approved and third-party hexes", () => {
    const result = auditFiles([{ path: LIVE, source: 'className="bg-[#ededff] text-[#25d366]"' }]);
    expect(result.findings).toEqual([]);
    expect(result.approved).toBe(1);
    expect(result.thirdParty).toBe(1);
  });
  it("rejects an off-brand hex", () => {
    expect(rules(LIVE, 'className="bg-[#191713]"')).toEqual(["A1"]);
  });
});

describe("design-token audit: goal scope", () => {
  it("accepts goal tokens, CSS-variable shorthand and colourless arbitrary layout (A2)", () => {
    expect(rules(GOAL, 'className="bg-g-surface text-g-ink w-(--g-rail-w) grid-cols-[28px_auto_minmax(0,1fr)_auto] gdesk:flex max-gdesk:hidden"')).toEqual([]);
  });
  it("R1: rejects colour literals in any form", () => {
    expect(rules(SCREEN, 'const c = "#0a0a0a";')).toEqual(["R1"]);
    expect(rules(SCREEN, 'style={{ color: "rgb(0 0 0)" }}')).toEqual(["R1"]);
    expect(rules(SCREEN, "className=\"bg-[oklch(0.5_0.2_250)]\"")).toEqual(["R1"]);
  });
  it("R2: keeps trust blue inside GoalVerifiedMark", () => {
    expect(rules(SCREEN, 'className="text-g-trust"')).toEqual(["R2"]);
    expect(rules("client/src/components/goal/GoalVerifiedMark.tsx", 'className="text-g-trust"')).toEqual([]);
    expect(rules(LIVE, 'className="text-g-trust"')).toEqual(["R2"]);
  });
  it("R3: keeps status hues inside the primitives", () => {
    expect(rules(SCREEN, 'className="text-g-amber"')).toEqual(["R3"]);
    expect(rules(GOAL, 'className="text-g-amber"')).toEqual([]);
  });
  it("R4: rejects Kit v4 / shadcn tokens, shapes and breakpoints", () => {
    expect(rules(GOAL, 'className="bg-primary"')).toEqual(["R4"]);
    expect(rules(GOAL, 'className="hover:text-muted-foreground"')).toEqual(["R4"]);
    expect(rules(GOAL, 'className="rounded-md"')).toEqual(["R4"]);
    expect(rules(GOAL, 'className="font-mono"')).toEqual(["R4"]);
    expect(rules(GOAL, 'className="sm:flex"')).toEqual(["R4"]);
    expect(rules(GOAL, 'const SIZE = { md: "h-10", sm: "h-9" };')).toEqual([]);
  });
  it("R5: rejects banned effects", () => {
    expect(rules(GOAL, 'className="bg-gradient-to-r"')).toEqual(["R5"]);
    expect(rules(GOAL, 'className="backdrop-blur"')).toEqual(["R5"]);
    expect(rules(GOAL, 'className="shadow-[0_0_4px]"')).toEqual(["R5"]);
    expect(rules(GOAL, 'className="animate-spin"')).toEqual(["R5"]);
    expect(rules(GOAL, 'className="aria-disabled:opacity-50"')).toEqual(["R5"]);
  });
  it("R6: rejects comp sample data anywhere and a compensation field in goal files", () => {
    expect(rules(LIVE, "const name = 'Sample Co';", ["Sample Co"])).toEqual(["R6"]);
    expect(rules(SCREEN, "<dt>Compensation</dt>")).toEqual(["R6"]);
  });
});

describe("design-token audit: goal tokens (R7) and CSS files (R8)", () => {
  const indexCss = fs.readFileSync(path.join(ROOT, "client/src/index.css"), "utf8");
  const compTokensCss = fs.readFileSync(path.join(ROOT, "design/goal-ui/pick/tokens.css"), "utf8");
  const cssFiles = [{ path: "client/src/index.css", source: indexCss }, { path: "client/src/styles/kit.css", source: "" }];

  it("matches DESIGN.md and the approved comp on the real tree", () => {
    expect(readGoalTokens(indexCss)).toEqual(GOAL_TOKENS);
    expect(auditGoalTokens({ indexCss, compTokensCss, cssFiles })).toEqual([]);
  });
  it("R7: catches a changed, missing or extra token", () => {
    const changed = indexCss.replace("--g-ink: #0a0a0a;", "--g-ink: #111111;");
    expect(auditGoalTokens({ indexCss: changed, compTokensCss: null, cssFiles }).map(finding => finding.detail)).toEqual(['--g-ink is "#111111", DESIGN.md says "#0a0a0a"']);
    const missing = indexCss.replace("  --g-touch: 44px;\n", "");
    expect(auditGoalTokens({ indexCss: missing, compTokensCss: null, cssFiles }).map(finding => finding.rule)).toEqual(["R7"]);
    const extra = indexCss.replace("  --g-touch: 44px;\n", "  --g-touch: 44px;\n  --g-brand: #ff00ff;\n");
    expect(auditGoalTokens({ indexCss: extra, compTokensCss: null, cssFiles }).map(finding => finding.detail)).toEqual(["--g-brand is not in DESIGN.md"]);
  });
  it("R7: catches drift from the approved comp that is not a recorded deviation", () => {
    const comp = compTokensCss.replace("--sw-hairline: #EBEBEB;", "--sw-hairline: #E0E0E0;");
    expect(auditGoalTokens({ indexCss, compTokensCss: comp, cssFiles }).map(finding => finding.rule)).toEqual(["R7"]);
  });
  it("R8: allows only index.css and kit.css, and goal tokens only in index.css", () => {
    expect(auditGoalTokens({ indexCss, compTokensCss: null, cssFiles: [...cssFiles, { path: "client/src/styles/goal.css", source: "" }] }).map(finding => finding.rule)).toEqual(["R8"]);
    expect(auditGoalTokens({ indexCss, compTokensCss: null, cssFiles: [cssFiles[0], { path: "client/src/styles/kit.css", source: ":root{--g-ink:#000}" }] }).map(finding => finding.rule)).toEqual(["R8"]);
  });
});
