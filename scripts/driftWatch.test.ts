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


describe("source-only historical import retirement", () => {
  it("excludes only the exact retired import from expected runtime selection", () => {
    expect(expectedLine).toContain(":!drizzle/deploy/0063_clerk_roster_import.sql");
    expect(expectedLine.match(/:![^ ]+/g)).toEqual([":!drizzle/deploy/0063_clerk_roster_import.sql"]);
  });
  it("keeps the prior runtime target after a cleanup-only merge", () => {
    const {dir, merge} = repoWithMergedRuntimeChange();
    const git=(...args: string[])=>execFileSync("git",args,{cwd:dir,encoding:"utf8"}).trim();
    mkdirSync(join(dir,"drizzle/deploy"),{recursive:true});
    writeFileSync(join(dir,"drizzle/deploy/0063_clerk_roster_import.sql"),"-- synthetic fixture only\n");
    git("add",".");git("commit","-qm","fixture seed");
    // Adding this exact retired path is excluded too: all earlier rows below
    // must still produce the genuine runtime merge, not the seed or deletion.
    git("checkout","-qb","cleanup");
    rmSync(join(dir,"drizzle/deploy/0063_clerk_roster_import.sql"));
    git("add","-A");git("commit","-qm","delete synthetic import");
    git("checkout","-q","main");git("merge","--no-ff","-qm","merge cleanup","cleanup");
    git("update-ref","refs/remotes/origin/main","HEAD");
    const actual=execFileSync("git",expectedLine.split(/\s+/).slice(1),{cwd:dir,encoding:"utf8"}).trim();
    expect(actual).toBe(merge);
  });
});
