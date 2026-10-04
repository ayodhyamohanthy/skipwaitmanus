import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repoRoot = new URL("..", import.meta.url).pathname;

const SCAN_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss",
  ".html", ".sql", ".yml", ".yaml", ".sh", ".prisma",
]);

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .filter((p) => {
      const dot = p.lastIndexOf(".");
      return dot > 0 && SCAN_EXTENSIONS.has(p.slice(dot));
    });
}

function conflictHits(content: string): number[] {
  const hits: number[] = [];
  content.split("\n").forEach((line, i) => {
    if (/^<{7}( |$)/.test(line) || /^>{7}( |$)/.test(line)) hits.push(i + 1);
  });
  return hits;
}

describe("repo conflict markers", () => {
  it("finds no unresolved conflict markers in any tracked code file", () => {
    const offenders: string[] = [];
    for (const path of trackedFiles()) {
      const content = readFileSync(`${repoRoot}${path}`, "utf8");
      const lines = conflictHits(content);
      if (lines.length > 0) offenders.push(`${path}:${lines.join(",")}`);
    }
    expect(offenders, `unresolved conflict markers in: ${offenders.join(", ")}`).toEqual([]);
  });
});
