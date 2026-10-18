import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const CLIENT = path.join(ROOT, "client/src");

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");

/** Moved surfaces (DESIGN.md "Rollout") may import the goal primitives; nothing else may, so no live Kit v4
 * surface mixes systems by accident. Each phase-3 move adds its folder here. */
const GOAL_IMPORT_ALLOWLIST = [/^client\/src\/components\/goal\//, /^client\/src\/pages\/goal\//, /^client\/src\/components\/AppShell\.tsx$/, /^client\/src\/pages\/ComponentShowcase\.tsx$/, /\.test\.tsx?$/];

/** Comp review fixtures (design/goal-ui/content.json) that must never ship (DESIGN.md rule 9). */
function compSampleNames(): string[] {
  const content = JSON.parse(fs.readFileSync(path.join(ROOT, "design/goal-ui/content.json"), "utf8"));
  const names = new Set<string>();
  for (const company of content.screenA.companies) names.add(company.name);
  for (const ask of content.screenC.asks) {
    names.add(ask.company);
    if (ask.ref) names.add(ask.ref);
  }
  for (const row of content.screenB.rows) if (row.ref) names.add(row.ref);
  names.add(content.screenB.detail.ref);
  names.add(content.screenA.askDrawer.resume.fileName);
  return [...names];
}

describe("goal UI boundary", () => {
  it("only moved surfaces import the goal primitives", () => {
    const offenders = files(CLIENT)
      .map(rel)
      .filter(file => !GOAL_IMPORT_ALLOWLIST.some(pattern => pattern.test(file)))
      .filter(file => /from\s+["']@\/components\/goal(?:\/[^"']*)?["']/.test(fs.readFileSync(path.join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("keeps the comps' sample names, refs and file names out of the product", () => {
    const names = compSampleNames();
    expect(names.length).toBeGreaterThan(10);
    const hits = files(CLIENT)
      .filter(file => !/\.test\.tsx?$/.test(file))
      .flatMap(file => {
        const source = fs.readFileSync(file, "utf8");
        return names.filter(name => source.includes(name)).map(name => `${rel(file)}: ${name}`);
      });
    expect(hits).toEqual([]);
  });

  it("appends the goal tokens once, after the Kit v4 rules", () => {
    const css = fs.readFileSync(path.join(CLIENT, "index.css"), "utf8");
    const marker = "===== D-048 phase 2 · goal-UI tokens";
    expect(css.split(marker)).toHaveLength(2);
    expect(css.indexOf(marker)).toBeGreaterThan(css.indexOf(".app-footer a{max-width:none;white-space:nowrap;}"));
  });

  it("keeps the trust colour inside the verified mark", () => {
    const offenders = files(CLIENT)
      .map(rel)
      .filter(file => !/\.test\.tsx?$/.test(file) && file !== "client/src/components/goal/GoalVerifiedMark.tsx")
      .filter(file => /\bg-trust\b|--g-trust/.test(fs.readFileSync(path.join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
