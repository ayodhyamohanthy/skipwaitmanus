// @vitest-environment node
// SYNC-clone-guard (D-373 (5), D-205): one command keeps a clone and GitHub in sync, and nothing else moves.
// The pure rules first, then the script as a process against throwaway git repositories, so every push,
// fast-forward, refusal and untouched worktree is proven without touching GitHub.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NEVER_PUSH, PRIVATE_PREFIXES, addedLines, exitCodeOf, findSensitive, planBranch, planMain } from "./syncCloneCore.mjs";

const root = path.resolve(__dirname, "..");
const SCRIPT = path.join(root, "scripts/sync-clone.mjs");
const sha = (c: string) => c.repeat(40);
const branch = (extra: Record<string, unknown> = {}) => ({
  name: "agent/queue/x", sha: sha("a"), upstream: null, upstreamGone: false, remoteSha: null, remoteIsAncestor: false, inMain: false, sensitive: [] as string[], ...extra,
});

describe("planMain", () => {
  const base = { local: sha("a"), origin: sha("b"), localIsAncestor: true, worktree: null, worktreeDirty: false };
  it("fast-forwards a main nobody has checked out with a compare-and-swap ref update", () => {
    expect(planMain(base).action).toBe("update-ref");
  });
  it("fast-forwards a checked-out main only in a clean worktree", () => {
    expect(planMain({ ...base, worktree: "/w" }).action).toBe("merge");
    expect(planMain({ ...base, worktree: "/w", worktreeDirty: true })).toMatchObject({ action: "report", reason: expect.stringContaining("uncommitted") });
  });
  it("never moves a main with commits of its own, and says where they belong", () => {
    expect(planMain({ ...base, localIsAncestor: false })).toMatchObject({ action: "report", reason: expect.stringContaining("pull request") });
  });
  it("does nothing when main is current or absent, and refuses malformed input", () => {
    expect(planMain({ ...base, local: sha("b") }).action).toBe("none");
    expect(planMain({ ...base, local: null }).action).toBe("none");
    expect(() => planMain({ ...base, origin: "main" })).toThrow(/full 40-character SHA/);
  });
});

describe("planBranch", () => {
  it("never pushes main, the report log or the landing slot", () => {
    expect(NEVER_PUSH).toEqual(["main", "agent/reports/log", "agent/queue/landing"]);
    for (const name of NEVER_PUSH) expect(planBranch(branch({ name })).action).toBe("none");
  });
  it("keeps local/, private/ and wip/ branches local", () => {
    for (const prefix of PRIVATE_PREFIXES) expect(planBranch(branch({ name: `${prefix}mine` }))).toEqual({ action: "none", reason: "kept local by its name" });
  });
  it("pushes committed work that origin lacks: a never-pushed branch and one ahead of its origin branch", () => {
    expect(planBranch(branch())).toEqual({ action: "push", reason: "never pushed" });
    expect(planBranch(branch({ upstream: "origin/agent/queue/x", remoteSha: sha("b"), remoteIsAncestor: true }))).toEqual({ action: "push", reason: "ahead of origin" });
  });
  it("reports, never forces, a branch whose origin moved or diverged", () => {
    expect(planBranch(branch({ remoteSha: sha("b"), remoteIsAncestor: false }))).toMatchObject({ action: "report", reason: expect.stringContaining("never force") });
  });
  it("does not resurrect a branch whose pull request merged and whose origin branch is gone", () => {
    expect(planBranch(branch({ upstream: "origin/agent/queue/x", upstreamGone: true }))).toMatchObject({ action: "report", reason: expect.stringContaining("deleted") });
    expect(planBranch(branch({ upstream: "origin/agent/queue/x", upstreamGone: true, inMain: true })).action).toBe("none");
  });
  it("leaves a branch alone when it tracks another branch, is in sync or is already in main", () => {
    expect(planBranch(branch({ upstream: "origin/other" }))).toMatchObject({ action: "report", reason: expect.stringContaining("origin/other") });
    expect(planBranch(branch({ remoteSha: sha("a") })).action).toBe("none");
    expect(planBranch(branch({ inMain: true })).action).toBe("none");
  });
  it("holds a never-pushed branch under --no-publish-new and any branch with a possible secret", () => {
    expect(planBranch(branch(), { publishNew: false }).action).toBe("report");
    expect(planBranch(branch({ sensitive: [".env.local (sensitive file name)"] }))).toMatchObject({ action: "report", reason: expect.stringContaining(".env.local") });
  });
});

describe("findSensitive and addedLines", () => {
  it("flags sensitive file names but not .env.example", () => {
    expect(findSensitive({ files: [".env", "deploy/.env.local", "certs/site.pem", "config/credentials.prod.json", ".claude/settings.local.json", ".env.example", "server/db.ts"], added: [] }))
      .toEqual([".env (sensitive file name)", "deploy/.env.local (sensitive file name)", "certs/site.pem (sensitive file name)", "config/credentials.prod.json (sensitive file name)", ".claude/settings.local.json (sensitive file name)"]);
  });
  it("flags a likely key in an added line and never repeats the key itself", () => {
    const token = `ghp_${"A".repeat(36)}`;
    const found = findSensitive({ files: ["server/x.ts"], added: addedLines(`diff --git a/server/x.ts b/server/x.ts\n--- a/server/x.ts\n+++ b/server/x.ts\n@@ -0,0 +1 @@\n+const t = "${token}";\n`) });
    expect(found).toEqual(["server/x.ts (GitHub token)"]);
    expect(found.join(" ")).not.toContain(token);
  });
  it("reads added lines per file and skips deleted files", () => {
    expect(addedLines("+++ b/a.ts\n+one\n-gone\n+++ /dev/null\n+orphan\n+++ b/b.ts\n+two\n")).toEqual([{ file: "a.ts", line: "one" }, { file: "b.ts", line: "two" }]);
    expect(findSensitive({ files: ["a.ts"], added: [{ file: "a.ts", line: "const ok = 1;" }] })).toEqual([]);
  });
  it("exits 1 whenever something is left for a person", () => {
    expect(exitCodeOf({ reports: [], dirty: [], failures: [] })).toBe(0);
    expect(exitCodeOf({ reports: ["x"], dirty: [], failures: [] })).toBe(1);
    expect(exitCodeOf({ reports: [], dirty: [], failures: ["x"] })).toBe(1);
  });
});

const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", env: ENV }).trim();
const commit = (cwd: string, file: string, text: string) => { writeFileSync(path.join(cwd, file), text); git(cwd, "add", file); git(cwd, "commit", "-q", "-m", file); return git(cwd, "rev-parse", "HEAD"); };
const remoteTip = (origin: string, name: string) => { try { return execFileSync("git", ["rev-parse", "--verify", "-q", `refs/heads/${name}`], { cwd: origin, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
const run = (cwd: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", env: ENV });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

/** origin (bare), a second clone that moves origin, and the clone under test with one case per branch. */
function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sync-clone-"));
  const origin = path.join(dir, "origin.git");
  const other = path.join(dir, "other");
  const clone = path.join(dir, "clone");
  git(dir, "init", "-q", "--bare", "-b", "main", origin);
  git(dir, "clone", "-q", origin, other);
  commit(other, "a.txt", "1\n");
  git(other, "push", "-q", "origin", "HEAD:main");
  // Pushed before the clone exists: a branch that will merge, one that will be ahead, one that will diverge.
  for (const name of ["agent/queue/merged", "agent/queue/ahead", "agent/queue/diverged"]) git(other, "push", "-q", "origin", `main:refs/heads/${name}`);
  git(dir, "clone", "-q", origin, clone);
  for (const name of ["agent/queue/merged", "agent/queue/ahead", "agent/queue/diverged"]) git(clone, "branch", "-q", "--track", name, `origin/${name}`);
  // The clone's own work: one never-pushed branch, one ahead of origin, one diverged, one private, one with a secret file.
  git(clone, "checkout", "-q", "-b", "agent/queue/new-work"); commit(clone, "new.txt", "new\n");
  git(clone, "checkout", "-q", "agent/queue/ahead"); commit(clone, "ahead.txt", "ahead\n");
  git(clone, "checkout", "-q", "agent/queue/diverged"); commit(clone, "mine.txt", "mine\n");
  git(clone, "checkout", "-q", "-b", "wip/mine", "main"); commit(clone, "wip.txt", "wip\n");
  git(clone, "checkout", "-q", "-b", "agent/queue/secret", "main"); commit(clone, ".env.local", "TOKEN=x\n");
  git(clone, "checkout", "-q", "main");
  // A worktree with uncommitted work the run must not touch.
  const tree = path.join(dir, "tree");
  git(clone, "worktree", "add", "-q", "-b", "agent/queue/dirty", tree, "main");
  writeFileSync(path.join(tree, "draft.txt"), "unsaved\n");
  // Meanwhile origin moves: main gains a commit (and takes agent/queue/merged), diverged gains another commit.
  git(other, "fetch", "-q", "origin");
  git(other, "checkout", "-q", "-B", "agent/queue/diverged", "origin/agent/queue/diverged"); commit(other, "theirs.txt", "theirs\n"); git(other, "push", "-q", "origin", "agent/queue/diverged");
  git(other, "checkout", "-q", "main"); commit(other, "b.txt", "2\n"); git(other, "push", "-q", "origin", "main");
  git(other, "push", "-q", "origin", "--delete", "agent/queue/merged");
  return { dir, origin, clone, tree };
}

describe("sync-clone.mjs as a process", () => {
  it("--dry-run changes nothing on origin or in the clone", () => {
    const f = fixture();
    const heads = git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)");
    const localMain = git(f.clone, "rev-parse", "main");
    const { code, out } = run(f.clone, "--dry-run");
    expect(code).toBe(1);
    expect(out).toContain("would push agent/queue/new-work (never pushed)");
    expect(out).toContain("main: would fast-forward");
    expect(git(f.origin, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(heads);
    expect(git(f.clone, "rev-parse", "main")).toBe(localMain);
  }, 60_000);

  it("pushes committed work to its own branch, fast-forwards main, deletes merged branches and leaves the rest for a person", () => {
    const f = fixture();
    const theirs = remoteTip(f.origin, "agent/queue/diverged");
    const { code, out } = run(f.clone);
    // Offline to online: the never-pushed branch and the branch ahead of origin are on origin now, at the clone's tips.
    expect(remoteTip(f.origin, "agent/queue/new-work")).toBe(git(f.clone, "rev-parse", "agent/queue/new-work"));
    expect(remoteTip(f.origin, "agent/queue/ahead")).toBe(git(f.clone, "rev-parse", "agent/queue/ahead"));
    expect(out).toContain("pushed agent/queue/new-work (never pushed)");
    expect(out).toContain("pushed agent/queue/ahead (ahead of origin)");
    // Never forced, never private, never a likely secret, never main.
    expect(remoteTip(f.origin, "agent/queue/diverged")).toBe(theirs);
    expect(out).toMatch(/left for you: agent\/queue\/diverged: origin has commits this branch lacks/);
    expect(remoteTip(f.origin, "wip/mine")).toBeNull();
    expect(remoteTip(f.origin, "agent/queue/secret")).toBeNull();
    expect(out).toContain("agent/queue/secret: not pushed, possible secret: .env.local (sensitive file name)");
    expect(out).not.toContain("TOKEN=x");
    // Online to offline: main fast-forwarded in its clean worktree; the merged branch whose origin branch is gone is deleted.
    expect(git(f.clone, "rev-parse", "main")).toBe(git(f.origin, "rev-parse", "refs/heads/main"));
    expect(git(f.clone, "branch", "--list", "agent/queue/merged")).toBe("");
    expect(out).toMatch(/cleanup: deleted 1 of 1 merged local branches/);
    // Uncommitted work is reported and byte-identical afterwards.
    expect(out).toMatch(/left for you: uncommitted: .*tree \(agent\/queue\/dirty\): 1 file\(s\), left untouched/);
    expect(readFileSync(path.join(f.tree, "draft.txt"), "utf8")).toBe("unsaved\n");
    expect(code).toBe(1);
    expect(out).toContain("not fully in sync");
  }, 60_000);

  it("never pushes a local main with commits of its own", () => {
    const f = fixture();
    const originMain = git(f.origin, "rev-parse", "refs/heads/main");
    commit(f.clone, "local-only.txt", "x\n");
    const { out } = run(f.clone);
    expect(git(f.origin, "rev-parse", "refs/heads/main")).toBe(originMain);
    expect(out).toContain("left for you: main: local main has commits that are not on origin/main");
  }, 60_000);

  it("refuses unknown arguments and runs only inside a git clone", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "sync-clone-none-"));
    expect(run(dir).code).toBe(2);
    expect(run(dir).out).toContain("run this inside a git clone");
    expect(run(dir, "--force").out).toContain("unknown argument --force");
  });
});
