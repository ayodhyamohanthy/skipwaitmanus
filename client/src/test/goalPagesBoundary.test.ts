// Moved-page import boundary (D-167 (3), GOAL_UI_COVERAGE.md section 6.1): a
// page that exports GOAL_PAGE claims to be moved, so the page module and the
// components it directly imports may not pull in components/kit/*,
// components/ui/* or styles/kit.css. One level deep is the page's own
// responsibility surface; deeper reuse is caught as those components adopt
// GOAL_PAGE themselves. This file lives apart from goalBoundary.test.ts,
// which D-048-F-flags owns.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CLIENT_SRC = join(__dirname, "..");
const PAGES_DIR = join(CLIENT_SRC, "pages");
const COMPONENTS_DIR = join(CLIENT_SRC, "components");
const BANNED = /components[\\/]kit[\\/]|components[\\/]ui[\\/]|styles[\\/]kit\.css$/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { if (entry !== "node_modules") yield* walk(path); }
    else if (/\.tsx?$/.test(entry)) yield path;
  }
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) specs.push(match[1]);
  return specs;
}

function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = join(CLIENT_SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

describe("moved-page import boundary", () => {
  it("no page exporting GOAL_PAGE (or its direct components) imports the kit", () => {
    const movedPages: string[] = [];
    for (const file of walk(PAGES_DIR)) {
      if (/\.test\.tsx?$/.test(file)) continue;
      if (/export\s+const\s+GOAL_PAGE\b/.test(readFileSync(file, "utf8"))) movedPages.push(file);
    }
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
});
