// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-167 §6.3 (docs/plans/GOAL_UI_COVERAGE.md): the coverage catalogue owns a
 * line for every route and every component, so nothing ships without a goal
 * redesign row. This test reads the routes in client/src/App.tsx and the
 * route table in §2 of the catalogue and fails when:
 *   - a route has no line in the table;
 *   - a line names a row that is neither in docs/plans/assignments.json nor
 *     in the split's row table (docs/plans/D-048-phase-3-split.md);
 *   - a .tsx under client/src/components/ (goal and ui excluded) appears in
 *     neither §3, §4 nor §5.
 * It prints, without failing, how many pages still import components/kit/*.
 * A PR that adds a route or a component adds its catalogue line in the same
 * PR, and this file becomes one of that PR's owned paths (D-167 §6.3).
 */
const root = path.resolve(__dirname, "..");
const coverage = readFileSync(path.join(root, "docs/plans/GOAL_UI_COVERAGE.md"), "utf8");

function catalogueSection(heading: string): string {
  const start = coverage.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`GOAL_UI_COVERAGE.md is missing its "## ${heading}" section`);
  const end = coverage.indexOf("\n## ", start + 1);
  return end === -1 ? coverage.slice(start) : coverage.slice(start, end);
}

const backtickedTsx = (text: string): string[] =>
  [...text.matchAll(/`([^`]+\.tsx)`/g)].map(m => m[1]);

// §2: every route and its owning row. Table lines start with "| `/"; the
// route is the first backticked cell and every backticked D- id on the line
// is a row the line names (the state column repeats ids without backticks).
const routeSection = catalogueSection("2. Every route and its owning row");
const routeLines = routeSection.split("\n").filter(l => l.startsWith("| `/"));
const tableRoutes = new Map<string, string[]>();
for (const line of routeLines) {
  const route = /^\| `(\/[^`]*)`/.exec(line)?.[1];
  if (!route) throw new Error(`GOAL_UI_COVERAGE.md §2: unparseable table line: ${line}`);
  tableRoutes.set(route, [...line.matchAll(/`(D-[^`]+)`/g)].map(m => m[1]));
}

// The rows a §2 line may name: the task list, plus the split's row table for
// the rows still waiting on their lane packet ("to be added by its lane
// packet", D-134).
const taskIds: string[] = JSON.parse(readFileSync(path.join(root, "docs/plans/assignments.json"), "utf8")).tasks.map((t: { id: string }) => t.id);
const split = readFileSync(path.join(root, "docs/plans/D-048-phase-3-split.md"), "utf8");
const splitIds = [...split.matchAll(/^\| `(D-[^`]+)`/gm)].map(m => m[1]);
const knownRows = new Set([...taskIds, ...splitIds]);

// §3/§4/§5: the catalogue's component lists. §3 names shared components in
// the first table cell; §4 lists single-page components after the owning
// page's colon; §5 names the components nothing imports (retire, do not
// redesign). Entries are bare names or paths relative to
// client/src/components/, and no two components share a basename, so a file
// matches on its path or its basename.
const sharedSection = catalogueSection("3. Shared components");
const sharedComponents = sharedSection.split("\n")
  .filter(l => l.startsWith("| `"))
  .flatMap(l => backtickedTsx(l.slice(0, l.indexOf("|", 1))));
const singlePageSection = catalogueSection("4. Single-page components");
const singlePageComponents = singlePageSection.split("\n")
  .filter(l => l.startsWith("- `"))
  .flatMap(l => backtickedTsx(l.slice(l.indexOf(":"))));
const retireSection = catalogueSection("5. Components nothing imports");
const listedComponents = new Set([...sharedComponents, ...singlePageComponents, ...backtickedTsx(retireSection)]);
const listedBasenames = new Set([...listedComponents].map(c => path.posix.basename(c)));

function tsxFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFilesUnder(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const componentsRoot = path.join(root, "client/src/components");
const components = tsxFilesUnder(componentsRoot)
  .map(f => path.relative(componentsRoot, f).split(path.sep).join("/"))
  .filter(rel => !rel.startsWith("goal/") && !rel.startsWith("ui/") && !rel.endsWith(".test.tsx"))
  .sort();

// Informational only (D-167 §6.3): the kit-based client-page scope that is
// left. Pages, not components: the page rows replace their own kit imports.
const pagesRoot = path.join(root, "client/src/pages");
const kitPages = tsxFilesUnder(pagesRoot)
  .filter(f => !f.endsWith(".test.tsx"))
  .filter(f => /components\/kit\//.test(readFileSync(f, "utf8")))
  .map(f => path.relative(root, f).split(path.sep).join("/"))
  .sort();

const appSource = readFileSync(path.join(root, "client/src/App.tsx"), "utf8");
const appRoutes = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1]);

describe("goal UI coverage (D-167 §6.3)", () => {
  it("prints, without failing, how many pages still import components/kit/*", () => {
    console.log(`goal UI coverage: ${kitPages.length} pages still import components/kit/*`);
    for (const page of kitPages) console.log(`  kit import: ${page}`);
    expect(kitPages.length).toBeGreaterThanOrEqual(0);
  });

  it("gives every route in client/src/App.tsx a line in the §2 table", () => {
    expect(appRoutes.length).toBeGreaterThan(0);
    expect(appRoutes.filter(r => !tableRoutes.has(r))).toEqual([]);
  });

  it("names only rows that exist in assignments.json or the split's table", () => {
    const unknown = [...tableRoutes.entries()].flatMap(([route, rows]) =>
      rows.filter(r => !knownRows.has(r)).map(r => `${route} -> ${r}`));
    expect(unknown).toEqual([]);
  });

  it("gives every component under client/src/components/ (goal and ui excluded) a line in §3, §4 or §5", () => {
    expect(components.length).toBeGreaterThan(0);
    expect(components.filter(rel => !listedComponents.has(rel) && !listedBasenames.has(path.posix.basename(rel)))).toEqual([]);
  });
});
