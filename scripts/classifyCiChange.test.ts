// CI-architect-real-checks (#748/#752): the marker fast path is decided by the
// complete diff between the SHAs the event pinned, never by a branch name, a
// title, a commit message or a label. Exactly zero changed files is the only
// fast path; every unknown, failed, missing or contradictory read is
// substantive, so a check that cannot be read runs the full required steps
// instead of silently passing.
//
// The packet's test matrix (docs/plans/CI-architect-real-checks.md) is pinned
// here by letter: A (pinned diff), B (empty markers), C (docs/registry),
// D (disguised runtime), E (missing, truncated or failed data), F (dependencies).
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classify,
  decide,
  fastPathFromCount,
  parseSha,
  readGitDiff,
  runCli,
} from "./classifyCiChange.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);

/** A diff read that succeeded: the complete file list plus the independent identical read. */
const read = (files: string[], identical = files.length === 0) => ({ ok: true, files, identical });
/** A diff read that could not be completed, for any reason. */
const unreadable = (reason = "git failed") => ({ ok: false, reason });

/** Every prefix the old branch-name skip covered, plus a plain task branch. */
const PREFIXES = [
  "agent/reports/log",
  "agent/review/d132-audit",
  "agent/heartbeat/d048-dark-mode",
  "agent/architect/d048-dark-mode",
  "agent/queue/landing",
  "agent/queue/ci-architect-real-checks",
];

describe("A: the verdict comes from the pinned diff", () => {
  it("A1: an empty diff on a pull request is the only marker fast path", () => {
    const verdict = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: read([]) });
    expect(verdict.markerOnly).toBe(true);
    expect(verdict.changedFiles).toBe(0);
    expect(verdict.reason).toContain("no file changed");
  });

  it("A2: any single changed file is substantive, whatever its path", () => {
    const paths = [
      "server/db.ts",
      "client/src/App.tsx",
      "shared/moneyCopy.ts",
      "docs/DECISIONS.md",
      "docs/plans/assignments.json",
      "docs/plans/CI-architect-real-checks.md",
      ".github/workflows/ci.yml",
      "scripts/classifyCiChange.mjs",
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig.json",
    ];
    for (const changed of paths) {
      const verdict = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: read([changed]) });
      expect(verdict.markerOnly, changed).toBe(false);
      expect(verdict.changedFiles, changed).toBe(1);
    }
  });

  it("A6: rename-only, mode-only, delete-only, binary and symlink changes are substantive", () => {
    // A rename without rename detection reads as a delete plus an add, which is
    // exactly what the classifier asks git for (--no-renames).
    for (const files of [
      ["docs/old.md", "docs/new.md"],
      ["scripts/run.sh"],
      ["docs/gone.md"],
      ["assets/logo.png"],
      ["docs/link"],
    ]) {
      expect(decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: read(files) }).markerOnly).toBe(false);
    }
  });

  it("A7: a capped or very large file list is substantive", () => {
    for (const count of [300, 301, 3000, 3001, 10_000]) {
      const files = Array.from({ length: count }, (_, i) => `docs/plans/report-${i}.md`);
      const verdict = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: read(files) });
      expect(verdict.markerOnly, String(count)).toBe(false);
      expect(verdict.changedFiles, String(count)).toBe(count);
    }
  });

  it("A3: the same pinned SHAs always produce the same verdict, whatever else moves", () => {
    const first = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: read([]) });
    const again = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: read([]) });
    expect(again).toEqual(first);
    // A different head is its own decision, and the old verdict never carries over.
    const newHead = decide({ eventName: "pull_request", base: SHA_A, head: SHA_C, diff: read(["docs/x.md"]) });
    expect(newHead.markerOnly).toBe(false);
  });
});

describe("B: true marker behaviour survives without a branch-name rule", () => {
  it("B1/B2/B3: an empty diff takes the fast path on every prefix and on a plain task branch", () => {
    for (const branch of PREFIXES) {
      const verdict = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: read([]), branch });
      expect(verdict.markerOnly, branch).toBe(true);
    }
  });

  it("B1: the report log's own marker commits stay cheap", () => {
    // #455 (agent/reports/log) is 357 empty marker commits: zero changed files.
    expect(decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: read([]), branch: "agent/reports/log" }).markerOnly).toBe(true);
  });
});

describe("C: substantive docs and registry changes run the full steps", () => {
  it("C1: #752's shape on an architect branch is substantive", () => {
    const verdict = decide({
      eventName: "pull_request",
      base: SHA_A,
      head: SHA_B,
      diff: read(["docs/plans/D-100-security-audit.md", "docs/plans/assignments.json"]),
      branch: "agent/architect/d100-security-audit",
    });
    expect(verdict.markerOnly).toBe(false);
    expect(verdict.changedFiles).toBe(2);
  });

  it("C2: #764's shape is substantive", () => {
    const verdict = decide({
      eventName: "pull_request",
      base: SHA_A,
      head: SHA_B,
      diff: read(["docs/DECISIONS.md", "docs/plans/D-048-dark-mode.md", "docs/plans/assignments.json"]),
      branch: "agent/architect/d048-dark-mode",
    });
    expect(verdict.markerOnly).toBe(false);
  });

  it("C4: a docs-only change is substantive on every marker prefix", () => {
    for (const branch of PREFIXES) {
      const verdict = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: read(["docs/DECISIONS.md"]), branch });
      expect(verdict.markerOnly, branch).toBe(false);
    }
  });
});

describe("D: the decision never trusts anything the pull request wrote", () => {
  it("D1: a runtime change under every marker prefix is substantive", () => {
    for (const branch of PREFIXES) {
      const verdict = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: read(["server/db.ts"]), branch });
      expect(verdict.markerOnly, branch).toBe(false);
    }
  });

  it("D3: a title, message, label or branch name claiming to be a marker is ignored", () => {
    const verdict = decide({
      eventName: "pull_request",
      base: SHA_A,
      head: SHA_B,
      diff: read(["server/privateReferralRoutes.ts"]),
      branch: "agent/reports/log",
      title: "docs: marker only [skip ci]",
      message: "[skip ci] marker",
      labels: ["marker", "docs-only"],
    });
    expect(verdict.markerOnly).toBe(false);
  });

  it("D4: a runtime file moved into docs/ still counts both paths", () => {
    const verdict = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: read(["docs/db.ts", "server/db.ts"]) });
    expect(verdict.markerOnly).toBe(false);
    expect(verdict.changedFiles).toBe(2);
  });
});

describe("E: missing, malformed, truncated or failed data is never an empty list", () => {
  it("E1: an unreadable diff is substantive", () => {
    const verdict = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: unreadable("shallow checkout") });
    expect(verdict.markerOnly).toBe(false);
    expect(verdict.reason).toContain("could not be read");
  });

  it("E2: a missing, null or malformed SHA is substantive", () => {
    for (const [base, head] of [
      ["", SHA_B],
      [SHA_A, ""],
      [undefined, SHA_B],
      [SHA_A, null],
      ["main", SHA_B],
      [SHA_A, "abc123"],
      [SHA_A, SHA_A],
      [`${SHA_A.slice(0, 39)}g`, SHA_B],
    ] as Array<[unknown, unknown]>) {
      const verdict = decide({ eventName: "pull_request", base, head, diff: read([]) });
      expect(verdict.markerOnly, `${String(base)}..${String(head)}`).toBe(false);
    }
  });

  it("E4: no HTTP or pagination read can ever be mistaken for zero files", () => {
    // The classifier reads git objects, never the pull-request files API, so a
    // 403, 404, 422, 5xx, rate limit, timeout, non-JSON body, missing page or a
    // capped list cannot become an empty list. The only reader is injected here.
    const verdict = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: unreadable("API 403") });
    expect(verdict.markerOnly).toBe(false);
  });

  it("E5: a crash or non-zero exit from git is substantive", () => {
    const verdict = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: unreadable("git exited 128") });
    expect(verdict.markerOnly).toBe(false);
  });

  it("E6: two reads that disagree are substantive, never an empty list", () => {
    // An empty name list against a tree that git says differs is the truncated
    // read case; a name list against an identical tree is the contradictory case.
    const truncated = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: { ok: true, files: [], identical: false } });
    expect(truncated.markerOnly).toBe(false);
    expect(truncated.reason).toContain("disagree");
    const contradictory = decide({ eventName: "pull_request", base: SHA_A, head: SHA_B, diff: { ok: true, files: ["docs/a.md"], identical: true } });
    expect(contradictory.markerOnly).toBe(false);
    expect(contradictory.reason).toContain("disagree");
  });

  it("E7: a push, a dispatch, or an unknown event never takes the fast path", () => {
    for (const eventName of ["push", "workflow_dispatch", "schedule", "", undefined]) {
      const verdict = decide({ eventName, base: SHA_A, head: SHA_B, diff: read([]) });
      expect(verdict.markerOnly, String(eventName)).toBe(false);
      expect(verdict.reason).toContain("not a pull request");
    }
  });
});

describe("E3: the changed-file count is only a count when it is the number zero", () => {
  it("accepts exactly the number 0", () => {
    expect(fastPathFromCount(0)).toBe(true);
  });

  it("rejects everything else, including the string \"0\"", () => {
    for (const value of ["0", " 0", "", null, undefined, -0.5, -1, Number.NaN, Number.POSITIVE_INFINITY, false, true, [], {}, "zero", 1]) {
      expect(fastPathFromCount(value), JSON.stringify(value) ?? String(value)).toBe(false);
    }
  });
});

describe("parseSha: only a pinned full-length commit id is a SHA", () => {
  it("accepts a 40 or 64 character lowercase hex id", () => {
    expect(parseSha(SHA_A)).toBe(SHA_A);
    expect(parseSha("f".repeat(64))).toBe("f".repeat(64));
  });

  it("rejects a branch name, a short id, an upper-case id and anything else", () => {
    for (const value of ["main", "HEAD", SHA_A.slice(0, 7), SHA_A.toUpperCase(), `${SHA_A}0`, 0, null, undefined, {}]) {
      expect(parseSha(value), String(value)).toBe(null);
    }
  });
});

describe("classify: the workflow environment maps onto the same rule", () => {
  it("reads a pull request's pinned SHAs from the environment", () => {
    const verdict = classify({ GITHUB_EVENT_NAME: "pull_request", BASE_SHA: SHA_A, HEAD_SHA: SHA_B }, () => read([]));
    expect(verdict.markerOnly).toBe(true);
  });

  it("a push to main is substantive even when nothing changed", () => {
    const verdict = classify({ GITHUB_EVENT_NAME: "push" }, () => read([]));
    expect(verdict.markerOnly).toBe(false);
  });

  it("an absent environment is substantive, not a crash", () => {
    expect(classify({}, () => read([])).markerOnly).toBe(false);
    expect(classify(undefined as unknown as Record<string, string>, () => read([])).markerOnly).toBe(false);
  });
});

describe("runCli: --expect-substantive fails a running job whose diff is empty", () => {
  const run = () => read([]);
  const env = { GITHUB_EVENT_NAME: "pull_request", BASE_SHA: SHA_A, HEAD_SHA: SHA_B };

  it("prints the GitHub-output keys and exits 0 for a substantive change", () => {
    let out = "";
    const code = runCli([], env, () => read(["docs/DECISIONS.md"]), (chunk: string) => { out += chunk; });
    expect(code).toBe(0);
    expect(out).toContain("marker_only=false");
    expect(out).toContain("changed_files=1");
    expect(out.trim().split("\n").every(line => /^[a-z_]+=/.test(line))).toBe(true);
  });

  it("exits 1 when a required job is running but the diff is empty", () => {
    let out = "";
    const code = runCli(["--expect-substantive"], env, run, (chunk: string) => { out += chunk; });
    expect(code).toBe(1);
    expect(out).toContain("marker_only=true");
  });

  it("exits 0 on an unreadable diff so the full steps still run", () => {
    const code = runCli(["--expect-substantive"], env, () => unreadable("no merge base"), () => {});
    expect(code).toBe(0);
  });

  it("never fails a push or a dispatch", () => {
    expect(runCli(["--expect-substantive"], { GITHUB_EVENT_NAME: "push" }, run, () => {})).toBe(0);
  });
});

describe("readGitDiff: the real reader against real repositories", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  function repo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "classify-ci-"));
    dirs.push(dir);
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git("init", "-b", "main");
    git("config", "user.email", "ci@example.invalid");
    git("config", "user.name", "CI");
    git("config", "commit.gpgsign", "false");
    fs.writeFileSync(path.join(dir, "README.md"), "base\n");
    git("add", "-A");
    git("commit", "-m", "base");
    const base = git("rev-parse", "HEAD");
    return { dir, git, base };
  }

  const runner = (dir: string) => (args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  it("A1/B2: an empty marker commit reads as zero changed files", () => {
    const { dir, git, base } = repo();
    git("commit", "--allow-empty", "-m", "Heartbeat D-048-dark-mode");
    const head = git("rev-parse", "HEAD");
    const diff = readGitDiff(base, head, runner(dir));
    expect(diff.ok).toBe(true);
    expect(diff.ok && diff.files).toEqual([]);
    expect(diff.ok && diff.identical).toBe(true);
    expect(decide({ eventName: "pull_request", base, head, diff }).markerOnly).toBe(true);
  });

  it("A5: a change that is reverted nets to the fast path", () => {
    const { dir, git, base } = repo();
    fs.writeFileSync(path.join(dir, "README.md"), "changed\n");
    git("commit", "-am", "change");
    fs.writeFileSync(path.join(dir, "README.md"), "base\n");
    git("commit", "-am", "revert");
    const head = git("rev-parse", "HEAD");
    expect(decide({ eventName: "pull_request", base, head, diff: readGitDiff(base, head, runner(dir)) }).markerOnly).toBe(true);
  });

  it("A2/A6: a modified, renamed, deleted or mode-only file is substantive", () => {
    const { dir, git, base } = repo();
    fs.writeFileSync(path.join(dir, "moved.md"), "x\n");
    git("add", "-A");
    git("commit", "-m", "add");
    git("mv", "moved.md", "renamed.md");
    git("commit", "-m", "rename");
    const head = git("rev-parse", "HEAD");
    const diff = readGitDiff(base, head, runner(dir));
    expect(diff.ok).toBe(true);
    expect(diff.ok && diff.files.length).toBeGreaterThan(0);
    expect(decide({ eventName: "pull_request", base, head, diff }).markerOnly).toBe(false);

    const { dir: dir2, git: git2, base: base2 } = repo();
    fs.chmodSync(path.join(dir2, "README.md"), 0o755);
    git2("commit", "-am", "mode only");
    const head2 = git2("rev-parse", "HEAD");
    expect(decide({ eventName: "pull_request", base: base2, head: head2, diff: readGitDiff(base2, head2, runner(dir2)) }).markerOnly).toBe(false);
  });

  it("A3: a base that moves afterwards does not change the verdict for the pinned pair", () => {
    const { dir, git, base } = repo();
    git("commit", "--allow-empty", "-m", "marker");
    const head = git("rev-parse", "HEAD");
    const before = decide({ eventName: "pull_request", base, head, diff: readGitDiff(base, head, runner(dir)) });
    fs.writeFileSync(path.join(dir, "later.md"), "later\n");
    git("add", "-A");
    git("commit", "-m", "base moves");
    const movedBase = git("rev-parse", "HEAD");
    const after = decide({ eventName: "pull_request", base, head, diff: readGitDiff(base, head, runner(dir)) });
    expect(after).toEqual(before);
    expect(before.markerOnly).toBe(true);
    // The same head against the moved base is still its own marker decision.
    expect(decide({ eventName: "pull_request", base: movedBase, head, diff: readGitDiff(movedBase, head, runner(dir)) }).markerOnly).toBe(true);
  });

  it("E1: a shallow checkout with no merge base is unreadable, never empty", () => {
    const { dir, git, base } = repo();
    // A second commit, so the shallow clone's tip is not the pinned base and the
    // base object is genuinely absent from the clone.
    git("commit", "--allow-empty", "-m", "later");
    const shallowParent = fs.mkdtempSync(path.join(os.tmpdir(), "classify-ci-shallow-"));
    dirs.push(shallowParent);
    const shallow = path.join(shallowParent, "clone");
    execFileSync("git", ["clone", "--depth=1", `file://${dir}`, shallow], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: shallow, encoding: "utf8" }).trim();
    const diff = readGitDiff(base, head, runner(shallow));
    expect(diff.ok).toBe(false);
    expect(decide({ eventName: "pull_request", base, head, diff }).markerOnly).toBe(false);
  });

  it("E5: a missing object or a git crash is unreadable", () => {
    const { dir, base } = repo();
    const diff = readGitDiff(base, "f".repeat(40), runner(dir));
    expect(diff.ok).toBe(false);
    const crashed = readGitDiff(base, base, () => {
      throw Object.assign(new Error("git exited 128"), { status: 128 });
    });
    expect(crashed.ok).toBe(false);
  });
});
