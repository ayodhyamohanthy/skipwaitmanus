// SYNC-tidy (owner, Nov 27 2026): only leftovers that hold nothing unsaved are removed, and only with --apply.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NEVER_DELETE, PRIVATE_PREFIXES, idleHoursOf, parseIdleHours, parseWorktrees, planLocalBranch, planWorktree } from "./syncTidyCore.mjs";

const SCRIPT = path.resolve(__dirname, "sync-tidy.mjs");
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", env: ENV }).trim();
const commit = (cwd: string, file: string, text: string) => { writeFileSync(path.join(cwd, file), text); git(cwd, "add", file); git(cwd, "commit", "-q", "-m", file); return git(cwd, "rev-parse", "HEAD"); };
const run = (cwd: string, ...args: string[]) => { const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", env: ENV }); return { code: r.status, out: `${r.stdout}${r.stderr}` }; };

const tree = (extra: Record<string, unknown> = {}) => ({ path: "/w", branch: "agent/queue/x", isMain: false, isCurrent: false, locked: false, files: 0, unpushed: 0, idleHours: 48, ...extra });

describe("planWorktree", () => {
  it("removes a clean, pushed, idle worktree", () => {
    expect(planWorktree(tree())).toMatchObject({ action: "remove", reason: expect.stringContaining("everything on GitHub") });
  });
  it("keeps the main folder, the current folder, a locked one and one whose status is unreadable", () => {
    expect(planWorktree(tree({ isMain: true })).action).toBe("keep");
    expect(planWorktree(tree({ isCurrent: true })).action).toBe("keep");
    expect(planWorktree(tree({ locked: true })).reason).toContain("locked");
    expect(planWorktree(tree({ files: null })).reason).toContain("could not be read");
  });
  it("keeps unsaved work, and marks it abandoned after 7 idle days without ever removing it", () => {
    expect(planWorktree(tree({ files: 3, idleHours: 30 }))).toMatchObject({ action: "keep", abandoned: false });
    const old = planWorktree(tree({ files: 3, idleHours: 24 * 8 }));
    expect(old).toMatchObject({ action: "keep", abandoned: true, reason: expect.stringContaining("looks abandoned") });
  });
  it("keeps commits GitHub lacks, unknown push state and anything used recently", () => {
    expect(planWorktree(tree({ unpushed: 2 })).reason).toContain("2 commit(s) not on GitHub");
    expect(planWorktree(tree({ unpushed: null })).action).toBe("keep");
    expect(planWorktree(tree({ idleHours: 5 })).reason).toContain("used in the last 24 h");
    expect(planWorktree(tree({ idleHours: 5 }), { minIdleHours: 4 }).action).toBe("remove");
  });
});

describe("planLocalBranch", () => {
  const b = (extra: Record<string, unknown> = {}) => ({ name: "agent/queue/x", checkedOut: false, unpushed: 0, idleHours: 48, ...extra });
  it("deletes a pushed, idle branch nobody has checked out", () => {
    expect(planLocalBranch(b()).action).toBe("delete");
  });
  it("never deletes main, the picker's branches or private ones", () => {
    for (const name of NEVER_DELETE) expect(planLocalBranch(b({ name })).action).toBe("keep");
    for (const prefix of PRIVATE_PREFIXES) expect(planLocalBranch(b({ name: `${prefix}x` })).action).toBe("keep");
  });
  it("keeps a checked-out, unpushed, unknown or recent branch", () => {
    expect(planLocalBranch(b({ checkedOut: true })).action).toBe("keep");
    expect(planLocalBranch(b({ unpushed: 1 })).reason).toContain("not on GitHub");
    expect(planLocalBranch(b({ unpushed: null })).action).toBe("keep");
    expect(planLocalBranch(b({ idleHours: 1 })).action).toBe("keep");
  });
});

describe("parsing", () => {
  it("reads git worktree list --porcelain, including locked, prunable and detached entries", () => {
    const sha = "a".repeat(40);
    const text = `worktree /c\nHEAD ${sha}\nbranch refs/heads/main\n\nworktree /w1\nHEAD ${sha}\ndetached\nlocked reason\n\nworktree /w2\nHEAD ${sha}\nbranch refs/heads/agent/queue/x\nprunable gitdir file points to non-existent location\n`;
    expect(parseWorktrees(text)).toEqual([
      { path: "/c", head: sha, branch: "main", locked: false, prunable: false, bare: false },
      { path: "/w1", head: sha, branch: null, locked: true, prunable: false, bare: false },
      { path: "/w2", head: sha, branch: "agent/queue/x", locked: false, prunable: true, bare: false },
    ]);
  });
  it("counts idle time from the newest stamp, and treats no stamp as just used", () => {
    expect(idleHoursOf([0, 3_600_000 * 10], 3_600_000 * 12)).toBe(2);
    expect(idleHoursOf([NaN], 1e12)).toBe(0);
    expect(parseIdleHours("48")).toBe(48);
    expect(() => parseIdleHours("0")).toThrow();
    expect(() => parseIdleHours("abc")).toThrow();
  });
});

/** Ages every reflog and HEAD file under a git dir by two hours, so --idle-hours 1 treats it as idle. */
function age(dir: string) {
  const old = new Date(Date.now() - 2 * 3_600_000);
  const walk = (d: string) => { for (const name of readdirSync(d)) { const p = path.join(d, name); if (statSync(p).isDirectory()) walk(p); else utimesSync(p, old, old); } };
  for (const p of [path.join(dir, "HEAD")]) if (existsSync(p)) utimesSync(p, old, old);
  if (existsSync(path.join(dir, "logs"))) walk(path.join(dir, "logs"));
  if (existsSync(path.join(dir, "worktrees"))) for (const w of readdirSync(path.join(dir, "worktrees"))) age(path.join(dir, "worktrees", w));
}

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sync-tidy-"));
  const origin = path.join(dir, "origin.git"), clone = path.join(dir, "clone");
  git(dir, "init", "-q", "--bare", "-b", "main", origin);
  git(dir, "clone", "-q", origin, clone);
  commit(clone, "a.txt", "1\n");
  git(clone, "push", "-q", "origin", "HEAD:main");
  const wt = (name: string, branch: string | null) => {
    const p = path.join(dir, name);
    if (branch) git(clone, "worktree", "add", "-q", "-b", branch, p, "main"); else git(clone, "worktree", "add", "-q", "--detach", p, "main");
    return p;
  };
  const clean = wt("clean", "agent/queue/clean");
  const detached = wt("detached", null);
  const dirty = wt("dirty", "agent/queue/dirty"); writeFileSync(path.join(dirty, "a.txt"), "changed\n");
  const untracked = wt("untracked", "agent/queue/untracked"); writeFileSync(path.join(untracked, "new.txt"), "x\n");
  const unpushed = wt("unpushed", "agent/queue/unpushed"); commit(unpushed, "u.txt", "u\n");
  const locked = wt("locked", "agent/queue/locked"); git(clone, "worktree", "lock", locked);
  git(clone, "branch", "-q", "agent/queue/pushed-branch", "main");
  git(clone, "checkout", "-q", "-b", "agent/queue/local-only"); commit(clone, "l.txt", "l\n"); git(clone, "checkout", "-q", "main");
  age(path.join(clone, ".git"));
  return { dir, clone, clean, detached, dirty, untracked, unpushed, locked };
}

describe("sync-tidy.mjs as a process", () => {
  it("lists without changing anything, then --apply removes exactly the safe ones and keeps the rest with reasons", () => {
    const f = fixture();
    const dry = run(f.clone, "--idle-hours", "1");
    expect(dry.code).toBe(0);
    expect(dry.out).toContain(`would remove worktree ${f.clean} (agent/queue/clean)`);
    expect(dry.out).toContain(`would remove worktree ${f.detached}`);
    expect(dry.out).toContain("would delete branch agent/queue/pushed-branch");
    expect(dry.out).toContain("would delete branch agent/queue/clean");
    expect(dry.out).toMatch(/keep worktree .*dirty \(agent\/queue\/dirty\): 1 unsaved file/);
    expect(dry.out).toMatch(/keep worktree .*untracked \(agent\/queue\/untracked\): 1 unsaved file/);
    expect(dry.out).toMatch(/keep worktree .*unpushed \(agent\/queue\/unpushed\): 1 commit\(s\) not on GitHub/);
    expect(dry.out).toMatch(/keep worktree .*locked \(agent\/queue\/locked\): locked/);
    expect(dry.out).toContain("keep branch agent/queue/local-only: 1 commit(s) not on GitHub");
    expect(dry.out).toContain("node scripts/sync-tidy.mjs --apply --idle-hours 1");
    expect(existsSync(f.clean)).toBe(true);
    expect(git(f.clone, "branch", "--list", "agent/queue/pushed-branch")).not.toBe("");

    const applied = run(f.clone, "--apply", "--idle-hours", "1");
    expect(applied.code).toBe(0);
    expect(existsSync(f.clean)).toBe(false);
    expect(existsSync(f.detached)).toBe(false);
    for (const p of [f.dirty, f.untracked, f.unpushed, f.locked]) expect(existsSync(p)).toBe(true);
    expect(git(f.clone, "branch", "--list", "agent/queue/pushed-branch")).toBe("");
    expect(git(f.clone, "branch", "--list", "agent/queue/clean")).toBe("");
    for (const name of ["main", "agent/queue/local-only", "agent/queue/dirty", "agent/queue/unpushed"]) expect(git(f.clone, "branch", "--list", name)).not.toBe("");
    expect(applied.out).toContain("done: removed 2 worktree(s) and deleted");
  }, 60_000);

  it("keeps everything that was used recently under the default 24 hours", () => {
    const f = fixture();
    git(f.clone, "checkout", "-q", "agent/queue/pushed-branch"); git(f.clone, "checkout", "-q", "main");
    const r = run(f.clone);
    expect(r.out).not.toContain("would remove worktree");
    expect(r.out).toContain("nothing to remove");
  }, 60_000);

  it("refuses to judge anything when GitHub cannot be reached, and rejects unknown arguments", () => {
    const f = fixture();
    git(f.clone, "remote", "set-url", "origin", path.join(f.dir, "missing.git"));
    const r = run(f.clone, "--apply", "--idle-hours", "1");
    expect(r.code).toBe(2);
    expect(r.out).toContain("nothing can be judged safe");
    expect(existsSync(f.clean)).toBe(true);
    expect(run(f.clone, "--force").out).toContain("unknown argument --force");
  }, 60_000);
});
