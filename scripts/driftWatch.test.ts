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

describe("drift watch tolerates reverse-direction landings (#687)", () => {
  // A landing that fast-forwards a branch onto main puts the branch's catch-up
  // merges on main's first-parent chain. Those merges' first-parent diffs touch
  // watched paths (the branch catching up to main), so the expected-sha lookup
  // resolves to a commit that was never deployed even though main's tree content
  // over the runtime paths equals the deployed commit. The workflow must treat
  // content equivalence as converged instead of flagging drift forever.
  function repoWithReverseLanding() {
    const dir = mkdtempSync(join(tmpdir(), "drift-watch-rev-"));
    dirs.push(dir);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "test");
    mkdirSync(join(dir, "server"));
    writeFileSync(join(dir, "server", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(dir, "package.json"), "{\"name\":\"x\",\"version\":\"1\"}\n");
    git("add", ".");
    git("commit", "-qm", "old base");
    const stale = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "package.json"), "{\"name\":\"x\",\"version\":\"2\"}\n");
    git("commit", "-qam", "dep bump on main (gets deployed)");
    const live = git("rev-parse", "HEAD");
    git("checkout", "-qb", "feature", stale);
    mkdirSync(join(dir, "client"));
    writeFileSync(join(dir, "client", "c.ts"), "export const c = 1;\n");
    git("add", ".");
    git("commit", "-qm", "client work on stale branch");
    git("merge", "-q", "--no-ff", "-m", "Merge origin/main into feature", "main");
    const catchUp = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "client", "c.ts"), "export const c = 2;\n");
    git("commit", "-qam", "more client work");
    git("checkout", "-q", "main");
    git("merge", "-q", "--ff-only", "feature");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    return { dir, live, catchUp };
  }

  it("keeps a content-equivalence fallback in the workflow", () => {
    expect(workflow).toContain("git diff --quiet");
    expect(workflow).toContain("content-equivalent");
  });

  it("resolves converged when the live sha matches main over runtime paths despite a stale expected sha", () => {
    const { dir, live, catchUp } = repoWithReverseLanding();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    const paths = /PATHS="([^"]+)"/.exec(workflow)?.[1] ?? "";
    expect(paths).toContain("package.json");
    const expected = git("log", "-1", "--first-parent", "--format=%H", "origin/main", "--", ...paths.split(" "));
    // The stale-shape lookup points at the branch catch-up merge, not the live commit...
    expect(expected).toBe(catchUp);
    expect(expected).not.toBe(live);
    // ...but content over the runtime paths is identical, so no drift may be flagged.
    git("diff", "--quiet", live, "origin/main", "--", ...paths.split(" "));
  });
});

describe("drift watch content fallback fails closed (#687)", () => {
  it("requires the live sha from the health endpoint, rejects null/empty, and requires the commit locally", () => {
    expect(workflow).toContain('https://skipwait.me/api/health/ready');
    expect(workflow).toContain('"$live_sha" != "null"');
    expect(workflow).toContain('git cat-file -e "$live_sha^{commit}"');
  });

  it("treats only an empty diff as converged: diff findings or errors exit non-zero and flag drift", () => {
    expect(workflow).toMatch(/git diff --quiet "\$live_sha" origin\/main -- \$PATHS/);
    // --quiet semantics: 0 = no diff (converged), 1 = differences, >1 = error;
    // the workflow accepts equivalence only inside the && chain, so any
    // non-zero exit (including object errors) falls through to drifted=true.
    expect(workflow).toContain('echo "drifted=true" >> "$GITHUB_OUTPUT"');
  });
});
