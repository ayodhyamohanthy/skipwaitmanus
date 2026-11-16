// D-048-F-app-wrapper goal boundary. Every module under components/goal/wrapper
// and every module it reaches (alias, relative path, barrel, transitive) must
// import nothing from the kit or ui component folders, app-states/SystemStates
// or the kit stylesheet, and the goal wrapper source carries no shadcn token
// class and no class defined in the kit stylesheet. Negative controls prove the walk and
// the class scan catch today's legacy StatusBanner and ErrorScreen. Apart from
// goalBoundary.test.ts (D-090-BYOR) and goalPagesBoundary.test.ts (D-241).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CLIENT_SRC = join(__dirname, "..", "..", "..");
const WRAPPER_DIR = __dirname;
const BANNED = /components[\\/]kit[\\/]|components[\\/]ui[\\/]|app-states[\\/]SystemStates\.tsx$|styles[\\/]kit\.css$/;
const SHADCN = /\b(bg-muted|bg-primary|border-border|text-foreground|text-muted-foreground)\b/;

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) specs.push(match[1]);
  return specs;
}

function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(CLIENT_SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  // A banned target that does not resolve (a css file, a deleted path) is still reported by name.
  return base;
}

/** Every banned module reachable from `entry`, with the import chain that reaches it. */
export function bannedReach(entry: string): string[] {
  const seen = new Set<string>();
  const offenders: string[] = [];
  const stack: { file: string; chain: string[] }[] = [{ file: entry, chain: [relative(CLIENT_SRC, entry)] }];
  for (let next = stack.pop(); next; next = stack.pop()) {
    const { file, chain } = next;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file) || !statSync(file).isFile() || !/\.(tsx?|css)$/.test(file)) continue;
    for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
      const target = resolveSpecifier(spec, file);
      if (!target) continue;
      const rel = relative(CLIENT_SRC, target);
      if (BANNED.test(target)) { offenders.push([...chain, rel].join(" -> ")); continue; }
      stack.push({ file: target, chain: [...chain, rel] });
    }
  }
  return offenders;
}

function kitCssClasses(): Set<string> {
  const css = readFileSync(join(CLIENT_SRC, "styles", "kit.css"), "utf8");
  const classes = new Set<string>();
  for (const match of css.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) classes.add(match[1]);
  return classes;
}

/** Class tokens in className="..." strings and cn("...") arguments of one source file. */
function classTokens(source: string): string[] {
  const tokens: string[] = [];
  for (const match of source.matchAll(/className=\{?\s*["'`]([^"'`]+)["'`]/g)) tokens.push(...match[1].split(/\s+/));
  for (const match of source.matchAll(/cn\(([^)]*)\)/g)) for (const lit of match[1].matchAll(/["'`]([^"'`]+)["'`]/g)) tokens.push(...lit[1].split(/\s+/));
  return tokens.filter(Boolean);
}

function wrapperModules(): string[] {
  return readdirSync(WRAPPER_DIR).filter(name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)).map(name => join(WRAPPER_DIR, name));
}

describe("app wrapper goal boundary", () => {
  it("has the goal wrapper modules this row adds", () => {
    const names = wrapperModules().map(file => relative(WRAPPER_DIR, file)).sort();
    expect(names).toEqual(["GoalErrorFallback.tsx", "GoalNotice.tsx", "goalToaster.ts", "routeSurface.ts"]);
  });

  it("no wrapper module reaches kit, ui, SystemStates or kit.css through any import", () => {
    const offenders = wrapperModules().flatMap(bannedReach);
    expect(offenders).toEqual([]);
  });

  it("no wrapper module carries a shadcn token class or a kit.css class", () => {
    const kit = kitCssClasses();
    const offenders: string[] = [];
    for (const file of wrapperModules()) {
      const source = readFileSync(file, "utf8");
      if (SHADCN.test(source)) offenders.push(`${relative(CLIENT_SRC, file)}: shadcn token`);
      for (const token of classTokens(source)) {
        const bare = token.split(":").pop() ?? token;
        if (kit.has(bare)) offenders.push(`${relative(CLIENT_SRC, file)}: kit.css .${bare}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("negative control: the walk and the scans catch today's legacy StatusBanner and ErrorScreen", () => {
    const pwaStatus = join(CLIENT_SRC, "components", "PwaStatus.tsx");
    const errorBoundary = join(CLIENT_SRC, "components", "ErrorBoundary.tsx");
    expect(bannedReach(pwaStatus).some(chain => chain.endsWith("components/app-states/SystemStates.tsx"))).toBe(true);
    expect(bannedReach(errorBoundary).some(chain => chain.endsWith("components/app-states/SystemStates.tsx"))).toBe(true);
    const legacy = readFileSync(join(CLIENT_SRC, "components", "app-states", "SystemStates.tsx"), "utf8");
    const statusBanner = legacy.slice(legacy.indexOf("export function StatusBanner"), legacy.indexOf("const CHUNK_LOAD_FAILURE"));
    const errorScreen = legacy.slice(legacy.indexOf("export function ErrorScreen"));
    expect(statusBanner).toMatch(SHADCN);
    expect(errorScreen).toMatch(SHADCN);
    const kit = kitCssClasses();
    expect(classTokens(errorScreen).some(token => kit.has(token))).toBe(true);
  });
});
