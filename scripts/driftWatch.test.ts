// Drift watch (#475): the expected release is the merge commit main deploys, never the PR commit inside it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const workflow = readFileSync(join(__dirname, "..", ".github/workflows/drift-watch.yml"), "utf8");
const expectedLine = /expected=\$\((git log [^)]*)\)/.exec(workflow)?.[1] ?? "";
const dirs: string[] = [];
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })));

function repoWithMergedRuntimeChange() {
  const dir = mkdtempSync(join(tmpdir(), "drift-watch-"));
  dirs.push(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  mkdirSync(join(dir, "server"));
  writeFileSync(join(dir, "server", "a.ts"), "export const a = 1;\n");
  git("add", ".");
  git("commit", "-qm", "base");
  git("checkout", "-qb", "feature");
  writeFileSync(join(dir, "server", "a.ts"), "export const a = 2;\n");
  git("commit", "-qam", "runtime change on the PR branch");
  const inner = git("rev-parse", "HEAD");
  git("checkout", "-q", "main");
  writeFileSync(join(dir, "README.md"), "docs\n");
  git("add", ".");
  git("commit", "-qm", "docs on main meanwhile");
  git("merge", "-q", "--no-ff", "-m", "Merge the PR", "feature");
  const merge = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", merge);
  return { dir, inner, merge };
}

describe("drift watch expects the commit main actually deploys", () => {
  it("reads the expected release along main's first-parent chain", () => {
    expect(expectedLine).toContain("--first-parent");
  });

  it("picks the merge commit of a merged runtime change, not the PR commit inside it", () => {
    const { dir, inner, merge } = repoWithMergedRuntimeChange();
    const args = expectedLine.split(/\s+/).slice(1);
    const expected = execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    expect(expected).toBe(merge);
    expect(expected).not.toBe(inner);
  });
});
