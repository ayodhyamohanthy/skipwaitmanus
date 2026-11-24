// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const CLI = fileURLToPath(new URL("./next-task.mjs", import.meta.url));
const ME = "Fixture · refs", OTHER = "Fixture · holder";
const A = "agent/queue/a";
interface Mutation { ref?: string; sha?: string; unavailable?: boolean; repeat?: boolean; subject?: string; }
interface RunOptions { args?: string[]; mutation?: Mutation; reject?: string; rejectAs?: string; }

function fixture(mainOnly = true) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "authoritative-refs-"));
  const work = path.join(dir, "work"), remote = path.join(dir, "origin.git"), mock = path.join(dir, "mock.mjs");
  const attempts = path.join(dir, "pushes.json"), mutations = path.join(dir, "mutations.json");
  mkdirSync(path.join(work, "docs/plans"), { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8", stdio: "pipe" }).trim();
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("remote", "add", "origin", remote);
  if (mainOnly) git("config", "remote.origin.fetch", "+refs/heads/main:refs/remotes/origin/main");
  const task = (id: string) => ({ id, title: `${id} title`, row: id, packet: "docs/plans/test.md", tier: 2,
    lane: id, branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [], syncedTo: "D-001" });
  writeFileSync(path.join(work, "docs/plans/test.md"), "# Fixture\n");
  writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({ version: 1, repo: "o/r", tasks: [task("A"), task("W")] }));
  writeFileSync(path.join(work, "docs/DECISIONS.md"), ["# Decisions", "| ID | Date | Decision | Evidence | Notes | Status |",
    "|---|---|---|---|---|---|", "| D-001 | 2026-11-20 | Fixture | e | Affects tasks: none. | adopted |", ""].join("\n"));
  git("add", "docs"); git("commit", "-m", "fixture"); git("push", "-u", "origin", "main");
  const head = git("rev-parse", "HEAD");
  const marker = (ref: string, subject: string, parent = head, old = false) => {
    const sha = execFileSync("git", ["commit-tree", `${parent}^{tree}`, "-p", parent, "-m", subject, "-m", `Fixture source ref: ${ref}`], {
      cwd: work, encoding: "utf8", stdio: "pipe", env: { ...process.env,
        ...(old ? { GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" } : {}) },
    }).trim();
    git("push", "-q", "origin", `${sha}:refs/heads/${ref}`);
    return sha;
  };
  const remoteTip = (ref: string) => execFileSync("git", ["--git-dir", remote, "rev-parse", `refs/heads/${ref}`], { encoding: "utf8" }).trim();
  const remoteSet = () => execFileSync("git", ["--git-dir", remote, "for-each-ref", "--format=%(objectname) %(refname)"], { encoding: "utf8" }).trim();
  const setRemote = (ref: string, sha?: string) => git("--git-dir", remote, "update-ref", ...(sha ? [`refs/heads/${ref}`, sha] : ["-d", `refs/heads/${ref}`]));
  const config = () => readFileSync(path.join(work, ".git/config"), "utf8");
  writeFileSync(mock, `
import cp from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const setup = JSON.parse(process.env.REF_FIXTURE);
const spawn = cp.spawnSync, exec = cp.execFileSync;
let changed = false, rejected = false;
const record = (file, value) => writeFileSync(file, JSON.stringify([...JSON.parse(existsSync(file) ? readFileSync(file, 'utf8') : '[]'), value]));
cp.spawnSync = (command, args, options) => {
  if (command === 'git' && args[0] === 'push') {
    record(setup.attempts, args);
    if (!rejected && setup.reject && args.some(a => a.endsWith(':refs/heads/' + setup.reject))) {
      rejected = true;
      exec('git', ['--git-dir', setup.remote, 'update-ref', 'refs/heads/' + setup.reject, setup.rival]);
    }
  }
  return spawn(command, args, options);
};
syncBuiltinESMExports();
const response = body => ({ ok: true, status: 200, json: async () => body });
globalThis.fetch = async input => {
  const url = String(input);
  if (url.includes('/runs?branch=main')) {
    if (setup.mutation && (!changed || setup.mutation.repeat)) {
      changed = true;
      const m = setup.mutation;
      if (m.unavailable) renameSync(setup.remote, setup.remote + '.offline');
      else if (m.repeat) {
        let current;
        try { current = exec('git', ['--git-dir', setup.remote, 'rev-parse', '--verify', 'refs/heads/' + m.ref], { encoding: 'utf8', stdio: 'pipe' }).trim(); }
        catch { current = setup.head; }
        const next = exec('git', ['--git-dir', setup.remote, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit-tree', current + '^{tree}', '-p', current, '-m', m.subject ?? 'Fixture snapshot moved'], { encoding: 'utf8' }).trim();
        exec('git', ['--git-dir', setup.remote, 'update-ref', 'refs/heads/' + m.ref, next]);
      } else exec('git', ['--git-dir', setup.remote, 'update-ref', ...(m.sha ? ['refs/heads/' + m.ref, m.sha] : ['-d', 'refs/heads/' + m.ref])]);
      record(setup.mutations, m);
    }
    return response({ workflow_runs: [{ status: 'completed', conclusion: 'success', head_sha: setup.head, updated_at: new Date().toISOString() }] });
  }
  if (url.includes('/pulls?state=open') || url.includes('/pulls?state=closed')) return response([]);
  throw Error('unexpected fixture fetch: ' + url);
};
`);
  const run = ({ args = ["--claim", ME], mutation, reject, rejectAs = OTHER }: RunOptions = {}, cwd = work) => {
    const parent = reject ? remoteTip(reject) : head;
    const rival = reject ? marker("fixture-rival", `Heartbeat A: ${rejectAs}`, parent) : undefined;
    const result = spawnSync(process.execPath, ["--import", mock, CLI, ...args], {
      cwd, encoding: "utf8", timeout: 25_000, env: { ...process.env,
        NEXT_TASK_LIST_REF: "origin/main", NODE_USE_ENV_PROXY: "1", GH_TOKEN: "fixture-only",
        REF_FIXTURE: JSON.stringify({ head, remote, attempts, mutations, mutation, reject, rival }) },
    });
    if (existsOffline()) renameSync(remote + ".offline", remote);
    return result;
  };
  const existsOffline = () => spawnSync("git", ["--git-dir", remote + ".offline", "rev-parse", "--is-bare-repository"], { stdio: "pipe" }).status === 0;
  const pushes = () => z.array(z.array(z.string())).parse(JSON.parse(readFileSync(attempts, "utf8")));
  return { dir, work, remote, git, head, marker, remoteTip, remoteSet, setRemote, config, run, pushes, attempts };
}

function check(test: (f: ReturnType<typeof fixture>) => void, mainOnly = true) {
  const f = fixture(mainOnly);
  try { test(f); } finally { rmSync(f.dir, { recursive: true, force: true }); }
}
const output = (r: ReturnType<typeof spawnSync>) => `${r.stdout}\n${r.stderr}`;

describe("authoritative refs in the real picker CLI", () => {
  it.each([true, false])("sees side heartbeats with main-only fetch=%s, without changing config", mainOnly => check(f => {
    const claim = f.marker(A, `Claim A: ${OTHER}`, f.head, true);
    f.git("fetch", "origin", `+refs/heads/${A}:refs/remotes/origin/${A}`);
    const heartbeat = f.marker("agent/heartbeat/a", `Heartbeat A: ${OTHER}`, claim);
    const config = f.config(), before = f.remoteSet();
    const preview = f.run({ args: ["--as", ME] });
    expect(preview.status, output(preview)).toBe(0);
    expect(preview.stdout).toContain("NEXT: BUILD W");
    expect(f.remoteSet()).toBe(before);
    const result = f.run();
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain("NEXT: BUILD W");
    expect(f.remoteTip(A)).toBe(claim);
    expect(f.remoteTip("agent/heartbeat/a")).toBe(heartbeat);
    expect(f.config()).toBe(config);
    expect(f.remoteSet().split("\n").length).toBe(before.split("\n").length + 1);
  }, mainOnly));

  it("prunes deleted tracking refs and builds from main instead of resurrecting deleted history", () => check(f => {
    const old = f.marker(A, `Claim A: ${OTHER}`, f.head, true);
    f.git("fetch", "origin", `+refs/heads/${A}:refs/remotes/origin/${A}`);
    f.setRemote(A);
    const result = f.run();
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain("NEXT: BUILD A");
    expect(f.git("rev-parse", `${f.remoteTip(A)}^`)).toBe(f.head);
    expect(f.remoteTip(A)).not.toBe(old);
  }));

  it("sees a new remote claim hidden by main-only configuration", () => check(f => {
    const claim = f.marker(A, `Claim A: ${OTHER}`);
    const before = f.remoteSet();
    const result = f.run({ args: ["--as", ME] });
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain("NEXT: BUILD W");
    expect(f.remoteTip(A)).toBe(claim);
    expect(f.remoteSet()).toBe(before);
  }));

  it.each(["created", "moved"])("rereads when a heartbeat is %s during GitHub reads", kind => check(f => {
    const claim = f.marker(A, `Claim A: ${OTHER}`, f.head, true);
    const ref = "agent/heartbeat/a";
    if (kind === "moved") f.marker(ref, `Heartbeat A: ${OTHER}`, claim, true);
    const next = f.marker("fixture-next", `Heartbeat A: ${OTHER}`, kind === "moved" ? f.remoteTip(ref) : claim);
    const result = f.run({ mutation: { ref, sha: next } });
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain("NEXT: BUILD W");
    expect(result.stderr).toContain("snapshot changed");
    expect(f.remoteTip(A)).toBe(claim);
    expect(f.pushes()).toHaveLength(1);
  }));

  it("rereads a deleted input before writing a takeover", () => check(f => {
    f.marker(A, `Claim A: ${OTHER}`, f.head, true);
    const result = f.run({ mutation: { ref: A } });
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain("NEXT: BUILD A");
    expect(f.git("rev-parse", `${f.remoteTip(A)}^`)).toBe(f.head);
    expect(f.pushes()).toHaveLength(1);
  }));

  it.each(["agent/reports/log", "agent/queue/landing", "agent/review/a", "agent/architect/a"])("invalidates a created %s input", ref => check(f => {
    f.marker(A, `Claim A: ${OTHER}`, f.head, true);
    const next = f.marker("fixture-next", "Fixture input changed");
    const result = f.run({ mutation: { ref, sha: next } });
    expect(result.status, output(result)).toBe(0);
    expect(result.stderr).toContain("snapshot changed");
    expect(f.pushes()).toHaveLength(1);
    expect(f.remoteTip(ref)).toBe(next);
  }));

  it("refuses all writes if origin disappears during revalidation", () => check(f => {
    const before = f.remoteSet();
    const result = f.run({ mutation: { unavailable: true } });
    expect(result.status, output(result)).not.toBe(0);
    expect(result.stderr).toContain("STOP");
    expect(f.remoteSet()).toBe(before);
    expect(spawnSync("test", ["-f", f.attempts]).status).toBe(1);
  }));

  it("refreshes the report tracking ref after a rejected report push", () => check(f => {
    f.marker(A, `Claim A: ${ME}`);
    f.marker("agent/reports/log", "Report W: green — Fixture · old", f.head, true);
    const result = f.run({ args: ["--report", "green", "--task", "A", "--as", ME, "--note", "fixture proof"], reject: "agent/reports/log" });
    expect(result.status, output(result)).toBe(0);
    expect(f.git("log", "-1", "--format=%s", f.remoteTip("agent/reports/log"))).toBe(`Report A: green — ${ME}`);
    expect(f.pushes()).toHaveLength(2);
  }));

  it("report append keeps unrelated native reports without restarting the full snapshot", () => check(f => {
    f.marker(A, `Claim A: ${ME}`);
    const ref = "agent/reports/log";
    const initial = f.marker(ref, `Report W: green — ${OTHER}`, f.head, true);
    const result = f.run({ args: ["--report", "review", "--task", "A", "--as", ME, "--note", "fixture proof"],
      mutation: { ref, repeat: true, subject: `Report W: green — ${OTHER}` } });
    expect(result.status, output(result)).toBe(0);
    const tip = f.remoteTip(ref), parent = f.git("rev-parse", `${tip}^`);
    expect(f.git("log", "-1", "--format=%s", tip)).toBe(`Report A: review — ${ME}`);
    expect(f.git("log", "-1", "--format=%s", parent)).toBe(`Report W: green — ${OTHER}`);
    expect(f.git("merge-base", "--is-ancestor", initial, parent)).toBe("");
    expect(f.git("rev-list", "--count", `${initial}..${parent}`)).toBe("1");
    expect(result.stderr).not.toContain("snapshot changed");
    expect(f.pushes()).toHaveLength(1);
  }));

  it("report append still stops for repeated same-task report changes", () => check(f => {
    f.marker(A, `Claim A: ${ME}`);
    f.marker("agent/reports/log", `Report W: green — ${OTHER}`, f.head, true);
    const result = f.run({ args: ["--report", "review", "--task", "A", "--as", ME],
      mutation: { ref: "agent/reports/log", repeat: true, subject: `Report A: green — ${OTHER}` } });
    expect(result.status, output(result)).toBe(2);
    expect(result.stderr).toContain("STOP: authoritative refs kept changing");
    expect(spawnSync("test", ["-f", f.attempts]).status).toBe(1);
  }));

  it.each(["Fixture snapshot moved", `Heartbeat W: ${OTHER}`])("report append rereads unknown/non-report history: %s", subject => check(f => {
    f.marker(A, `Claim A: ${ME}`);
    f.marker("agent/reports/log", `Report W: green — ${OTHER}`, f.head, true);
    const result = f.run({ args: ["--report", "review", "--task", "A", "--as", ME],
      mutation: { ref: "agent/reports/log", repeat: true, subject } });
    expect(result.status, output(result)).toBe(2);
    expect(result.stderr).toContain("STOP: authoritative refs kept changing");
    expect(spawnSync("test", ["-f", f.attempts]).status).toBe(1);
  }));

  it.each(["file-changing", "merge", "rewritten"])("report append fully rereads %s history before appending", kind => check(f => {
    f.marker(A, `Claim A: ${ME}`);
    const ref = "agent/reports/log", subject = `Report W: green — ${OTHER}`;
    const initial = f.marker(ref, subject, f.head, true);
    let next: string;
    if (kind === "file-changing") {
      const blob = f.git("hash-object", "-w", "--stdin");
      const tree = execFileSync("git", ["mktree"], { cwd: f.work, encoding: "utf8", input: `100644 blob ${blob}\tunexpected.txt\n` }).trim();
      next = f.git("commit-tree", tree, "-p", initial, "-m", subject);
      f.git("push", "-q", "origin", `${next}:refs/heads/fixture-next`);
    } else if (kind === "merge") {
      const peer = f.marker("fixture-peer", subject);
      next = f.git("commit-tree", `${initial}^{tree}`, "-p", initial, "-p", peer, "-m", subject);
      f.git("push", "-q", "origin", `${next}:refs/heads/fixture-next`);
    } else next = f.marker("fixture-next", subject);
    const result = f.run({ args: ["--report", "review", "--task", "A", "--as", ME], mutation: { ref, sha: next } });
    expect(result.status, output(result)).toBe(0);
    expect(result.stderr).toContain("snapshot changed");
    expect(f.git("rev-parse", `${f.remoteTip(ref)}^`)).toBe(next);
    expect(f.pushes()).toHaveLength(1);
  }));

  it("report append rereads a newly created report log", () => check(f => {
    f.marker(A, `Claim A: ${ME}`);
    const next = f.marker("fixture-next", `Report W: green — ${OTHER}`);
    const result = f.run({ args: ["--report", "review", "--task", "A", "--as", ME],
      mutation: { ref: "agent/reports/log", sha: next } });
    expect(result.status, output(result)).toBe(0);
    expect(result.stderr).toContain("snapshot changed");
    expect(f.git("rev-parse", `${f.remoteTip("agent/reports/log")}^`)).toBe(next);
    expect(f.pushes()).toHaveLength(1);
  }));

  it("refreshes a rejected side heartbeat against its actual remote parent", () => check(f => {
    const claim = f.marker(A, `Claim A: ${ME}`);
    f.marker("agent/heartbeat/a", `Heartbeat A: ${ME}`, claim);
    const result = f.run({ args: ["--heartbeat", "--as", ME], reject: "agent/heartbeat/a", rejectAs: ME });
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain("Heartbeat recorded");
    expect(f.git("rev-parse", `${f.remoteTip("agent/heartbeat/a")}^`)).toBe(f.remoteTip("fixture-rival"));
    expect(f.pushes()).toHaveLength(2);
  }));

  it("stops after bounded snapshot churn without writing a marker", () => check(f => {
    f.marker("agent/heartbeat/a", `Heartbeat A: ${OTHER}`);
    const result = f.run({ args: ["--claim", "Fixture"], mutation: { ref: "agent/heartbeat/a", repeat: true } });
    expect(result.status, output(result)).toBe(2);
    expect(result.stderr).toContain("STOP: authoritative refs kept changing");
    expect(result.stdout.match(/Your session name is/g)).toHaveLength(1);
    expect(spawnSync("test", ["-f", f.attempts]).status).toBe(1);
    expect(f.remoteSet()).not.toContain(`refs/heads/${A}`);
  }));

  // PICKER-snapshot-scope: a write compares only its own task's refs and the shared report/landing inputs,
  // so other agents' heartbeats, claims and pushes no longer starve every claim (owner, Nov 21: "all agents
  // should be able to get work").
  it("claims while another task's heartbeat keeps moving", () => check(f => {
    f.marker("agent/heartbeat/w", `Heartbeat W: ${OTHER}`);
    const result = f.run({ mutation: { ref: "agent/heartbeat/w", repeat: true } });
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain("NEXT: BUILD A");
    expect(result.stderr).not.toContain("kept changing");
    expect(f.git("rev-parse", `${f.remoteTip(A)}^`)).toBe(f.head);
    expect(f.pushes()).toHaveLength(1);
  }));

  // D-324 / PICKER-claim-race-reread: a rival's claim on the picked task is a lost race, not a
  // snapshot dead end. The claim re-picks inside the same bounded loop instead of spending the
  // command's three whole snapshot rereads on the same task.
  it("treats a rival claim on the picked task as a lost race, not a snapshot abort", () => check(f => {
    const result = f.run({ mutation: { ref: A, repeat: true, subject: `Claim A: ${OTHER}` } });
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain("NEXT: BUILD W");
    expect(result.stderr).toContain(`another agent claimed A first (attempt 1)`);
    expect(result.stderr).not.toContain("snapshot changed");
    expect(result.stderr).not.toContain("STOP: authoritative refs kept changing");
    expect(f.git("rev-parse", `${f.remoteTip("agent/queue/w")}^`)).toBe(f.head);
  }));

  it("claims while main keeps moving without changing the picked task's inputs", () => check(f => {
    const result = f.run({ mutation: { ref: "main", repeat: true } });
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain("NEXT: BUILD A");
    expect(result.stderr).not.toContain("kept changing");
    expect(f.remoteTip("main")).not.toBe(f.head);
    expect(f.git("rev-parse", `${f.remoteTip(A)}^`)).toBe(f.head);
    expect(f.pushes()).toHaveLength(1);
  }));

  it("rereads when main changes the picked task's own row before the write", () => check(f => {
    const list = path.join(f.work, "docs/plans/assignments.json");
    const doc = JSON.parse(readFileSync(list, "utf8"));
    doc.tasks[0].dependsOn = ["W"];
    writeFileSync(list, JSON.stringify(doc));
    f.git("commit", "-qam", "A now waits for W");
    const moved = f.git("rev-parse", "HEAD");
    f.git("push", "-q", "origin", `${moved}:refs/heads/fixture-main-next`);
    f.git("reset", "-q", "--hard", f.head);
    const result = f.run({ mutation: { ref: "main", sha: moved } });
    expect(result.status, output(result)).toBe(0);
    expect(result.stderr).toContain("snapshot changed");
    expect(result.stdout).toContain("NEXT: BUILD W");
    expect(f.remoteSet()).not.toContain(`refs/heads/${A}`);
    expect(f.pushes()).toHaveLength(1);
  }));

  it("stops without writing when the initial authoritative fetch fails", () => check(f => {
    const before = f.remoteSet();
    renameSync(f.remote, f.remote + ".offline");
    const result = f.run();
    expect(result.status, output(result)).toBe(2);
    expect(result.stderr).toContain("STOP: authoritative ref refresh failed");
    expect(f.remoteSet()).toBe(before);
    expect(spawnSync("test", ["-f", f.attempts]).status).toBe(1);
  }));

  it("fails closed on shallow history instead of inferring an abandoned claim", () => check(f => {
    f.marker(A, `Claim A: ${OTHER}`, f.head, true);
    const shallow = path.join(f.dir, "shallow");
    f.git("clone", "--depth=1", "--branch=main", `file://${f.remote}`, shallow);
    const before = f.remoteSet(), result = f.run({}, shallow);
    expect(result.status, output(result)).not.toBe(0);
    expect(result.stderr).toContain("STOP");
    expect(result.stderr).toContain("unshallow");
    expect(f.remoteSet()).toBe(before);
  }));
});
