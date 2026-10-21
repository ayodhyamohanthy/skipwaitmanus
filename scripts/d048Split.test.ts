// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-134: the D-048 phase 3 split lists 75 rows, and each one reaches the task
 * list through exactly one packet's pull request (or the CEO for release and
 * retirement rows). A row with no adder would never be built; a row with two
 * would be added twice and fail validateAssignments for every agent.
 */
const root = path.resolve(__dirname, "..");
const split = readFileSync(path.join(root, "docs/plans/D-048-phase-3-split.md"), "utf8");
const tasks: { id: string; lane: string; tier: number; dependsOn: string[] }[] = JSON.parse(readFileSync(path.join(root, "docs/plans/assignments.json"), "utf8")).tasks;
const existing = new Set(tasks.map(t => t.id));
const tableIds = [...split.matchAll(/^\| `(D-048-[^`]+)`/gm)].map(m => m[1]);
const listStart = split.indexOf("## Rows each packet adds");
const listEnd = split.indexOf("\n## ", listStart + 1);
const listLines = split.slice(listStart, listEnd).split("\n").filter(l => l.startsWith("- "));
const listed = listLines.flatMap(l => [...l.slice(l.indexOf(":") + 1).matchAll(/`(D-048-[^`]+)`/g)].map(m => m[1]));
const adders = listLines.map(l => /^- `([^`]+)` adds/.exec(l)?.[1]).filter((x): x is string => Boolean(x));

describe("the D-048 phase 3 split (D-134)", () => {
  it("lists 75 rows", () => {
    expect(tableIds.length).toBe(75);
    expect(new Set(tableIds).size).toBe(75);
  });

  it("gives every row exactly one adder", () => {
    const counts = new Map<string, number>();
    for (const id of listed) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect(tableIds.filter(id => counts.get(id) !== 1)).toEqual([]);
    expect(listed.filter(id => !tableIds.includes(id))).toEqual([]);
  });

  it("lists the rows already in the task list with the lane, tier and dependencies the task list has", () => {
    const already = (listLines.find(l => l.startsWith("- Already in")) ?? "").matchAll(/`(D-048-[^`]+)`/g);
    const rowOf = (id: string) => split.split("\n").find(l => l.startsWith(`| \`${id}\``))?.split(" | ") ?? [];
    const mismatches = [...already].map(m => m[1]).flatMap(id => {
      const cells = rowOf(id), t = tasks.find(x => x.id === id);
      if (!t || cells.length < 5) return [`${id}: missing`];
      const lane = cells[2].replace(/`/g, "").trim(), tier = Number(cells[4].trim());
      const deps = cells[3].trim() === "—" ? [] : cells[3].split(",").map(d => d.trim());
      const out: string[] = [];
      if (lane !== t.lane) out.push(`${id}: lane ${lane} vs ${t.lane}`);
      if (tier !== t.tier) out.push(`${id}: tier ${tier} vs ${t.tier}`);
      if ([...deps].sort().join() !== [...t.dependsOn].sort().join()) out.push(`${id}: depends on ${deps.join(",")} vs ${t.dependsOn.join(",")}`);
      return out;
    });
    expect(mismatches).toEqual([]);
  });

  it("names only packets that are in the task list, and rows already there really are", () => {
    expect(adders.filter(a => !existing.has(a))).toEqual([]);
    const already = listLines.find(l => l.startsWith("- Already in")) ?? "";
    expect([...already.matchAll(/`(D-048-[^`]+)`/g)].map(m => m[1]).filter(id => !existing.has(id))).toEqual([]);
  });
});
