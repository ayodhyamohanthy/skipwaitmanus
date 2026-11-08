/**
 * REVIEW-GATE-fetch-parity (D-292, docs/plans/REVIEW-GATE-fetch-parity.md §7): the named CI step
 * "Review gate (independent Tier 1 pass)" runs `node scripts/review-gate.mjs` on actions/checkout's
 * depth-one checkout, where nothing has created `origin/main` yet. The gate must fetch what it reads
 * (the queue gate's ensureOriginMainHistory) and evaluate, failing open only on a genuine fetch error.
 *
 * Real git, no network: a temporary bare repository is `origin`, and each case builds a CI-shaped
 * checkout (depth-one fetch of the base and head shas only, no refs/remotes/origin/main, head detached).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { GATE_STEP, markerSubject } from "./nextTaskCore.mjs";
import { REVIEW_GATE_FAIL } from "./review-gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, "review-gate.mjs");
const CI_YML = resolve(HERE, "../.github/workflows/ci.yml");
const COULD_NOT_RUN = "could not run";

const TASKS = {
  tasks: [
    { id: "T1", branch: "agent/queue/t1", tier: 1, lane: "process", status: "todo" },
    { id: "T2", branch: "agent/queue/t2", tier: 2, lane: "process", status: "todo" },
  ],
};

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** git with a fixed identity and no user or system config, so the fixture is the same on every machine. */
function baseEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("GIT_") || key.startsWith("GITHUB_")) continue;
    env[key] = value;
  }
  return {
    ...env,
    HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  };
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "review-gate-fetch-parity-"));
  roots.push(root);
  const home = join(root, "home");
  mkdirSync(home);
  const env = baseEnv(home);
  const g = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

  const bare = join(root, "origin.git");
  g(root, "init", "-q", "--bare", "-b", "main", bare);
  // A CI fetch asks for shas by id, as actions/checkout and ci.yml's pinned-base step do.
  g(bare, "config", "uploadpack.allowAnySHA1InWant", "true");

  const src = join(root, "src");
  g(root, "init", "-q", "-b", "main", src);
  mkdirSync(join(src, "docs/plans"), { recursive: true });
  writeFileSync(join(src, "docs/plans/assignments.json"), `${JSON.stringify(TASKS, null, 2)}\n`);
  writeFileSync(join(src, "README.md"), "fixture\n");
  g(src, "add", "-A");
  g(src, "commit", "-q", "-m", "main: task list");
  g(src, "remote", "add", "origin", `file://${bare}`);
  g(src, "push", "-q", "origin", "main");

  const sha = (rev = "HEAD") => g(src, "rev-parse", rev);
  const marker = (subject: string, body?: string) =>
    body ? g(src, "commit", "-q", "--allow-empty", "-m", subject, "-m", body) : g(src, "commit", "-q", "--allow-empty", "-m", subject);
  const work = (path: string, text: string, message: string) => {
    mkdirSync(dirname(join(src, path)), { recursive: true });
    writeFileSync(join(src, path), text);
    g(src, "add", "-A");
    g(src, "commit", "-q", "-m", message);
  };

  /** A task branch off main: the builder's Claim marker, then one work commit on a non-Tier-1 path. */
  const taskBranch = (id: string, branch: string, builder = "Builder · b1") => {
    g(src, "checkout", "-q", "-B", branch, "main");
    marker(markerSubject("Claim", id, builder));
    work(`notes/${id.toLowerCase()}.txt`, `${id} work\n`, `${id}: work`);
    g(src, "push", "-q", "origin", branch);
    return sha();
  };

  /** The row's review lock off main: Review claim, then a pass verdict naming `reviewed`. */
  const passLock = (id: string, lock: string, reviewed: string, reviewer = "Reviewer · r1") => {
    g(src, "checkout", "-q", "-B", lock, "main");
    marker(markerSubject("Review claim", id, reviewer));
    marker(markerSubject("Verdict", id, reviewer, "pass"), `reviewed ${reviewed}`);
    g(src, "push", "-q", "origin", lock);
    g(src, "checkout", "-q", "main");
  };

  /** actions/checkout's shape: depth-one fetch of the base and head shas only, no origin/main ref, head detached. */
  const ciCheckout = (head: string) => {
    const base = g(src, "rev-parse", "main");
    const ck = join(root, `ck-${head.slice(0, 8)}-${roots.length}-${Math.random().toString(36).slice(2, 8)}`);
    g(root, "init", "-q", ck);
    g(ck, "remote", "add", "origin", `file://${bare}`);
    g(ck, "fetch", "-q", "--no-tags", "--depth=1", "origin", base, head);
    g(ck, "checkout", "-q", "--detach", head);
    expect(() => g(ck, "rev-parse", "--verify", "-q", "refs/remotes/origin/main")).toThrow();
    expect(g(ck, "rev-parse", "--is-shallow-repository")).toBe("true");
    return ck;
  };

  const runGate = (cwd: string, headRef: string, head: string) => {
    const eventPath = join(root, `event-${Math.random().toString(36).slice(2, 8)}.json`);
    writeFileSync(eventPath, JSON.stringify({ pull_request: { head: { sha: head } } }));
    const r = spawnSync(process.execPath, [GATE], {
      cwd,
      env: { ...env, GITHUB_HEAD_REF: headRef, GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: "pull_request" },
      encoding: "utf8",
    });
    return { code: r.status, out: `${r.stdout}\n${r.stderr}`, stderr: r.stderr };
  };

  return { root, bare, src, g, sha, marker, work, taskBranch, passLock, ciCheckout, runGate };
}

describe("REVIEW-GATE-fetch-parity: the named step evaluates on a depth-one checkout (D-292)", () => {
  it("(a) Tier 1 head with no review lock on origin fails closed with a verdict, not a fail-open", () => {
    const f = makeFixture();
    const head = f.taskBranch("T1", "agent/queue/t1");
    const r = f.runGate(f.ciCheckout(head), "agent/queue/t1", head);
    expect(r.stderr).not.toContain(COULD_NOT_RUN);
    expect(r.out).toContain(REVIEW_GATE_FAIL);
    expect(r.out).toContain("Nobody has reviewed T1 yet");
    expect(r.code).toBe(1);
  }, 60_000);

  it("(b) an independent pass naming the head on agent/review/t1 is fetched and read: exit 0, no false red", () => {
    const f = makeFixture();
    const head = f.taskBranch("T1", "agent/queue/t1");
    f.passLock("T1", "agent/review/t1", head);
    const r = f.runGate(f.ciCheckout(head), "agent/queue/t1", head);
    expect(r.stderr).not.toContain(COULD_NOT_RUN);
    expect(r.out).toContain("has an independent passing review");
    expect(r.code).toBe(0);
  }, 60_000);

  it("(c) a pass on an earlier head survives a merge of main, and does not survive one own commit", () => {
    const f = makeFixture();
    const reviewed = f.taskBranch("T1", "agent/queue/t1");
    f.passLock("T1", "agent/review/t1", reviewed);
    // main moves on.
    f.g(f.src, "checkout", "-q", "main");
    f.work("README.md", "fixture\nmain moved\n", "main: moves on");
    f.g(f.src, "push", "-q", "origin", "main");

    // Merge-of-main only: the pass stands.
    f.g(f.src, "checkout", "-q", "agent/queue/t1");
    f.g(f.src, "merge", "-q", "--no-ff", "-m", "Merge main into agent/queue/t1", "main");
    f.g(f.src, "push", "-q", "origin", "agent/queue/t1");
    const merged = f.sha();
    const kept = f.runGate(f.ciCheckout(merged), "agent/queue/t1", merged);
    expect(kept.stderr).not.toContain(COULD_NOT_RUN);
    expect(kept.out).toContain("has an independent passing review");
    expect(kept.code).toBe(0);

    // One non-merge commit of the branch's own after the reviewed head: the pass is void.
    f.work("notes/t1.txt", "T1 work\nmore\n", "T1: unreviewed change");
    f.g(f.src, "push", "-q", "origin", "agent/queue/t1");
    const changed = f.sha();
    const voided = f.runGate(f.ciCheckout(changed), "agent/queue/t1", changed);
    expect(voided.stderr).not.toContain(COULD_NOT_RUN);
    expect(voided.out).toContain(REVIEW_GATE_FAIL);
    expect(voided.out).toContain("1 commit(s) of the branch's own came after the reviewed commit");
    expect(voided.code).toBe(1);
  }, 90_000);

  it("(d) a Tier 2 row on a non-Tier-1 path passes after evaluating", () => {
    const f = makeFixture();
    const head = f.taskBranch("T2", "agent/queue/t2");
    const r = f.runGate(f.ciCheckout(head), "agent/queue/t2", head);
    expect(r.stderr).not.toContain(COULD_NOT_RUN);
    expect(r.out).not.toContain(REVIEW_GATE_FAIL);
    expect(r.code).toBe(0);
  }, 60_000);

  it("(e) origin unreachable is the only fail-open: exit 0, loudly", () => {
    const f = makeFixture();
    const head = f.taskBranch("T1", "agent/queue/t1");
    const ck = f.ciCheckout(head);
    const gone = join(f.root, "removed.git");
    f.g(ck, "remote", "set-url", "origin", `file://${gone}`);
    expect(existsSync(gone)).toBe(false);
    const r = f.runGate(ck, "agent/queue/t1", head);
    expect(r.stderr).toContain(COULD_NOT_RUN);
    expect(r.code).toBe(0);
  }, 60_000);

  it("(f) a complete clone that already has origin/main attempts no fetch and gets the same verdict as (a)", () => {
    const f = makeFixture();
    const head = f.taskBranch("T1", "agent/queue/t1");
    const full = join(f.root, "full");
    f.g(f.root, "clone", "-q", "--no-tags", `file://${f.bare}`, full);
    f.g(full, "checkout", "-q", "agent/queue/t1");
    expect(f.g(full, "rev-parse", "--is-shallow-repository")).toBe("false");
    const refs = () => f.g(full, "for-each-ref", "--format=%(refname) %(objectname)");
    const before = refs();
    const r = f.runGate(full, "agent/queue/t1", head);
    expect(refs()).toBe(before);
    expect(existsSync(join(full, ".git/FETCH_HEAD"))).toBe(false);
    expect(r.stderr).not.toContain(COULD_NOT_RUN);
    expect(r.out).toContain(REVIEW_GATE_FAIL);
    expect(r.out).toContain("Nobody has reviewed T1 yet");
    expect(r.code).toBe(1);
  }, 60_000);

  it("(g) ci.yml: the named step comes before Scope check, and Scope check is skipped when it fails", () => {
    const text = readFileSync(CI_YML, "utf8");
    const lines = text.split("\n");
    const jobStart = lines.findIndex(line => /^  check:\s*$/.test(line));
    expect(jobStart).toBeGreaterThanOrEqual(0);
    const jobEndRel = lines.slice(jobStart + 1).findIndex(line => /^  \S[^:]*:\s*$/.test(line));
    const job = lines.slice(jobStart, jobEndRel < 0 ? lines.length : jobStart + 1 + jobEndRel);
    expect(job.some(line => /^\s+name:\s*typecheck\s*$/.test(line))).toBe(true);
    const gateAt = job.findIndex(line => line.trim() === `- name: ${GATE_STEP}`);
    const scopeAt = job.findIndex(line => line.trim() === "- name: Scope check (declared file ownership)");
    expect(gateAt).toBeGreaterThanOrEqual(0);
    expect(scopeAt).toBeGreaterThan(gateAt);
    const scopeIf = job.slice(scopeAt + 1).find(line => /^\s+if:/.test(line) || /^\s+- name:/.test(line)) ?? "";
    expect(scopeIf).toMatch(/^\s+if:/);
    for (const fn of ["always()", "failure()", "!cancelled()", "cancelled()"]) expect(scopeIf).not.toContain(fn);
  });
});
