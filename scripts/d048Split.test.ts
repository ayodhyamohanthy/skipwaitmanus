// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-134: the D-048 phase 3 split lists 74 rows, and each one reaches the task
 * list through exactly one packet's pull request (or the CEO for release and
 * retirement rows). A row with no adder would never be built; a row with two
 * would be added twice and fail validateAssignments for every agent.
 */
const root = path.resolve(__dirname, "..");
const split = readFileSync(path.join(root, "docs/plans/D-048-phase-3-split.md"), "utf8");
const tasks: { id: string }[] = JSON.parse(readFileSync(path.join(root, "docs/plans/assignments.json"), "utf8")).tasks;
const existing = new Set(tasks.map(t => t.id));
const tableIds = [...split.matchAll(/^\| `(D-048-[^`]+)`/gm)].map(m => m[1]);
const listStart = split.indexOf("## Rows each packet adds");
const listEnd = split.indexOf("\n## ", listStart + 1);
const listLines = split.slice(listStart, listEnd).split("\n").filter(l => l.startsWith("- "));
const listed = listLines.flatMap(l => [...l.slice(l.indexOf(":") + 1).matchAll(/`(D-048-[^`]+)`/g)].map(m => m[1]));
const adders = listLines.map(l => /^- `([^`]+)` adds/.exec(l)?.[1]).filter((x): x is string => Boolean(x));

describe("the D-048 phase 3 split (D-134)", () => {
  it("lists 74 rows", () => {
    expect(tableIds.length).toBe(74);
    expect(new Set(tableIds).size).toBe(74);
  });

  it("gives every row exactly one adder", () => {
    const counts = new Map<string, number>();
    for (const id of listed) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect(tableIds.filter(id => counts.get(id) !== 1)).toEqual([]);
    expect(listed.filter(id => !tableIds.includes(id))).toEqual([]);
  });

  it("names only packets that are in the task list, and rows already there really are", () => {
    expect(adders.filter(a => !existing.has(a))).toEqual([]);
    const already = listLines.find(l => l.startsWith("- Already in")) ?? "";
    expect([...already.matchAll(/`(D-048-[^`]+)`/g)].map(m => m[1]).filter(id => !existing.has(id))).toEqual([]);
  });
});
