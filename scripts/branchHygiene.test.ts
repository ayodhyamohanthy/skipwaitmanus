// @vitest-environment node
// BRANCH-HYGIENE-1 (D-205): merged branches are deleted online and offline, and nothing else is.
// The pure rules first, then the script as a process against throwaway git repositories and a
// local stand-in for the GitHub API, so the dry run and --apply are proven without touching GitHub.
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROTECTED, RETENTION_LIST, classifyBranches, classifyLocal, markerOnlyCommits, parseRetention, relatedTo, repoOfRemote, summarize } from "./branchHygieneCore.mjs";

const root = path.resolve(__dirname, "..");
const sha = (c: string) => c.repeat(40);
type Row = { name: string; sha: string; action: string; reason: string };
const task = (id: string, status: string) => ({ id, branch: `agent/queue/${id.toLowerCase()}`, status });
const TASKS = [task("DONE-1", "done"), task("OPEN-1", "todo"), task("ARCH-1", "architect"), task("REVIEW-1", "in-review")];
// By default every marker branch is marker-only and nothing is retained; the tests below vary both.
const input = (names: string[], extra: Record<string, unknown> = {}) => ({
  branches: names.map((name, i) => ({ name, sha: sha("0123456789abcdef"[i % 16]) })),
  mainTipAncestry: new Set<string>(), mergedPrHeads: new Map<string, Set<string>>(), openPrHeads: new Set<string>(), tasks: TASKS, mainRed: null,
  retained: new Map<string, string>(), markerOnly: new Set(names), ...extra,
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
    expect(() => classifyBranches({ ...good, retained: undefined })).toThrow(/invalid input/);
    expect(() => classifyBranches({ ...good, retained: new Map([["feature/x", ""]]) })).toThrow(/invalid input/);
    expect(() => classifyBranches({ ...good, markerOnly: ["feature/x"] })).toThrow(/invalid input/);
  });

  it("fails loudly on a task status the picker does not know, instead of reading it as not done", () => {
    expect(() => classifyBranches(input(["agent/review/paused-1"], { tasks: [task("PAUSED-1", "paused")] }))).toThrow(/invalid input.*status/);
    expect(() => classifyBranches(input(["feature/x"], { tasks: [{ ...task("DONE-1", "done"), status: "Done" }] }))).toThrow(/invalid input.*status/);
  });

  it("keeps a retained branch (an evidence hold) whatever else would delete it, and says why", () => {
    const names = ["agent/review/done-1", "agent/queue/done-1", "feature/squashed"];
    const base = input(names, { mainTipAncestry: new Set(["agent/queue/done-1"]) });
    const held = classifyBranches({ ...base, mergedPrHeads: new Map([["feature/squashed", new Set([base.branches[2].sha])]]), retained: new Map(names.map(n => [n, "#748 evidence"])) });
    for (const name of names) expect(verdict(held, name)).toBe("keep retained");
    expect(summarize(held)).toEqual({ delete: {}, keep: { retained: 3 } });
  });

  it("keeps a done task's marker branch that carries anything besides empty picker markers", () => {
    const names = ["agent/review/done-1", "agent/heartbeat/done-1", "agent/architect/done-1"];
    const rows = classifyBranches(input(names, { markerOnly: new Set(["agent/heartbeat/done-1"]) }));
    expect(verdict(rows, "agent/review/done-1")).toBe("keep has-content");
    expect(verdict(rows, "agent/heartbeat/done-1")).toBe("delete done-heartbeat");
    expect(verdict(rows, "agent/architect/done-1")).toBe("keep has-content");
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

describe("the evidence and identity checks the cleanup relies on", () => {
  it("reads an explicit retention list, and refuses anything it cannot read exactly", () => {
    expect(RETENTION_LIST).toBe(LIST_PATH);
    expect(parseRetention({ version: 1, holds: [] })).toEqual(new Map());
    const hold = { branch: "agent/review/p1-deploy-green-gate", reason: "#750 review evidence", ref: "#748" };
    expect(parseRetention({ version: 1, holds: [hold] })).toEqual(new Map([[hold.branch, "#750 review evidence (#748)"]]));
    for (const bad of [null, [], { holds: [] }, { version: 2, holds: [] }, { version: 1 }, { version: 1, holds: {} }, { version: 1, holds: [], extra: 1 },
      { version: 1, holds: [{ ...hold, note: "x" }] }, { version: 1, holds: [{ ...hold, reason: " " }] }, { version: 1, holds: [{ ...hold, ref: "" }] },
      { version: 1, holds: [{ ...hold, branch: "has space" }] }, { version: 1, holds: [{ reason: "r", ref: "#1" }] }, { version: 1, holds: [hold, hold] }]) {
      expect(() => parseRetention(bad), JSON.stringify(bad)).toThrow(/invalid retention list/);
    }
  });

  it("calls a branch marker-only only when every commit outside main is an empty commit with a picker marker subject", () => {
    const c = (subject: string, extra: Record<string, unknown> = {}) => ({ parents: [sha("1")], tree: sha("2"), parentTree: sha("2"), subject, ...extra });
    expect(markerOnlyCommits([])).toBe(true);
    expect(markerOnlyCommits([c("Review claim P1-deploy-green-gate: DeepSeek-V4.1-Flash · f9b0"), c("Verdict P1-deploy-green-gate: pass — DeepSeek-V4.1-Flash · f9b0"), c("Heartbeat P1-deploy-green-gate: DeepSeek-V4.1-Flash · f9b0")])).toBe(true);
    expect(markerOnlyCommits([c("Heartbeat X-1: a · b", { tree: sha("3") })])).toBe(false);
    expect(markerOnlyCommits([c("evidence: the gate log for #748")])).toBe(false);
    expect(markerOnlyCommits([c("Heartbeat X-1: a · b", { parents: [sha("1"), sha("4")] })])).toBe(false);
    expect(markerOnlyCommits([c("Heartbeat X-1: a · b", { parents: [], parentTree: null })])).toBe(false);
    expect(() => markerOnlyCommits([{ subject: "Heartbeat X-1: a · b" }])).toThrow(/invalid input/);
    expect(() => markerOnlyCommits("Heartbeat X-1: a · b")).toThrow(/invalid input/);
  });

  it("reads owner/repo from every origin URL form, and nothing from an unparseable one", () => {
    for (const url of ["https://github.com/o/r", "https://github.com/o/r.git", "git@github.com:o/r.git", "ssh://git@github.com/o/r.git", "http://proxy@127.0.0.1:8080/git/o/r", "/tmp/x/o/r.git"]) expect(repoOfRemote(url), url).toBe("o/r");
    for (const url of ["", "r.git", "https://github.com/", 7]) expect(repoOfRemote(url), String(url)).toBeNull();
  });
});

// The script as a process: an origin repository, a clone it runs in, and a GitHub stand-in.
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } }).trim();
// The fixture writes the list at its literal path, so these tests exercise the script whatever the module exports.
const LIST_PATH = "docs/plans/branch-retention.json";
const EMPTY_HOLDS = { version: 1, holds: [] };
// origin lives at <dir>/o/r.git, so its URL names the registry's repo "o/r" (the identity check).
function repos(opts: { retention?: unknown; registry?: string; merged?: number } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "branch-hygiene-"));
  mkdirSync(path.join(dir, "o"));
  const origin = path.join(dir, "o", "r.git");
  const work = path.join(dir, "work");
  git(dir, "init", "-q", "--bare", "-b", "main", origin);
  git(dir, "clone", "-q", origin, work);
  mkdirSync(path.join(work, "docs/plans"), { recursive: true });
  writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({ version: 1, repo: opts.registry ?? "o/r", tasks: [task("DONE-1", "done"), task("OPEN-1", "todo")] }));
  if (opts.retention !== undefined) writeFileSync(path.join(work, LIST_PATH), JSON.stringify(opts.retention));
  git(work, "add", "."); git(work, "commit", "-q", "-m", "registry"); git(work, "push", "-q", "origin", "HEAD:main");
  const branch = (name: string, from = "main") => { git(work, "checkout", "-q", "-b", name, from); git(work, "commit", "-q", "--allow-empty", "-m", name); git(work, "push", "-q", "origin", name); return git(work, "rev-parse", "HEAD"); };
  // A picker marker exactly as scripts/next-task.mjs pushMarker writes one: the parent's tree, a marker subject.
  const marker = (name: string, subject: string) => { const parent = git(work, "rev-parse", "main"); const c = git(work, "commit-tree", `${parent}^{tree}`, "-p", parent, "-m", subject); git(work, "push", "-q", "origin", `${c}:refs/heads/${name}`); return c; };
  branch("agent/queue/done-1");
  git(work, "checkout", "-q", "main"); git(work, "merge", "-q", "--ff-only", "agent/queue/done-1"); git(work, "push", "-q", "origin", "main");
  const squashed = branch("feature/squashed", "main");
  marker("agent/review/done-1", "Review claim DONE-1: Tester · 0001");
  // A done task's heartbeat branch that also carries a file: evidence a script must never delete.
  git(work, "checkout", "-q", "-b", "agent/heartbeat/done-1", "main"); writeFileSync(path.join(work, "gate.log"), "evidence\n");
  git(work, "add", "gate.log"); git(work, "commit", "-q", "-m", "Heartbeat DONE-1: Tester · 0001"); git(work, "push", "-q", "origin", "agent/heartbeat/done-1");
  branch("agent/queue/open-1", "main");
  branch("feature/wip", "main");
  const open = branch("dependabot/npm/x", "main");
  branch("agent/reports/log", "main");
  git(work, "checkout", "-q", "main");
  // Extra branches at main's tip (delete merged), enough to need more than one batch of 20.
  const extra = Array.from({ length: opts.merged ?? 0 }, (_, i) => `merged-${String(i).padStart(2, "0")}`);
  if (extra.length) git(work, "push", "-q", "origin", ...extra.map(name => `main:refs/heads/${name}`));
  const runner = path.join(dir, "runner");
  git(dir, "clone", "-q", origin, runner);
  const mainSha = git(runner, "rev-parse", "origin/main");
  return { dir, origin, runner, squashed, open, mainSha };
}
type Pull = Record<string, unknown>;
// The GitHub stand-in. `open(n)` answers the n-th read of the open pull requests (1 = the first snapshot).
function serve(r: ReturnType<typeof repos>, opts: { open?: (n: number) => Pull[] } = {}) {
  const dependabot = { head: { ref: "dependabot/npm/x", sha: r.open, repo: { full_name: "o/r" } } };
  const open = opts.open ?? (() => [dependabot]);
  let reads = 0;
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://local");
    const page = Number(url.searchParams.get("page") ?? "1");
    let body: unknown = [];
    if (url.pathname === "/repos/o/r/pulls" && url.searchParams.get("state") === "open") body = page === 1 ? open(++reads) : [];
    else if (url.pathname === "/repos/o/r/pulls" && url.searchParams.get("state") === "closed") body = page === 1 ? [{ merged_at: "2026-10-27T00:00:00Z", head: { ref: "feature/squashed", sha: r.squashed, repo: { full_name: "o/r" } } }] : [];
    else if (url.pathname === "/repos/o/r/actions/workflows/ci.yml/runs") body = { workflow_runs: [{ status: "completed", conclusion: "success", head_sha: r.mainSha, html_url: "http://ci/1" }] };
    else { res.writeHead(404); res.end("{}"); return; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  return new Promise<{ base: string; close: () => void }>(resolve => server.listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() })));
}
function run(cwd: string, base: string, args: string[] = [], env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; out: string }>(resolve => {
    const child = spawn(process.execPath, [path.join(root, "scripts/branch-cleanup.mjs"), ...args], { cwd, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GITHUB_API_URL: base, ...env } });
    let out = "";
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { out += d; });
    child.on("close", code => resolve({ code, out }));
  });
}
const remote = (origin: string) => git(origin, "for-each-ref", "--format=%(refname:strip=2)", "refs/heads").split("\n").sort();

describe("branch-cleanup.mjs as a process", () => {
  it("dry-runs by default: prints every branch's verdict and the counts, and changes nothing", async () => {
    const r = repos({ retention: EMPTY_HOLDS });
    const s = await serve(r);
    try {
      const before = remote(r.origin);
      const { code, out } = await run(r.runner, s.base);
      expect(code).toBe(0);
      for (const line of ["delete  merged          agent/queue/done-1", "delete  squash-merged   feature/squashed", "delete  done-review     agent/review/done-1", "keep    has-content     agent/heartbeat/done-1", "keep    open-pr         dependabot/npm/x", "keep    task-not-done   agent/queue/open-1", "keep    unmerged        feature/wip", "keep    protected       agent/reports/log"]) expect(out).toContain(line);
      expect(out).toMatch(/DRY RUN: 3 to delete, 6 to keep/);
      expect(out).not.toMatch(/RETENTION LIST MISSING/);
      expect(remote(r.origin)).toEqual(before);
    } finally { s.close(); }
  }, 60_000);

  it("--apply deletes exactly the delete rows on origin, and --only limits it to one task", async () => {
    const r = repos({ retention: EMPTY_HOLDS });
    const s = await serve(r);
    try {
      const only = await run(r.runner, s.base, ["--apply", "--only", "DONE-1"]);
      expect(only.code).toBe(0);
      expect(only.out).toMatch(/deleted 2 of 2 \(checked on origin\)/);
      expect(remote(r.origin)).toEqual(["agent/heartbeat/done-1", "agent/queue/open-1", "agent/reports/log", "dependabot/npm/x", "feature/squashed", "feature/wip", "main"]);
      const all = await run(r.runner, s.base, ["--apply"]);
      expect(all.code).toBe(0);
      expect(all.out).toMatch(/deleted 1 of 1 \(checked on origin\)/);
      expect(remote(r.origin)).toEqual(["agent/heartbeat/done-1", "agent/queue/open-1", "agent/reports/log", "dependabot/npm/x", "feature/wip", "main"]);
    } finally { s.close(); }
  }, 60_000);

  it("without a retention list on main, the dry run says its rows are only candidates and --apply deletes nothing", async () => {
    const r = repos();
    const s = await serve(r);
    try {
      const before = remote(r.origin);
      const dry = await run(r.runner, s.base);
      expect(dry.code).toBe(0);
      expect(dry.out).toContain(`RETENTION LIST MISSING: ${LIST_PATH} is not on origin/main`);
      for (const args of [["--apply"], ["--apply", "--only", "DONE-1"]]) {
        const applied = await run(r.runner, s.base, args);
        expect(applied.code, args.join(" ")).toBe(2);
        expect(applied.out).toMatch(/--apply needs .*branch-retention\.json.*nothing was deleted/);
      }
      expect(remote(r.origin)).toEqual(before);
    } finally { s.close(); }
  }, 60_000);

  it("never deletes a retained branch, and stops on a retention list it cannot read", async () => {
    const r = repos({ retention: { version: 1, holds: [{ branch: "agent/review/done-1", reason: "review evidence", ref: "#748" }] } });
    const s = await serve(r);
    try {
      const applied = await run(r.runner, s.base, ["--apply"]);
      expect(applied.code).toBe(0);
      expect(applied.out).toContain("keep    retained        agent/review/done-1");
      expect(applied.out).toMatch(/deleted 2 of 2 \(checked on origin\)/);
      expect(remote(r.origin)).toEqual(["agent/heartbeat/done-1", "agent/queue/open-1", "agent/reports/log", "agent/review/done-1", "dependabot/npm/x", "feature/wip", "main"]);
    } finally { s.close(); }
    const bad = repos({ retention: { version: 1, holds: [{ branch: "agent/review/done-1" }] } });
    const s2 = await serve(bad);
    try {
      const before = remote(bad.origin);
      const dry = await run(bad.runner, s2.base);
      expect(dry.code).toBe(2);
      expect(dry.out).toMatch(/invalid retention list/);
      expect(remote(bad.origin)).toEqual(before);
    } finally { s2.close(); }
  }, 60_000);

  it("refuses when origin is not the repository the task list names, before any GitHub read", async () => {
    const r = repos({ retention: EMPTY_HOLDS, registry: "x/y" });
    const before = remote(r.origin);
    const { code, out } = await run(r.runner, "http://127.0.0.1:9", ["--apply"]);
    expect(code).toBe(2);
    expect(out).toMatch(/origin is o\/r, but .*assignments\.json names x\/y; nothing was classified or deleted/);
    expect(remote(r.origin)).toEqual(before);
  }, 60_000);

  it("keeps a branch any open pull request uses, a fork's included, and stops on a pull request it cannot read", async () => {
    const r = repos({ retention: EMPTY_HOLDS });
    const fork = { head: { ref: "agent/queue/done-1", sha: sha("e"), repo: { full_name: "fork/r" } } };
    const s = await serve(r, { open: () => [fork] });
    try {
      const { code, out } = await run(r.runner, s.base);
      expect(code).toBe(0);
      expect(out).toContain("keep    open-pr         agent/queue/done-1");
    } finally { s.close(); }
    for (const broken of [{ head: null }, { head: { ref: "", sha: sha("e"), repo: null } }, { head: { ref: "x", sha: "nope", repo: null } }]) {
      const s2 = await serve(r, { open: () => [broken] });
      try {
        const before = remote(r.origin);
        const { code, out } = await run(r.runner, s2.base, ["--apply"]);
        expect(code, JSON.stringify(broken)).toBe(2);
        expect(out).toMatch(/cannot read the open pull requests .*nothing was classified or deleted/);
        expect(remote(r.origin)).toEqual(before);
      } finally { s2.close(); }
    }
  }, 60_000);

  it("re-checks every row just before deleting it: a pull request opened since the first read keeps its branch", async () => {
    const r = repos({ retention: EMPTY_HOLDS });
    const late = { head: { ref: "feature/squashed", sha: r.squashed, repo: { full_name: "o/r" } } };
    const s = await serve(r, { open: n => (n === 1 ? [] : [late]) });
    try {
      const { code, out } = await run(r.runner, s.base, ["--apply"]);
      expect(code).toBe(0);
      expect(out).toMatch(/skipped feature\/squashed: now keep open-pr/);
      expect(out).toMatch(/deleted 2 of 2 \(checked on origin\)/);
      expect(remote(r.origin)).toContain("feature/squashed");
      expect(remote(r.origin)).not.toContain("agent/queue/done-1");
    } finally { s.close(); }
  }, 60_000);

  it("stops before the next batch when a re-check cannot read GitHub, and still reports what it deleted", async () => {
    const r = repos({ retention: EMPTY_HOLDS, merged: 21 });
    // Reads 1 and 2 (the first snapshot, the re-check before batch 1) are fine; read 3 (before batch 2) is not.
    const s = await serve(r, { open: n => (n < 3 ? [] : [{ head: null }]) });
    try {
      const { code, out } = await run(r.runner, s.base, ["--apply"]);
      expect(code).toBe(2);
      expect(out).toMatch(/APPLY: 24 to delete/);
      expect(out).toMatch(/deleted 20 of 20 \(checked on origin\)/);
      expect(out).toMatch(/stopped before the remaining batches: cannot read the open pull requests/);
      const left = remote(r.origin);
      for (const name of ["merged-17", "merged-18", "merged-19", "merged-20"]) expect(left).toContain(name);
      for (const name of ["agent/queue/done-1", "agent/review/done-1", "feature/squashed", "merged-00", "merged-16"]) expect(left).not.toContain(name);
    } finally { s.close(); }
  }, 60_000);

  it("counts deletions from origin itself when origin refuses one branch of a batch", async () => {
    const r = repos({ retention: EMPTY_HOLDS });
    const hook = path.join(r.origin, "hooks", "update");
    writeFileSync(hook, '#!/bin/sh\n[ "$1" = refs/heads/feature/squashed ] && { echo "held by the test hook" >&2; exit 1; }\nexit 0\n');
    chmodSync(hook, 0o755);
    const s = await serve(r);
    try {
      const { code, out } = await run(r.runner, s.base, ["--apply"]);
      expect(code).toBe(1);
      expect(out).toMatch(/deleted 2 of 3 \(checked on origin\)/);
      expect(out).toMatch(/not deleted: feature\/squashed/);
      expect(out).not.toMatch(/not deleted: agent\/(queue|review)\/done-1/);
      expect(remote(r.origin)).toContain("feature/squashed");
      expect(remote(r.origin)).not.toContain("agent/review/done-1");
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

  it("--local deletes nothing when it cannot read which branches worktrees have checked out", async () => {
    const r = repos();
    git(r.runner, "branch", "-q", "--track", "agent/queue/done-1", "origin/agent/queue/done-1");
    git(r.origin, "update-ref", "-d", "refs/heads/agent/queue/done-1");
    // A git that fails only `git worktree`, so every other read still works.
    const shim = path.join(r.dir, "shim");
    mkdirSync(shim);
    const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
    writeFileSync(path.join(shim, "git"), `#!/bin/sh\n[ "$1" = worktree ] && { echo "fatal: simulated worktree failure" >&2; exit 128; }\nexec ${realGit} "$@"\n`);
    chmodSync(path.join(shim, "git"), 0o755);
    const { code, out } = await run(r.runner, "http://127.0.0.1:9", ["--local"], { PATH: `${shim}:${process.env.PATH ?? ""}` });
    expect(code).toBe(2);
    expect(out).toMatch(/cannot list the worktrees.*nothing was deleted/);
    expect(git(r.runner, "for-each-ref", "--format=%(refname:strip=2)", "refs/heads").split("\n")).toContain("agent/queue/done-1");
  }, 60_000);

  it("refuses to run when the open pull requests cannot be read", async () => {
    const r = repos();
    const { code, out } = await run(r.runner, "http://127.0.0.1:9");
    expect(code).not.toBe(0);
    expect(out).toMatch(/cannot read/);
    expect(remote(r.origin)).toContain("feature/squashed");
  }, 60_000);
});
