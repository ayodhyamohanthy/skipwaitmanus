// GATE-goal-design-ratchet (D-332, packet docs/plans/D-048-retire.md section 5):
// until the kit layer is gone, CI makes the old design a one-way street.
//
// 1. A released page stays released: every id in the baseline's `released` list
//    is still in RELEASED (client/src/lib/goalSurfaces.ts). Taking a surface
//    back is then a deliberate baseline edit in the same pull request, with the
//    incident or decision named, never a quiet one-line revert.
// 2. No new old-design code: only files on the baseline's allow-list may import
//    client/src/components/kit or call goalSurfaceOn outside
//    client/src/pages/goal, client/src/components/goal and the flag module.
// 3. The list only shrinks: an entry is removed when its file stops importing
//    the kit or loses its switch, and an entry is never added without a
//    decision id in the same pull request.
// 4. Each rule has a fixture that fails it.
//
// The scan parses every client source file with the TypeScript compiler API, so
// a kit path or a switch call inside a comment, string or test fixture is not a
// match. This file repeats nothing that goalPagesBoundary.test.ts (goal pages
// reaching kit modules) and scripts/designTokenAuditCore.mjs (legacy tokens and
// colour literals in goal scope) already refuse, and it changes no page and no
// runtime code.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { goalSurfaceIds, releasedGoalSurfaces } from "../lib/goalSurfaces";

const CLIENT_SRC = join(__dirname, "..");
const REPO_ROOT = join(CLIENT_SRC, "..", "..");
const BASELINE_PATH = join(__dirname, "goalDesignRatchet.baseline.json");

/** Directories whose files may use the kit and the switch freely (packet §5). */
const GOAL_DIRS = ["client/src/pages/goal/", "client/src/components/goal/"];
/** The one flag module that owns goalSurfaceOn itself. */
const FLAG_MODULE = "client/src/lib/goalSurfaces.ts";
/** A kit module specifier: "@/components/kit/x", "../../components/kit/x", "components/kit/x". */
const KIT_SPECIFIER = /(^|\/)components\/kit\//;

type AllowEntry = {
  /** Repository-relative path, forward slashes. */
  file: string;
  /** The file imports a client/src/components/kit module. */
  kitImport: boolean;
  /** The file calls goalSurfaceOn (an old/new switch). */
  surfaceSwitch: boolean;
  /** The decision id that admits this entry; a new entry needs one. */
  decision: string;
};

type Baseline = {
  measuredOn: string;
  decision: string;
  released: string[];
  allow: AllowEntry[];
};

type SourceFacts = {
  file: string;
  kitImport: boolean;
  surfaceSwitch: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw new Error(`goalDesignRatchet.baseline.json: "${field}" must be an array of strings`);
  }
  return value;
}

function readBaseline(): Baseline {
  const parsed: unknown = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  if (!isRecord(parsed)) throw new Error("goalDesignRatchet.baseline.json: the baseline must be an object");
  const allowRaw = parsed.allow;
  if (!Array.isArray(allowRaw)) throw new Error('goalDesignRatchet.baseline.json: "allow" must be an array');
  const allow: AllowEntry[] = allowRaw.map((entry: unknown, index: number) => {
    if (!isRecord(entry)) throw new Error(`goalDesignRatchet.baseline.json: allow[${index}] must be an object`);
    const { file, kitImport, surfaceSwitch, decision } = entry;
    if (typeof file !== "string" || file.trim() === "") {
      throw new Error(`goalDesignRatchet.baseline.json: allow[${index}].file must be a non-empty string`);
    }
    if (typeof kitImport !== "boolean" || typeof surfaceSwitch !== "boolean") {
      throw new Error(`goalDesignRatchet.baseline.json: allow[${index}] needs boolean kitImport and surfaceSwitch`);
    }
    if (typeof decision !== "string") {
      throw new Error(`goalDesignRatchet.baseline.json: allow[${index}].decision must be a string`);
    }
    return { file, kitImport, surfaceSwitch, decision };
  });
  return {
    measuredOn: typeof parsed.measuredOn === "string" ? parsed.measuredOn : "",
    decision: typeof parsed.decision === "string" ? parsed.decision : "",
    released: stringArray(parsed.released, "released"),
    allow,
  };
}

/** The flag module specifier: "@/lib/goalSurfaces", "../lib/goalSurfaces". */
const FLAG_SPECIFIER = /(^|\/)lib\/goalSurfaces$/;

/**
 * Tokenize one source text and report the two old-design facts the ratchet
 * pins. The scanner skips comments and keeps strings as single tokens, so a kit
 * path or a switch call quoted in a comment or a test fixture is not a match,
 * and it is fast enough to read the whole client tree. Import clauses are
 * tracked so an aliased `import { goalSurfaceOn as on }` call is caught too; a
 * namespace call (`flags.goalSurfaceOn(...)`) is caught by the plain name.
 */
function scanSource(file: string, source: string): SourceFacts {
  const variant = file.endsWith(".tsx") ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /*skipTrivia*/ true, variant, source);
  let kitImport = false;
  let surfaceSwitch = false;
  // A bare call still counts; an import clause adds every local alias of the switch.
  const switchNames = new Set<string>(["goalSurfaceOn"]);

  let inImportClause = false;
  let importNames: { imported: string; local: string }[] = [];
  let lastImported: { imported: string; local: string } | null = null;
  let expectAlias = false;
  let pendingSwitch = false;

  let prevKind: ts.SyntaxKind | null = null;
  let prevPrevKind: ts.SyntaxKind | null = null;
  let prevText = "";
  let prevPrevText = "";
  // Brace depth inside each open template substitution; a plain scan() stops at
  // a template head unless the matching close brace is rescanned as a template
  // token, so this keeps the token stream aligned with the real source.
  const templateStack: number[] = [];

  const specifierOf = (tokenText: string): string => tokenText.slice(1, -1);

  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.TemplateHead) {
      templateStack.push(0);
    } else if (templateStack.length > 0) {
      if (token === ts.SyntaxKind.OpenBraceToken) {
        templateStack[templateStack.length - 1]++;
      } else if (token === ts.SyntaxKind.CloseBraceToken) {
        if (templateStack[templateStack.length - 1] === 0) {
          token = scanner.reScanTemplateToken(false);
          if (token === ts.SyntaxKind.TemplateTail) templateStack.pop();
        } else {
          templateStack[templateStack.length - 1]--;
        }
      }
    }
    const text = scanner.getTokenText();

    if (token === ts.SyntaxKind.ImportKeyword) {
      inImportClause = true;
      importNames = [];
      lastImported = null;
      expectAlias = false;
    } else if (inImportClause) {
      if (token === ts.SyntaxKind.OpenParenToken) {
        inImportClause = false; // dynamic import, not an import clause
      } else if (token === ts.SyntaxKind.Identifier) {
        if (expectAlias && lastImported) {
          lastImported.local = text;
          expectAlias = false;
        } else {
          lastImported = { imported: text, local: text };
          importNames.push(lastImported);
        }
      } else if (token === ts.SyntaxKind.AsKeyword) {
        expectAlias = true;
      } else if (token === ts.SyntaxKind.SemicolonToken) {
        inImportClause = false;
      }
    }

    if (token === ts.SyntaxKind.StringLiteral) {
      const specifier = specifierOf(text);
      const fromClause = prevKind === ts.SyntaxKind.FromKeyword;
      const dynamicImport = prevKind === ts.SyntaxKind.OpenParenToken && prevPrevKind === ts.SyntaxKind.ImportKeyword;
      const requireCall =
        prevKind === ts.SyntaxKind.OpenParenToken && prevPrevKind === ts.SyntaxKind.Identifier && prevPrevText === "require";
      const sideEffectImport = prevKind === ts.SyntaxKind.ImportKeyword;
      if ((fromClause || dynamicImport || requireCall || sideEffectImport) && KIT_SPECIFIER.test(specifier)) {
        kitImport = true;
      }
      if (fromClause && inImportClause && FLAG_SPECIFIER.test(specifier)) {
        for (const name of importNames) if (name.imported === "goalSurfaceOn") switchNames.add(name.local);
      }
      inImportClause = false;
    }

    if (pendingSwitch) {
      if (token === ts.SyntaxKind.OpenParenToken) surfaceSwitch = true;
      pendingSwitch = false;
    }
    if (token === ts.SyntaxKind.Identifier && switchNames.has(text)) pendingSwitch = true;

    prevPrevKind = prevKind;
    prevPrevText = prevText;
    prevKind = token;
    prevText = text;
  }
  return { file, kitImport, surfaceSwitch };
}

/**
 * A file can only break rule 2 or hold a stale rule-3 entry when its text names
 * the kit path or the switch, so the scan reads every file but parses only those
 * (about forty today). The substring test is a sound superset: a kit module
 * specifier always contains "components/kit", and a switch call, an aliased
 * import or a namespace call always contains "goalSurfaceOn".
 */
const PARSED_MARKERS = ["components/kit", "goalSurfaceOn"];

let cachedSources: SourceFacts[] | null = null;

/** Every client source file, repository-relative with forward slashes. */
function collectSources(): SourceFacts[] {
  if (cachedSources) return cachedSources;
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(CLIENT_SRC);
  cachedSources = files
    .map(full => relative(REPO_ROOT, full).split("\\").join("/"))
    .sort()
    .map(file => {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      if (!PARSED_MARKERS.some(marker => source.includes(marker))) {
        return { file, kitImport: false, surfaceSwitch: false };
      }
      return scanSource(file, source);
    });
  return cachedSources;
}

function inGoalDir(file: string, goalDirs: readonly string[]): boolean {
  return goalDirs.some(dir => file.startsWith(dir));
}

/** Rule 1: a released surface is never quietly switched back. */
function releasedViolations(baselineReleased: readonly string[], released: readonly string[]): string[] {
  const declared = new Set<string>(goalSurfaceIds());
  const live = new Set<string>(released);
  return baselineReleased
    .filter(id => !live.has(id))
    .map(id => (declared.has(id) ? `${id} is no longer in RELEASED` : `${id} is not a declared goal surface`));
}

/** Rule 2: no new kit import and no new old/new switch outside the allow-list. */
function newOldDesignViolations(
  sources: readonly SourceFacts[],
  allow: readonly AllowEntry[],
  goalDirs: readonly string[],
  flagModule: string,
): string[] {
  const allowed = new Set(allow.map(entry => entry.file));
  const violations: string[] = [];
  for (const source of sources) {
    if (inGoalDir(source.file, goalDirs) || source.file === flagModule) continue;
    if (allowed.has(source.file)) continue;
    if (source.kitImport) violations.push(`${source.file} imports client/src/components/kit without an allow-list entry`);
    if (source.surfaceSwitch) violations.push(`${source.file} calls goalSurfaceOn without an allow-list entry`);
  }
  return violations;
}

/** Rule 3: the allow-list only shrinks; a stale entry must be removed. */
function staleAllowViolations(sources: readonly SourceFacts[], allow: readonly AllowEntry[]): string[] {
  const byFile = new Map(sources.map(source => [source.file, source]));
  const violations: string[] = [];
  for (const entry of allow) {
    const source = byFile.get(entry.file);
    if (!source) {
      violations.push(`${entry.file} is gone; remove its allow-list entry`);
      continue;
    }
    if (entry.kitImport && !source.kitImport) {
      violations.push(`${entry.file} no longer imports the kit; remove its allow-list entry`);
    }
    if (entry.surfaceSwitch && !source.surfaceSwitch) {
      violations.push(`${entry.file} no longer calls goalSurfaceOn; remove its allow-list entry`);
    }
  }
  return violations;
}

/** Rule 3: a new entry names the decision that admits it. */
function missingDecisionViolations(allow: readonly AllowEntry[]): string[] {
  return allow
    .filter(entry => !/^D-\d+$/.test(entry.decision.trim()))
    .map(entry => `${entry.file} has no decision id (D-nnn) on its allow-list entry`);
}

describe("goal design ratchet (D-332)", () => {
  const baseline = readBaseline();

  it("keeps every released goal surface released (rule 1)", () => {
    expect(releasedViolations(baseline.released, releasedGoalSurfaces())).toEqual([]);
  });

  // The first call reads and tokenizes the whole client tree once (memoized for
  // the second test), so it gets its own budget above the 20 s suite default.
  it("refuses new old-design code outside the baseline allow-list (rule 2)", { timeout: 60_000 }, () => {
    expect(newOldDesignViolations(collectSources(), baseline.allow, GOAL_DIRS, FLAG_MODULE)).toEqual([]);
  });

  it("only lets the allow-list shrink (rule 3)", { timeout: 60_000 }, () => {
    expect(staleAllowViolations(collectSources(), baseline.allow)).toEqual([]);
  });

  it("requires a decision id on every allow-list entry (rule 3)", () => {
    expect(missingDecisionViolations(baseline.allow)).toEqual([]);
  });

  it("records the main it was measured on", () => {
    expect(baseline.measuredOn).toMatch(/^main [0-9a-f]{7,40}/);
    expect(baseline.decision).toBe("D-332");
  });
});

describe("goal design ratchet fixtures (rule 4: each rule fails)", () => {
  it("rule 1 fails when a released surface leaves RELEASED", () => {
    expect(releasedViolations(["home", "sign-in"], ["home"])).toEqual(["sign-in is no longer in RELEASED"]);
  });

  it("rule 1 fails on an id that is not a declared surface", () => {
    expect(releasedViolations(["not-a-surface"], ["home"])).toEqual(["not-a-surface is not a declared goal surface"]);
  });

  it("rule 2 fails on a new kit import", () => {
    const sources: SourceFacts[] = [{ file: "client/src/pages/NewPage.tsx", kitImport: true, surfaceSwitch: false }];
    expect(newOldDesignViolations(sources, [], GOAL_DIRS, FLAG_MODULE)).toEqual([
      "client/src/pages/NewPage.tsx imports client/src/components/kit without an allow-list entry",
    ]);
  });

  it("rule 2 fails on a new old/new switch", () => {
    const sources: SourceFacts[] = [{ file: "client/src/pages/NewPage.tsx", kitImport: false, surfaceSwitch: true }];
    expect(newOldDesignViolations(sources, [], GOAL_DIRS, FLAG_MODULE)).toEqual([
      "client/src/pages/NewPage.tsx calls goalSurfaceOn without an allow-list entry",
    ]);
  });

  it("rule 2 exempts goal directories and the flag module", () => {
    const sources: SourceFacts[] = [
      { file: "client/src/pages/goal/plans/GoalPlans.tsx", kitImport: true, surfaceSwitch: true },
      { file: "client/src/components/goal/Frame.tsx", kitImport: true, surfaceSwitch: true },
      { file: FLAG_MODULE, kitImport: false, surfaceSwitch: true },
    ];
    expect(newOldDesignViolations(sources, [], GOAL_DIRS, FLAG_MODULE)).toEqual([]);
  });

  it("rule 3 fails when an allow-listed file stops importing the kit", () => {
    const sources: SourceFacts[] = [{ file: "client/src/pages/Old.tsx", kitImport: false, surfaceSwitch: false }];
    const allow: AllowEntry[] = [{ file: "client/src/pages/Old.tsx", kitImport: true, surfaceSwitch: false, decision: "D-332" }];
    expect(staleAllowViolations(sources, allow)).toEqual([
      "client/src/pages/Old.tsx no longer imports the kit; remove its allow-list entry",
    ]);
  });

  it("rule 3 fails when an allow-listed file loses its switch", () => {
    const sources: SourceFacts[] = [{ file: "client/src/pages/Old.tsx", kitImport: false, surfaceSwitch: false }];
    const allow: AllowEntry[] = [{ file: "client/src/pages/Old.tsx", kitImport: false, surfaceSwitch: true, decision: "D-332" }];
    expect(staleAllowViolations(sources, allow)).toEqual([
      "client/src/pages/Old.tsx no longer calls goalSurfaceOn; remove its allow-list entry",
    ]);
  });

  it("rule 3 fails when an allow-listed file is gone", () => {
    const allow: AllowEntry[] = [{ file: "client/src/pages/Deleted.tsx", kitImport: true, surfaceSwitch: false, decision: "D-332" }];
    expect(staleAllowViolations([], allow)).toEqual([
      "client/src/pages/Deleted.tsx is gone; remove its allow-list entry",
    ]);
  });

  it("rule 3 fails on an entry without a decision id", () => {
    const allow: AllowEntry[] = [{ file: "client/src/pages/Old.tsx", kitImport: true, surfaceSwitch: false, decision: "" }];
    expect(missingDecisionViolations(allow)).toEqual([
      "client/src/pages/Old.tsx has no decision id (D-nnn) on its allow-list entry",
    ]);
  });

  it("the scanner reads code, not comments or fixture strings", () => {
    const fixture = [
      '// import { Button } from "@/components/kit/button";',
      'const sample = `import { Button } from "../../components/kit/button";`;',
      'const note = "goalSurfaceOn(\\"home\\") is described here";',
      "export const nothing = 1;",
    ].join("\n");
    expect(scanSource("client/src/pages/Fixture.tsx", fixture)).toEqual({
      file: "client/src/pages/Fixture.tsx",
      kitImport: false,
      surfaceSwitch: false,
    });
  });

  it("the scanner sees a real kit import and a real switch call", () => {
    const fixture = [
      'import { Button } from "@/components/kit/button";',
      'import { goalSurfaceOn } from "@/lib/goalSurfaces";',
      'export const on = goalSurfaceOn("home");',
    ].join("\n");
    expect(scanSource("client/src/pages/Real.tsx", fixture)).toEqual({
      file: "client/src/pages/Real.tsx",
      kitImport: true,
      surfaceSwitch: true,
    });
  });

  it("the scanner sees a dynamic kit import", () => {
    const fixture = 'export const load = () => import("@/components/kit/button");';
    expect(scanSource("client/src/pages/Lazy.tsx", fixture).kitImport).toBe(true);
  });

  it("the scanner sees an aliased switch call", () => {
    const fixture = [
      'import { goalSurfaceOn as surfaceOn } from "@/lib/goalSurfaces";',
      'export const on = surfaceOn("home");',
    ].join("\n");
    expect(scanSource("client/src/pages/Aliased.tsx", fixture).surfaceSwitch).toBe(true);
  });

  it("the scanner sees a namespace switch call", () => {
    const fixture = [
      'import * as flags from "@/lib/goalSurfaces";',
      'export const on = flags.goalSurfaceOn("home");',
    ].join("\n");
    expect(scanSource("client/src/pages/Namespaced.tsx", fixture).surfaceSwitch).toBe(true);
  });
});
