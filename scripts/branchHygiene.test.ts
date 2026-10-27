// @vitest-environment node
// BRANCH-HYGIENE-1 (D-205): merged branches are deleted online and offline, and nothing else is.
// The pure rules first, then the script as a process against throwaway git repositories and a
// local stand-in for the GitHub API, so the dry run and --apply are proven without touching GitHub.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROTECTED, classifyBranches, classifyLocal, relatedTo, summarize } from "./branchHygieneCore.mjs";

const root = path.resolve(__dirname, "..");
const sha = (c: string) => c.repeat(40);
type Row = { name: string; sha: string; action: string; reason: string };
const task = (id: string, status: string) => ({ id, branch: `agent/queue/${id.toLowerCase()}`, status });
const TASKS = [task("DONE-1", "done"), task("OPEN-1", "todo"), task("ARCH-1", "architect"), task("REVIEW-1", "in-review")];
const input = (names: string[], extra: Record<string, unknown> = {}) => ({
  branches: names.map((name, i) => ({ name, sha: sha("0123456789abcdef"[i % 16]) })),
  mainTipAncestry: new Set<string>(), mergedPrHeads: new Map<string, Set<string>>(), openPrHeads: new Set<string>(), tasks: TASKS, mainRed: null, ...extra,
});
const verdict = (rows: Row[], name: string) => { const r = rows.find(x => x.name === name); return r && `${r.action} ${r.reason}`; };

describe("classifyBranches (D-205 rulings 1-3)", () => {
  it("never deletes main, the report log or the landing slot, whatever else is true", () => {
    expect(PROTECTED).toEqual(["main", "agent/reports/log", "agent/queue/landing"]);
    const rows = classifyBranches(input([...PROTECTED], { mainTipAncestry: new Set(PROTECTED) }));
    for (const name of PROTECTED) expect(verdict(rows, name)).toBe("keep protected");
  });

  it("keeps every branch of a task that is not done: its work, its review lock, its heartbeat, its architect or unblock lock", () => {
    const names = ["agent/queue/open-1", "agent/review/open-1", "agent/heartbeat/open-1", "agent/architect/open-1", "agent/someone/open-1", "agent/architect/arch-1", "agent/review/review-1"];
    const rows = classifyBranches(input(names, { mainTipAncestry: new Set(names) }));
    for (const name of names) expect(verdict(rows, name)).toBe("keep task-not-done");
  });

  it("deletes a done task's marker branches: review lock, heartbeat and architect claim", () => {
    const rows = classifyBranches(input(["agent/review/done-1", "agent/heartbeat/done-1", "agent/architect/done-1"]));
    expect(verdict(rows, "agent/review/done-1")).toBe("delete done-review");
    expect(verdict(rows, "agent/heartbeat/done-1")).toBe("delete done-heartbeat");
    expect(verdict(rows, "agent/architect/done-1")).toBe("delete stale-architect");
  });

  it("deletes a branch whose tip is in main", () => {
    const rows = classifyBranches(input(["agent/queue/done-1", "dependabot/npm/x"], { mainTipAncestry: new Set(["agent/queue/done-1", "dependabot/npm/x"]) }));
    expect(verdict(rows, "agent/queue/done-1")).toBe("delete merged");
    expect(verdict(rows, "dependabot/npm/x")).toBe("delete merged");
  });

  it("deletes a squash-merged head only when the merged pull request's head SHA is the tip", () => {
    const base = input(["feature/squashed", "feature/added-after"]);
    const [squashed, after] = base.branches;
    const rows = classifyBranches({ ...base, mergedPrHeads: new Map([["feature/squashed", new Set([squashed.sha])], ["feature/added-after", new Set([sha("f")])]]) });
    expect(verdict(rows, "feature/squashed")).toBe("delete squash-merged");
    expect(verdict(rows, after.name)).toBe("keep unmerged");
  });

  it("keeps a branch with an open pull request even when its tip is already in main", () => {
    const rows = classifyBranches(input(["feature/open"], { mainTipAncestry: new Set(["feature/open"]), openPrHeads: new Set(["feature/open"]) }));
    expect(verdict(rows, "feature/open")).toBe("keep open-pr");
  });

  it("keeps unmerged work, and lists it", () => {
    const rows = classifyBranches(input(["feature/wip", "agent/review/no-such-task"]));
    expect(verdict(rows, "feature/wip")).toBe("keep unmerged");
    expect(verdict(rows, "agent/review/no-such-task")).toBe("keep unmerged");
    expect(summarize(rows)).toEqual({ delete: {}, keep: { unmerged: 2 } });
  });

  it("keeps the fix-main lock of a red main, and every fix-main lock while main's CI is unknown", () => {
    const names = ["agent/queue/fix-main-aaaaaaaa", "agent/heartbeat/fix-main-aaaaaaaa", "agent/queue/fix-main-bbbbbbbb"];
    const red = classifyBranches(input(names, { mainRed: { sha: sha("a") }, mainTipAncestry: new Set(names) }));
    expect(verdict(red, names[0])).toBe("keep protected");
    expect(verdict(red, names[1])).toBe("keep protected");
    expect(verdict(red, names[2])).toBe("delete merged");
    const unknown = classifyBranches(input(names, { mainRed: "unknown", mainTipAncestry: new Set(names) }));
    for (const name of names) expect(verdict(unknown, name)).toBe("keep protected");
  });

  it("fails loudly on malformed input instead of guessing", () => {
    const good = input(["feature/x"]);
    expect(() => classifyBranches({ ...good, branches: "feature/x" })).toThrow(/invalid input/);
    expect(() => classifyBranches({ ...good, branches: [{ name: "feature/x", sha: "abc" }] })).toThrow(/invalid input/);
    expect(() => classifyBranches({ ...good, branches: [{ name: "", sha: sha("a") }] })).toThrow(/invalid input/);
    expect(() => classifyBranches({ ...good, mainTipAncestry: ["feature/x"] })).toThrow(/invalid input/);
    expect(() => classifyBranches({ ...good, mergedPrHeads: { "feature/x": [sha("a")] } })).toThrow(/invalid input/);
    expect(() => classifyBranches({ ...good, openPrHeads: null })).toThrow(/invalid input/);
    expect(() => classifyBranches({ ...good, tasks: [{ id: "X" }] })).toThrow(/invalid input/);
    expect(() => classifyBranches({ ...good, mainRed: { sha: "nope" } })).toThrow(/invalid input/);
    expect(() => classifyBranches({ ...good, branches: [{ name: "feature/x", sha: sha("a") }, { name: "feature/x", sha: sha("b") }] })).toThrow(/invalid input/);
  });

  it("relatedTo picks one task's branches for --only", () => {
    const done = TASKS[0];
    for (const name of ["agent/queue/done-1", "agent/review/done-1", "agent/heartbeat/done-1", "agent/architect/done-1", "agent/someone/done-1"]) expect(relatedTo(done, name)).toBe(true);
    for (const name of ["agent/queue/open-1", "agent/queue/done-10", "main"]) expect(relatedTo(done, name)).toBe(false);
  });
});

describe("classifyLocal (D-205 ruling 5)", () => {
  const local = (name: string, extra: Record<string, unknown> = {}) => ({ name, sha: sha("a"), upstreamGone: true, inMain: true, worktree: null, ...extra });
  it("deletes a local branch only when its upstream is gone, its tip is in origin/main and no worktree has it checked out", () => {
    const rows = classifyLocal({ local: [local("gone-merged"), local("here", { worktree: "/w/here" }), local("tracked", { upstreamGone: false }), local("local-work", { inMain: false }), local("main")] });
    expect(verdict(rows, "gone-merged")).toBe("delete merged-local");
    expect(verdict(rows, "here")).toBe("keep checked-out");
    expect(verdict(rows, "tracked")).toBe("keep upstream-present");
    expect(verdict(rows, "local-work")).toBe("keep unmerged-local");
    expect(verdict(rows, "main")).toBe("keep protected");
    expect(() => classifyLocal({ local: [{ name: "x" }] })).toThrow(/invalid input/);
  });
});

// The script as a process: an origin repository, a clone it runs in, and a GitHub stand-in.
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } }).trim();
function repos() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "branch-hygiene-"));
  const origin = path.join(dir, "origin.git");
  const work = path.join(dir, "work");
  git(dir, "init", "-q", "--bare", "-b", "main", origin);
  git(dir, "clone", "-q", origin, work);
  mkdirSync(path.join(work, "docs/plans"), { recursive: true });
  writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({ version: 1, repo: "o/r", tasks: [task("DONE-1", "done"), task("OPEN-1", "todo")] }));
  git(work, "add", "."); git(work, "commit", "-q", "-m", "registry"); git(work, "push", "-q", "origin", "HEAD:main");
  const branch = (name: string, from = "main") => { git(work, "checkout", "-q", "-b", name, from); git(work, "commit", "-q", "--allow-empty", "-m", name); git(work, "push", "-q", "origin", name); return git(work, "rev-parse", "HEAD"); };
  branch("agent/queue/done-1");
  git(work, "checkout", "-q", "main"); git(work, "merge", "-q", "--ff-only", "agent/queue/done-1"); git(work, "push", "-q", "origin", "main");
  const squashed = branch("feature/squashed", "main");
  branch("agent/review/done-1", "main");
  branch("agent/queue/open-1", "main");
  branch("feature/wip", "main");
  const open = branch("dependabot/npm/x", "main");
  branch("agent/reports/log", "main");
  git(work, "checkout", "-q", "main");
  const runner = path.join(dir, "runner");
  git(dir, "clone", "-q", origin, runner);
  const mainSha = git(runner, "rev-parse", "origin/main");
  return { origin, runner, squashed, open, mainSha };
}
function serve(r: ReturnType<typeof repos>) {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://local");
    const page = Number(url.searchParams.get("page") ?? "1");
    let body: unknown = [];
    if (url.pathname === "/repos/o/r/pulls" && url.searchParams.get("state") === "open") body = page === 1 ? [{ head: { ref: "dependabot/npm/x", sha: r.open, repo: { full_name: "o/r" } } }] : [];
    else if (url.pathname === "/repos/o/r/pulls" && url.searchParams.get("state") === "closed") body = page === 1 ? [{ merged_at: "2026-10-27T00:00:00Z", head: { ref: "feature/squashed", sha: r.squashed, repo: { full_name: "o/r" } } }] : [];
    else if (url.pathname === "/repos/o/r/actions/workflows/ci.yml/runs") body = { workflow_runs: [{ status: "completed", conclusion: "success", head_sha: r.mainSha, html_url: "http://ci/1" }] };
    else { res.writeHead(404); res.end("{}"); return; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  return new Promise<{ base: string; close: () => void }>(resolve => server.listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() })));
}
function run(cwd: string, base: string, args: string[] = []) {
  return new Promise<{ code: number | null; out: string }>(resolve => {
    const child = spawn(process.execPath, [path.join(root, "scripts/branch-cleanup.mjs"), ...args], { cwd, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GITHUB_API_URL: base } });
    let out = "";
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { out += d; });
    child.on("close", code => resolve({ code, out }));
  });
}
const remote = (origin: string) => git(origin, "for-each-ref", "--format=%(refname:strip=2)", "refs/heads").split("\n").sort();

describe("branch-cleanup.mjs as a process", () => {
  it("dry-runs by default: prints every branch's verdict and the counts, and changes nothing", async () => {
    const r = repos();
    const s = await serve(r);
    try {
      const before = remote(r.origin);
      const { code, out } = await run(r.runner, s.base);
      expect(code).toBe(0);
      for (const line of ["delete  merged          agent/queue/done-1", "delete  squash-merged   feature/squashed", "delete  done-review     agent/review/done-1", "keep    open-pr         dependabot/npm/x", "keep    task-not-done   agent/queue/open-1", "keep    unmerged        feature/wip", "keep    protected       agent/reports/log"]) expect(out).toContain(line);
      expect(out).toMatch(/DRY RUN: 3 to delete, 5 to keep/);
      expect(remote(r.origin)).toEqual(before);
    } finally { s.close(); }
  }, 60_000);

  it("--apply deletes exactly the delete rows on origin, and --only limits it to one task", async () => {
    const r = repos();
    const s = await serve(r);
    try {
      const only = await run(r.runner, s.base, ["--apply", "--only", "DONE-1"]);
      expect(only.code).toBe(0);
      expect(remote(r.origin)).toEqual(["agent/queue/open-1", "agent/reports/log", "dependabot/npm/x", "feature/squashed", "feature/wip", "main"]);
      const all = await run(r.runner, s.base, ["--apply"]);
      expect(all.code).toBe(0);
      expect(all.out).toMatch(/deleted 1 of 1/);
      expect(remote(r.origin)).toEqual(["agent/queue/open-1", "agent/reports/log", "dependabot/npm/x", "feature/wip", "main"]);
    } finally { s.close(); }
  }, 60_000);

  it("--local deletes only merged local branches whose upstream is gone and that no worktree has checked out", async () => {
    const r = repos();
    const s = await serve(r);
    try {
      for (const b of ["agent/queue/done-1", "feature/wip"]) git(r.runner, "branch", "-q", "--track", b, `origin/${b}`);
      git(r.origin, "update-ref", "-d", "refs/heads/agent/queue/done-1");
      git(r.origin, "update-ref", "-d", "refs/heads/feature/wip");
      const { code } = await run(r.runner, s.base, ["--local"]);
      expect(code).toBe(0);
      const local = git(r.runner, "for-each-ref", "--format=%(refname:strip=2)", "refs/heads").split("\n").sort();
      expect(local).toEqual(["feature/wip", "main"]);
    } finally { s.close(); }
  }, 60_000);

  it("refuses to run when the open pull requests cannot be read", async () => {
    const r = repos();
    const { code, out } = await run(r.runner, "http://127.0.0.1:9");
    expect(code).not.toBe(0);
    expect(out).toMatch(/cannot read/);
    expect(remote(r.origin)).toContain("feature/squashed");
  }, 60_000);
});
