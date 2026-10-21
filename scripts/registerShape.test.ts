// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The decision register is the team's single source of truth. Twice on Oct 21
 * new rows were appended at the end of the file, under "## Superseded", where
 * they did not render as a table and read as superseded; once two decisions
 * shared one ID. Every decision row lives in the active table, once, in ID
 * order (D-127 sync).
 */
const text = readFileSync(path.resolve(__dirname, "../docs/DECISIONS.md"), "utf8");
const lines = text.split("\n");
const rowId = (line: string) => Number(/^\| D-(\d+) \|/.exec(line)?.[1] ?? NaN);
const activeStart = lines.findIndex(l => l.trim() === "## Active decisions");
const activeEnd = lines.findIndex((l, i) => i > activeStart && l.startsWith("## "));
const rows = lines.map((l, i) => ({ i, id: rowId(l) })).filter(r => !Number.isNaN(r.id));

describe("the decision register's shape", () => {
  it("has an active table followed by another section", () => {
    expect(activeStart).toBeGreaterThanOrEqual(0);
    expect(activeEnd).toBeGreaterThan(activeStart);
  });

  it("keeps every decision row inside the active table", () => {
    const outside = rows.filter(r => r.i < activeStart || r.i > activeEnd).map(r => `D-${r.id}`);
    expect(outside).toEqual([]);
  });

  it("never gives two decisions the same ID", () => {
    const ids = rows.map(r => r.id);
    expect(ids.filter((id, k) => ids.indexOf(id) !== k).map(id => `D-${id}`)).toEqual([]);
  });

  it("lists the decisions in ID order", () => {
    const ids = rows.map(r => r.id);
    const firstOutOfOrder = ids.findIndex((id, k) => k > 0 && id < ids[k - 1]);
    expect(firstOutOfOrder === -1 ? null : `D-${ids[firstOutOfOrder]} after D-${ids[firstOutOfOrder - 1]}`).toBeNull();
  });
});
