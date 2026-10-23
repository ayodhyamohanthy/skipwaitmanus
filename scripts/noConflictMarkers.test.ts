import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { conflictMarkersIn, conflictMarkersInFile } from "./conflictMarkers";

// A commit that lands unresolved-merge markers once broke the registry gate
// with a misleading "no tests" run (PR #608 incident, Oct 24). The repo must
// fail closed: any tracked text file carrying markers fails CI outright.
describe("no tracked file carries unresolved-merge markers", () => {
  it("the scanner catches a genuine unresolved-merge fixture", () => {
    const fixture = ["a", "<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> origin/main", "b"].join("\n");
    expect(conflictMarkersIn(fixture)).toEqual([2, 4, 6]);
  });

  it("ordinary content (markdown rules, arrows) is not flagged", () => {
    expect(conflictMarkersIn(["# title", "======= not at line start after open? no open above", "a -> b"].join("\n"))).toEqual([]);
  });

  it("every tracked text file is marker-free", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split("\n")
      .filter(name => /\.(ts|tsx|js|jsx|json|md|mdx|yml|yaml|css|html|txt|sql)$/.test(name));
    expect(files.length).toBeGreaterThan(100); // fail closed on an empty/mis-scoped scan
    const offenders = files.flatMap(name => {
      try {
        const lines = conflictMarkersInFile(name);
        return lines.length ? [`${name}:${lines.join(",")}`] : [];
      } catch {
        return [`${name}: unreadable`];
      }
    });
    expect(offenders).toEqual([]);
  });
});
