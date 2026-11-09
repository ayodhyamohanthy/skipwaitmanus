// PICKER-heartbeat-slot-safety (docs/plans/PICKER-heartbeat-slot-safety.md): a heartbeat renews the
// holder's own lease and never writes another lander's fresh landing slot. The real CLI runs against
// a disposable local origin (a bare repository in a temp folder); GitHub reads are answered by an
// injected fetch, so nothing reaches a real remote.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LAND_IDLE_MS, LAND_SLOT, markerSubject } from "./nextTaskCore.mjs";

const root = path.resolve(__dirname, "..");
const A = "Lander · a1";
const B = "Builder · b1";

type Slot = { holder: string; task: string; quiet?: boolean } | null;

function setup(slot: Slot, { raceOnRead = false } = {}) {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "next-task-hb-slot-"));
  const work = path.join(fixture, "work");
  const origin = path.join(fixture, "origin.git");
  const mock = path.join(fixture, "mock.mjs");
  const run = (args: string[], env: Record<string, string> = {}) => execFileSync("git", args, { cwd: work, encoding: "utf8", env: { ...process.env, ...env } }).trim();
  const bare = (args: string[], env: Record<string, string> = {}) => execFileSync("git", ["--git-dir", origin, ...args], { encoding: "utf8", env: { ...process.env, ...env } }).trim();
  mkdirSync(work, { recursive: true });
  execFileSync("git", ["init", "--bare", origin], { encoding: "utf8" });
  run(["init", "-b", "main"]);
  run(["config", "user.name", "Fixture"]);
  run(["config", "user.email", "fixture@example.test"]);
  run(["remote", "add", "origin", origin]);
  mkdirSync(path.join(work, "docs/plans"), { recursive: true });
  writeFileSync(path.join(work, "docs/plans/test.md"), "# fixture\n");
  writeFileSync(path.join(work, "docs/DECISIONS.md"), [
    "# Decisions", "", "| ID | Date | Decision | Evidence | Notes | Status |", "|---|---|---|---|---|---|",
    "| D-001 | 2026-10-19 | **One** | e | — | adopted |", "",
  ].join("\n"));
  const row = (id: string, branch: string) => ({ id, title: `Fixture task ${id}`, row: id, packet: "docs/plans/test.md", tier: 2, lane: id === "B" ? "process" : "picker", branch, status: "todo", dependsOn: [], syncedTo: "D-001" });
  writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({
    version: 1, repo: "o/r", tasks: [row("X", "agent/queue/x"), row("B", "agent/queue/b")],
  }, null, 2) + "\n");
  run(["add", "."]);
  run(["commit", "-m", "root"]);
  run(["push", "-q", "-u", "origin", "main"]);
  // B built task B (Tier 2) and its pull request is open: B's own stage is the LAND continuation.
  run(["switch", "-q", "-c", "agent/queue/b"]);
  run(["commit", "-q", "--allow-empty", "-m", markerSubject("Claim", "B", B)]);
  writeFileSync(path.join(work, "docs/plans/test.md"), "# fixture, built\n");
  run(["commit", "-q", "-am", "B: the work"]);
  run(["push", "-q", "-u", "origin", "agent/queue/b"]);
  const builtTip = run(["rev-parse", "agent/queue/b"]);
  run(["switch", "-q", "main"]);
  if (slot) {
    // The landing slot: one empty Land claim marker on main, fresh or older than LAND_IDLE_MS.
    const when = slot.quiet ? `${Math.floor((Date.now() - LAND_IDLE_MS - 10 * 60_000) / 1000)} +0000` : "";
    const env = when ? { GIT_COMMITTER_DATE: when, GIT_AUTHOR_DATE: when } : {};
    const main = run(["rev-parse", "main"]);
    const sha = run(["commit-tree", `${main}^{tree}`, "-p", main, "-m", markerSubject("Land claim", slot.task, slot.holder)], env);
    run(["push", "-q", "origin", `${sha}:refs/heads/${LAND_SLOT}`]);
  }
  // The competing lander: after the picker fetched (its view is now stale), A takes the free slot on origin.
  const race = raceOnRead ? `
let raced = false;
const competingPush = () => {
  if (raced) return;
  raced = true;
  const git = args => execFileSync('git', ['--git-dir', ${JSON.stringify(origin)}, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Lander', GIT_AUTHOR_EMAIL: 'a1@example.test', GIT_COMMITTER_NAME: 'Lander', GIT_COMMITTER_EMAIL: 'a1@example.test' } }).trim();
  const main = git(['rev-parse', 'refs/heads/main']);
  const sha = git(['commit-tree', main + '^{tree}', '-p', main, '-m', ${JSON.stringify(markerSubject("Land claim", "X", A))}]);
  git(['update-ref', 'refs/heads/${LAND_SLOT}', sha]);
};` : "const competingPush = () => {};";
  writeFileSync(mock, `
import { execFileSync } from 'node:child_process';
${race}
const response = body => ({ ok: true, status: 200, json: async () => body });
globalThis.fetch = async input => {
  const url = String(input);
  if (url.includes('/actions/workflows/ci.yml/runs')) return response({ workflow_runs: [{ id: 1, name: "CI", head_branch: "agent/queue/b", head_sha: "${builtTip}", status: "completed", conclusion: "success", html_url: "https://example.test/ci/1", created_at: new Date().toISOString() }] });
  if (url.includes('/pulls?state=open')) return response([{ head: { repo: { full_name: 'o/r' }, ref: 'agent/queue/b', sha: '${"0".repeat(40)}' }, html_url: 'https://example.test/pr/2' }]);
  if (url.includes('/pulls?state=closed')) { competingPush(); return response([]); }
  throw new Error('unexpected fetch: ' + url);
};
`);
  const picker = (args: string[]) => spawnSync(process.execPath, ["--import", mock, path.join(root, "scripts/next-task.mjs"), ...args], {
    cwd: work, encoding: "utf8", env: { ...process.env, GH_TOKEN: "fixture-not-real", NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: "", https_proxy: "" },
  });
  /** Every ref on origin with its tip, so a test can name exactly what a run wrote. */
  const refs = () => new Map(bare(["for-each-ref", "--format=%(refname) %(objectname)"]).split("\n").filter(Boolean).map(line => line.split(" ") as [string, string]));
  const subject = (ref: string) => bare(["log", "-1", "--format=%s", ref]);
  const subjectsSince = (ref: string, from: string) => bare(["log", "--format=%s", `${from}..${ref}`]).split("\n").filter(Boolean);
  const cleanup = () => rmSync(fixture, { recursive: true, force: true });
  return { picker, refs, subject, subjectsSince, cleanup };
}

const changed = (before: Map<string, string>, after: Map<string, string>) =>
  [...new Set([...before.keys(), ...after.keys()])].filter(ref => before.get(ref) !== after.get(ref)).sort();

describe("PICKER-heartbeat-slot-safety: --heartbeat and the landing slot", () => {
  it("red first: B heartbeats its own LAND stage while A holds a fresh slot; B's lease renews and A's slot is untouched", () => {
    const f = setup({ holder: A, task: "X" });
    try {
      const before = f.refs();
      const res = f.picker(["--heartbeat", "--as", B]);
      expect(res.status, res.stderr).toBe(0);
      const after = f.refs();
      // Exactly one ref moved: B's side heartbeat. No Land claim, Takeover or anything else on A's slot.
      expect(changed(before, after)).toEqual(["refs/heads/agent/heartbeat/b"]);
      expect(after.get(`refs/heads/${LAND_SLOT}`)).toBe(before.get(`refs/heads/${LAND_SLOT}`));
      expect(f.subject(`refs/heads/${LAND_SLOT}`)).toBe(markerSubject("Land claim", "X", A));
      expect(f.subject("refs/heads/agent/heartbeat/b")).toBe(markerSubject("Heartbeat", "B", B));
      expect(res.stdout).toContain("Heartbeat recorded: B stays yours");
    } finally {
      f.cleanup();
    }
  });

  it("control: the slot's own fresh holder renews without writing the slot again", () => {
    const f = setup({ holder: B, task: "B" });
    try {
      const before = f.refs();
      const res = f.picker(["--heartbeat", "--as", B]);
      expect(res.status, res.stderr).toBe(0);
      const after = f.refs();
      // Its LAND lease gets its side heartbeat and its landing-slot lease a Heartbeat marker; no new Land claim or Takeover.
      expect(changed(before, after)).toEqual(["refs/heads/agent/heartbeat/b", `refs/heads/${LAND_SLOT}`].sort());
      expect(f.subject("refs/heads/agent/heartbeat/b")).toBe(markerSubject("Heartbeat", "B", B));
      expect(f.subjectsSince(`refs/heads/${LAND_SLOT}`, before.get(`refs/heads/${LAND_SLOT}`)!)).toEqual([markerSubject("Heartbeat", "B", B)]);
    } finally {
      f.cleanup();
    }
  });

  it("control: a free slot is taken as today (one Land claim by B), then B's lease renews", () => {
    const f = setup(null);
    try {
      const before = f.refs();
      expect(before.has(`refs/heads/${LAND_SLOT}`)).toBe(false);
      const res = f.picker(["--heartbeat", "--as", B]);
      expect(res.status, res.stderr).toBe(0);
      const after = f.refs();
      expect(changed(before, after)).toEqual(["refs/heads/agent/heartbeat/b", `refs/heads/${LAND_SLOT}`].sort());
      expect(f.subject(`refs/heads/${LAND_SLOT}`)).toBe(markerSubject("Land claim", "B", B));
    } finally {
      f.cleanup();
    }
  });

  it("control: a quiet slot held by A keeps today's policy (one Land claim by B on top of it); expiry is not recorded as a handoff from A", () => {
    const f = setup({ holder: A, task: "X", quiet: true });
    try {
      const before = f.refs();
      const res = f.picker(["--heartbeat", "--as", B]);
      expect(res.status, res.stderr).toBe(0);
      const slotBefore = before.get(`refs/heads/${LAND_SLOT}`)!;
      // Exactly one new marker on the slot: B's own Land claim. No release, Landed or other marker in A's name.
      expect(f.subjectsSince(`refs/heads/${LAND_SLOT}`, slotBefore)).toEqual([markerSubject("Land claim", "B", B)]);
      expect(changed(before, f.refs())).toEqual(["refs/heads/agent/heartbeat/b", `refs/heads/${LAND_SLOT}`].sort());
    } finally {
      f.cleanup();
    }
  });

  it("a competing push after the read fails closed: no retry on top of the new holder and no lease written", () => {
    const f = setup(null, { raceOnRead: true });
    try {
      const res = f.picker(["--heartbeat", "--as", B]);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain("another agent took B first");
      const after = f.refs();
      // A's slot stands as A pushed it, with nothing of B's on top; B wrote no heartbeat either.
      expect(f.subject(`refs/heads/${LAND_SLOT}`)).toBe(markerSubject("Land claim", "X", A));
      expect(after.has("refs/heads/agent/heartbeat/b")).toBe(false);
    } finally {
      f.cleanup();
    }
  });
});
