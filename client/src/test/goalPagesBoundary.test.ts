// Moved-page import boundary (D-167 (3), GOAL_UI_COVERAGE.md section 6.1): a
// page that exports GOAL_PAGE claims to be moved, so nothing it renders may
// pull in components/kit/*, components/ui/* or styles/kit.css. This file lives
// apart from goalBoundary.test.ts, which D-048-F-flags owns.
//
// D-241 (Oct 30) strengthens it: the page's whole runtime import graph inside
// the repository is walked (root aliases @/ and @shared/, relative specifiers,
// index barrels with `export … from` / `export * from`, and dynamic import();
// `import type` / `export type` are not runtime edges). Besides the kit, ui and
// kit-stylesheet ban, a reached module must be goal code (components/goal/**,
// pages/goal/**) or sit on the AUDITED list below, whose kinds are checked
// mechanically. Negative controls prove the five probe shapes D-241 (1)
// reproduced, and the legacy OneTapShareActions, all fail. No waivers: a new
// entry is a reviewed change that states its reason (D-241 (5)).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const CLIENT_SRC = join(__dirname, "..");
const REPO_ROOT = join(CLIENT_SRC, "..", "..");
const SHARED_DIR = join(REPO_ROOT, "shared");
const PAGES_DIR = join(CLIENT_SRC, "pages");
const COMPONENTS_DIR = join(CLIENT_SRC, "components");
const BANNED = /components[\\/]kit[\\/]|components[\\/]ui[\\/]|styles[\\/]kit\.css$/;
const GOAL_DIRS = [join(COMPONENTS_DIR, "goal") + sep, join(PAGES_DIR, "goal") + sep];

type AuditKind = "behavior-only" | "goal-styled" | "dual-tone";
type AuditEntry = { file: string; kind: AuditKind; reason: string; goalCallSites?: string[] };

/**
 * The explicit audited list (D-241 (3)), paths relative to client/src. Each kind
 * is checked, never trusted: behavior-only carries no literal className/style;
 * goal-styled uses no arbitrary colour literal and imports no kit, ui or kit
 * stylesheet; dual-tone is admitted only while every reached call site of the
 * named components passes tone="goal".
 */
const AUDITED: AuditEntry[] = [
  { file: "components/BetaNotice.tsx", kind: "dual-tone", goalCallSites: ["BetaBadge", "BetaNoticeLine"], reason: "beta badge and notice line; the goal tone uses goal tokens only, the kit tone serves the legacy shell" },
  { file: "components/referrer-home/ReferrerSampleRows.tsx", kind: "goal-styled", reason: "referrer-home sample rows drawn with goal tokens only" },
  { file: "_core/auth.tsx", kind: "behavior-only", reason: "auth hooks; SignInButton is an unstyled wrapper that passes className through" },
  { file: "components/plans/billingApi.ts", kind: "behavior-only", reason: "billing API calls, no UI" },
  { file: "components/plans/format.ts", kind: "behavior-only", reason: "price and date formatting, no UI" },
  { file: "components/plans/planCatalog.ts", kind: "behavior-only", reason: "plan catalogue data, no UI" },
  { file: "components/referrer-home/referrerData.ts", kind: "behavior-only", reason: "referrer-home data loading, no UI" },
  { file: "components/verify/verifyApi.ts", kind: "behavior-only", reason: "work-email verify API calls, no UI" },
];

type Read = (file: string) => string | null;
const readDisk: Read = file => (existsSync(file) && statSync(file).isFile() ? readFileSync(file, "utf8") : null);
const overlay = (files: Record<string, string>): Read => file => (file in files ? files[file] : readDisk(file));

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { if (entry !== "node_modules") yield* walk(path); }
    else if (/\.tsx?$/.test(entry)) yield path;
  }
}

/** The original specifier scan, kept for the original kit/ui/kit.css assertion. */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) specs.push(match[1]);
  return specs;
}

/** Runtime import edges: static imports, side-effect imports, re-exports and dynamic import(); type-only imports are not edges. */
function runtimeSpecifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const specs: string[] = [];
  for (const m of code.matchAll(/(?:^|[;\n}])\s*import\s+(type\s+)?[\w*{}\s,$]*?\s*from\s*["']([^"']+)["']/g)) if (!m[1]) specs.push(m[2]);
  for (const m of code.matchAll(/(?:^|[;\n}])\s*import\s*["']([^"']+)["']/g)) specs.push(m[1]);
  for (const m of code.matchAll(/(?:^|[;\n}])\s*export\s+(type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*["']([^"']+)["']/g)) if (!m[1]) specs.push(m[2]);
  for (const m of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
  return specs;
}

function resolveSpecifier(spec: string, fromFile: string, read: Read = readDisk): string | null {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = join(CLIENT_SRC, spec.slice(2));
  else if (spec.startsWith("@shared/")) base = join(SHARED_DIR, spec.slice(8));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (read(candidate) !== null) return candidate;
  }
  return null;
}

const rel = (file: string) => relative(CLIENT_SRC, file).split(sep).join("/");
const inGoal = (file: string) => GOAL_DIRS.some(dir => file.startsWith(dir));
const needsAudit = (file: string) => !inGoal(file) && ((file.endsWith(".tsx") && file.startsWith(CLIENT_SRC + sep)) || file.startsWith(COMPONENTS_DIR + sep));

const LITERAL_STYLING = /className\s*=\s*(?:["'`]|\{\s*["'`]|\{\s*(?:cn|clsx|cx)\()|style\s*=\s*\{\{/;
const COLOUR_LITERAL = /\[#[0-9a-fA-F]{3,8}\]/;

/** A list entry's own mechanical check (D-241 (3)); returns the reason it fails, or null. */
function kindFailure(entry: AuditEntry, source: string | null, reached: Map<string, string>): string | null {
  if (source === null) return "listed file does not exist";
  if (importSpecifiers(source).some(spec => BANNED.test(spec))) return "imports kit, ui or the kit stylesheet";
  if (entry.kind === "behavior-only" && LITERAL_STYLING.test(source)) return "behavior-only module carries a literal className or style";
  if (entry.kind === "goal-styled" && COLOUR_LITERAL.test(source)) return "goal-styled module uses an arbitrary colour literal";
  if (entry.kind === "dual-tone") {
    if (!entry.goalCallSites?.length) return "dual-tone entry names no components";
    for (const [file, text] of reached) {
      for (const name of entry.goalCallSites) {
        for (const call of text.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "g"))) {
          if (!/\btone=["']goal["']/.test(call[1])) return `${rel(file)} renders <${name}> without tone="goal"`;
        }
      }
    }
  }
  return null;
}

/** Walk one goal page's runtime graph and list every boundary offence. */
function goalPageOffenders(page: string, read: Read = readDisk): string[] {
  const reached = new Map<string, string>();
  const offenders: string[] = [];
  const queue = [page];
  while (queue.length) {
    const file = queue.shift()!;
    if (reached.has(file)) continue;
    const source = read(file);
    if (source === null) continue;
    reached.set(file, source);
    if (file.endsWith(".css")) continue;
    for (const spec of runtimeSpecifiers(source)) {
      const resolved = resolveSpecifier(spec, file, read);
      if (BANNED.test(resolved ?? spec)) { offenders.push(`${rel(file)} -> ${spec}`); continue; }
      if (resolved && (resolved.startsWith(CLIENT_SRC + sep) || resolved.startsWith(SHARED_DIR + sep))) queue.push(resolved);
    }
  }
  for (const file of reached.keys()) {
    if (file === page) continue;
    const name = rel(file);
    const entry = AUDITED.find(item => item.file === name);
    if (file.endsWith(".css")) { if (!entry) offenders.push(`${rel(page)} reaches unaudited stylesheet ${name}`); continue; }
    if (!needsAudit(file)) continue;
    if (!entry) { offenders.push(`${rel(page)} reaches ${name}, which is neither goal code nor on the audited list`); continue; }
    const failure = kindFailure(entry, reached.get(file)!, reached);
    if (failure) offenders.push(`${name} (${entry.kind}): ${failure}`);
  }
  return offenders;
}

function goalPages(): string[] {
  const pages: string[] = [];
  for (const file of walk(PAGES_DIR)) {
    if (/\.test\.tsx?$/.test(file)) continue;
    if (/export\s+const\s+GOAL_PAGE\b/.test(readFileSync(file, "utf8"))) pages.push(file);
  }
  return pages.sort();
}

describe("moved-page import boundary", () => {
  it("no page exporting GOAL_PAGE (or its direct components) imports the kit", () => {
    const movedPages = goalPages();
    const offenders: string[] = [];
    for (const page of movedPages) {
      const sources = new Map<string, string>([[page, readFileSync(page, "utf8")]]);
      for (const spec of importSpecifiers(sources.get(page)!)) {
        const resolved = resolveSpecifier(spec, page);
        if (resolved && resolved.startsWith(COMPONENTS_DIR) && !sources.has(resolved)) {
          sources.set(resolved, readFileSync(resolved, "utf8"));
        }
      }
      for (const [file, source] of sources) {
        for (const spec of importSpecifiers(source)) {
          const resolved = resolveSpecifier(spec, file);
          const probe = resolved ?? spec;
          if (BANNED.test(probe)) offenders.push(`${relative(CLIENT_SRC, file)} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // D-241 (3): the same ban over each page's whole runtime graph, plus the audited list.
  it("finds the goal pages", () => {
    expect(goalPages().length).toBeGreaterThan(0);
  });

  it.each(goalPages().map(page => [rel(page), page]))("%s reaches no kit, ui, kit stylesheet or unaudited module through any import path", (_name, page) => {
    expect(goalPageOffenders(page)).toEqual([]);
  });

  it("every audited entry exists, is not goal code, and passes its kind's check on its own", () => {
    const failures = AUDITED.flatMap(entry => {
      const file = join(CLIENT_SRC, entry.file);
      const source = readDisk(file);
      const failure = inGoal(file) ? "goal code needs no entry" : kindFailure(entry, source, new Map(source === null ? [] : [[file, source]]));
      return failure ? [`${entry.file}: ${failure}`] : [];
    });
    expect(failures).toEqual([]);
    expect(new Set(AUDITED.map(entry => entry.file)).size).toBe(AUDITED.length);
    expect(AUDITED.every(entry => entry.reason.trim().length > 0)).toBe(true);
  });
});

// D-241 (4): negative controls on fixture graphs this test builds in memory
// (over the real tree, never by editing a real component). Each must fail.
describe("moved-page import boundary: negative controls", () => {
  const at = (path: string) => join(CLIENT_SRC, path);
  const PAGE = at("pages/goal/__probe__/ProbePage.tsx");
  const page = (imports: string) => `${imports}\nexport const GOAL_PAGE = { goalLine: "Probe." } as const;\nexport default function ProbePage() { return null; }\n`;
  const offendersFor = (files: Record<string, string>) => goalPageOffenders(PAGE, overlay(files));

  it("probe 1: a ui import inside a page-local relative module fails", () => {
    const offenders = offendersFor({
      [PAGE]: page(`import { Frame } from "./Frame";`),
      [at("pages/goal/__probe__/Frame.tsx")]: `import { Button } from "@/components/ui/button";\nexport function Frame() { return null; }\n`,
    });
    expect(offenders).toContain("pages/goal/__probe__/Frame.tsx -> @/components/ui/button");
  });

  it("probe 2: a relative ../components/kit import inside a page-local module fails", () => {
    const offenders = offendersFor({
      [PAGE]: page(`import { Frame } from "./Frame";`),
      [at("pages/goal/__probe__/Frame.tsx")]: `import { Button } from "../../../components/kit/button";\nexport function Frame() { return null; }\n`,
    });
    expect(offenders).toContain("pages/goal/__probe__/Frame.tsx -> ../../../components/kit/button");
  });

  it("probe 3: a transitive ui import (page -> share -> component -> ui) fails", () => {
    const offenders = offendersFor({
      [PAGE]: page(`import { Share } from "@/components/__probe__/Share";`),
      [at("components/__probe__/Share.tsx")]: `import { Inner } from "./Inner";\nexport function Share() { return null; }\n`,
      [at("components/__probe__/Inner.tsx")]: `import { Button } from "@/components/ui/button";\nexport function Inner() { return null; }\n`,
    });
    expect(offenders).toContain("components/__probe__/Inner.tsx -> @/components/ui/button");
  });

  it("probe 4: a root-alias kit import two levels down fails", () => {
    const offenders = offendersFor({
      [PAGE]: page(`import { Share } from "@/components/__probe__/Share";`),
      [at("components/__probe__/Share.tsx")]: `import { Mid } from "@/components/__probe__/Mid";\nexport function Share() { return null; }\n`,
      [at("components/__probe__/Mid.tsx")]: `import { Button } from "@/components/kit/button";\nexport function Mid() { return null; }\n`,
    });
    expect(offenders).toContain("components/__probe__/Mid.tsx -> @/components/kit/button");
  });

  it("probe 5: a barrel re-export of a module importing the kit fails (export * and export { } from)", () => {
    for (const reexport of [`export * from "./Mod";`, `export { Mod } from "./Mod";`]) {
      const offenders = offendersFor({
        [PAGE]: page(`import { Mod } from "@/components/__probe__";`),
        [at("components/__probe__/index.ts")]: `${reexport}\n`,
        [at("components/__probe__/Mod.tsx")]: `import { Button } from "@/components/kit/button";\nexport function Mod() { return null; }\n`,
      });
      expect(offenders).toContain("components/__probe__/Mod.tsx -> @/components/kit/button");
    }
  });

  it("a dynamic import() of a ui module fails", () => {
    const offenders = offendersFor({ [PAGE]: page(`const Lazy = () => import("@/components/ui/button");`) });
    expect(offenders).toContain("pages/goal/__probe__/ProbePage.tsx -> @/components/ui/button");
  });

  it("the legacy share OneTapShareActions fails when a goal page reaches it (directly or through ZeroActivityShareCard)", () => {
    expect(AUDITED.some(entry => /OneTapShareActions|ZeroActivityShareCard/.test(entry.file))).toBe(false);
    for (const spec of ["@/components/OneTapShareActions", "@/components/ZeroActivityShareCard"]) {
      const offenders = offendersFor({ [PAGE]: page(`import { X } from "${spec}";`) });
      expect(offenders.some(line => line.includes("components/OneTapShareActions.tsx"))).toBe(true);
    }
  });

  it("an unaudited legacy-styled component fails even with no kit import, and a listed module failing its kind fails", () => {
    const legacy = offendersFor({
      [PAGE]: page(`import { Old } from "@/components/__probe__/Old";`),
      [at("components/__probe__/Old.tsx")]: `export function Old() { return <div className="border-[#e5e5e5]" />; }\n`,
    });
    expect(legacy.some(line => line.includes("components/__probe__/Old.tsx"))).toBe(true);
    const mislabelled = offendersFor({
      [PAGE]: page(`import { verify } from "@/components/verify/verifyApi";`),
      [at("components/verify/verifyApi.ts")]: `export const verify = () => null;\nexport const Bad = () => <p style={{ color: "red" }} />;\n`,
    });
    expect(mislabelled.some(line => line.startsWith("components/verify/verifyApi.ts (behavior-only)"))).toBe(true);
  });

  it("a dual-tone module reached through a kit-tone call site fails", () => {
    const offenders = offendersFor({ [PAGE]: page(`import { BetaNoticeLine } from "@/components/BetaNotice";\nexport const Line = () => <BetaNoticeLine tone="kit" />;`) });
    expect(offenders.some(line => line.startsWith("components/BetaNotice.tsx (dual-tone)"))).toBe(true);
  });

  it("type-only imports are not runtime edges", () => {
    const offenders = offendersFor({ [PAGE]: page(`import type { ButtonProps } from "@/components/ui/button";\nexport type { Row } from "@/components/OneTapShareActions";`) });
    expect(offenders).toEqual([]);
  });
});
