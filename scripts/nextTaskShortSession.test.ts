// @vitest-environment node
// PICKER-short-session (D-401): a session its client forced to end is continued under the same name, not orphaned.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { argsOf } from "./next-task.mjs";
import {
  LOOP_SESSION_ENV, RESUME_QUIET_MS, chooseSessionName, loopSessionName, modelOfSession, parseSessionRecords, recordSession,
  resumeDecision, sessionName,
} from "./nextTaskCore.mjs";
import { renderResumeCommand, renderSessionChoice } from "./nextTaskText.mjs";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const MIN = 60_000;
const OLD = "Claude Code · old1";
const record = (name = OLD, model = "Claude Code") => ({ [model]: { model, name, at: new Date(NOW - 30 * MIN).toISOString() } });

describe("resumeDecision (pure)", () => {
  const base = { requested: "Claude Code", newSession: false, records: record(), tag: "n3w0", now: NOW };

  it("reuses the recorded name when its claim was quiet 25 minutes", () => {
    expect(resumeDecision({ ...base, claims: [{ id: "A", movedAt: NOW - 25 * MIN }] }))
      .toEqual({ name: OLD, resumed: true, task: "A", quietMin: 25 });
  });
  it("mints a new tag when the claim moved 5 minutes ago", () => {
    expect(resumeDecision({ ...base, claims: [{ id: "A", movedAt: NOW - 5 * MIN }] }))
      .toEqual({ name: "Claude Code · n3w0", resumed: false });
  });
  it("mints when any held claim moved within 20 minutes, and the threshold is inclusive at 20", () => {
    expect(resumeDecision({ ...base, claims: [{ id: "A", movedAt: NOW - 50 * MIN }, { id: "B", movedAt: NOW - 3 * MIN }] }).resumed).toBe(false);
    expect(resumeDecision({ ...base, claims: [{ id: "A", movedAt: NOW - RESUME_QUIET_MS }] })).toMatchObject({ resumed: true, quietMin: 20 });
    expect(resumeDecision({ ...base, claims: [{ id: "A", movedAt: NOW - RESUME_QUIET_MS + 1 }] }).resumed).toBe(false);
  });
  it("mints when the recorded session holds no unfinished claim", () => {
    expect(resumeDecision({ ...base, claims: [] })).toEqual({ name: "Claude Code · n3w0", resumed: false });
  });
  it("mints for a different model", () => {
    expect(resumeDecision({ ...base, requested: "GPT-6 Sol", claims: [{ id: "A", movedAt: NOW - 25 * MIN }] }))
      .toEqual({ name: "GPT-6 Sol · n3w0", resumed: false });
  });
  it("--new-session always mints", () => {
    expect(resumeDecision({ ...base, newSession: true, claims: [{ id: "A", movedAt: NOW - 25 * MIN }] }))
      .toEqual({ name: "Claude Code · n3w0", resumed: false });
  });
  it("a tagged claim ignores the record", () => {
    expect(resumeDecision({ ...base, requested: "Claude Code · mine", claims: [{ id: "A", movedAt: NOW - 25 * MIN }] }))
      .toEqual({ name: "Claude Code · mine", resumed: false });
  });
  it("with no record at all it mints", () => {
    expect(resumeDecision({ ...base, records: {}, claims: [] })).toEqual({ name: "Claude Code · n3w0", resumed: false });
  });
});

describe("chooseSessionName over the loaded branch state", () => {
  const task = (id: string) => ({
    id, title: `${id} title`, row: id, packet: "docs/plans/x.md", tier: 2, lane: id,
    branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [] as string[],
  });
  const claimBranch = (who: string, id: string, minutesAgo: number) =>
    ({ tipMs: NOW - minutesAgo * MIN, tipSha: "a".repeat(40), merged: false, work: false, markers: [{ verb: "Claim", id, who }] });
  const input = (branches: [string, ReturnType<typeof claimBranch>][], extra: Record<string, unknown> = {}) => ({
    requested: "Claude Code", newSession: false, records: record(), tag: "n3w0", now: NOW,
    tasks: [task("A"), task("B")], branches: new Map(branches), openPrs: new Map(), ...extra,
  });

  it("resumes a work-branch claim quiet 25 minutes", () => {
    expect(chooseSessionName(input([["agent/queue/b", claimBranch(OLD, "B", 25)]]))).toEqual({ name: OLD, resumed: true, task: "B", quietMin: 25 });
  });
  it("a heartbeat by that name 5 minutes ago keeps the claim live, so a new tag is minted", () => {
    const hb = { ...claimBranch(OLD, "B", 5), markers: [{ verb: "Heartbeat", id: "B", who: OLD }] };
    expect(chooseSessionName(input([["agent/queue/b", claimBranch(OLD, "B", 25)], ["agent/heartbeat/b", hb]])).resumed).toBe(false);
  });
  it("another session's heartbeat does not count as the recorded session moving", () => {
    const hb = { ...claimBranch("Codex · x", "B", 5), markers: [{ verb: "Heartbeat", id: "B", who: "Codex · x" }] };
    expect(chooseSessionName(input([["agent/queue/b", claimBranch(OLD, "B", 25)], ["agent/heartbeat/b", hb]])).resumed).toBe(true);
  });
  it("a claim held by another session is not the recorded session's", () => {
    expect(chooseSessionName(input([["agent/queue/b", claimBranch("Codex · x", "B", 25)]])).resumed).toBe(false);
  });
  it("an architect lock held by the recorded session counts", () => {
    const tasks = [{ ...task("A"), status: "architect" }];
    expect(chooseSessionName(input([["agent/architect/a", claimBranch(OLD, "A", 40)]], { tasks })))
      .toEqual({ name: OLD, resumed: true, task: "A", quietMin: 40 });
  });
});

// PICKER-durable-session (D-415 (4)(a)): an agent loop's own name, passed to every run in SKIPWAIT_SESSION_NAME.
describe("loopSessionName (pure)", () => {
  const LOOP = "Claude Code · aa11";
  it("is the variable's name for a bare claim of the same model", () => {
    expect(LOOP_SESSION_ENV).toBe("SKIPWAIT_SESSION_NAME");
    const out = loopSessionName({ requested: "Claude Code", env: LOOP });
    expect(out).toMatchObject({ name: LOOP });
    expect(out?.line).toContain(`"${LOOP}"`);
    expect(out?.line).toContain("SKIPWAIT_SESSION_NAME");
  });
  it("does nothing when the variable is unset or empty, or the claim already names its session", () => {
    expect(loopSessionName({ requested: "Claude Code", env: undefined })).toBeNull();
    expect(loopSessionName({ requested: "Claude Code", env: "" })).toBeNull();
    expect(loopSessionName({ requested: "Claude Code · mine", env: LOOP })).toBeNull();
  });
  it("ignores a name for another model with one line", () => {
    const out = loopSessionName({ requested: "Claude Code", env: "GPT-6.1 Sol · ab12" });
    expect(out).not.toHaveProperty("name");
    expect(out?.ignored).toMatch(/SKIPWAIT_SESSION_NAME.*ignored.*D-401/);
    expect(out?.ignored).not.toContain("\n");
    expect(loopSessionName({ requested: "Claude", env: LOOP })?.ignored).toMatch(/ignored/);
  });
  it("ignores a malformed name with one line, never using any part of it", () => {
    for (const bad of ["Claude Code", "Claude Code · ", "Claude Code · a b", "Claude Code · aa11\n", " Claude Code · aa11", "Claude Code · aa11 · bb", `Claude Code · ${"x".repeat(60)}`]) {
      const out = loopSessionName({ requested: "Claude Code", env: bad });
      expect(out, bad).not.toHaveProperty("name");
      expect(out?.ignored, bad).toMatch(/SKIPWAIT_SESSION_NAME.*ignored/);
      expect(out?.ignored, bad).not.toMatch(/[\n\r]/);
    }
  });
  it("accepts the name the picker mints for a model too long to keep whole", () => {
    const long = "A model name that is long enough to be cut before its tag";
    expect(loopSessionName({ requested: long, env: sessionName(long, "aa11") })).toMatchObject({ name: sessionName(long, "aa11") });
  });
  it("--new-session asks for a separate session, so the loop's name is ignored with one line", () => {
    expect(loopSessionName({ requested: "Claude Code", newSession: true, env: LOOP })?.ignored).toMatch(/--new-session/);
  });
});

describe("session record file contract", () => {
  it("keeps one entry per model, newest wins, and drops malformed entries on read", () => {
    const one = recordSession({}, { model: "Claude Code", name: OLD, at: "2026-11-25T11:00:00.000Z" });
    const two = recordSession(one, { model: "Claude Code", name: "Claude Code · b2b2", at: "2026-11-25T11:30:00.000Z" });
    const three = recordSession(two, { model: "GPT-6 Sol", name: "GPT-6 Sol · c3c3", at: "2026-11-25T11:40:00.000Z" });
    expect(Object.keys(three)).toEqual(["Claude Code", "GPT-6 Sol"]);
    expect(three["Claude Code"].name).toBe("Claude Code · b2b2");
    expect(recordSession(three, { model: "Claude Code", name: OLD, at: "2026-11-25T10:00:00.000Z" })["Claude Code"].name).toBe("Claude Code · b2b2");
    expect(parseSessionRecords(JSON.stringify(three))).toEqual(three);
    expect(parseSessionRecords("not json")).toEqual({});
    expect(parseSessionRecords(JSON.stringify({ X: { model: "X", name: "Y · 1", at: "2026-11-25T11:00:00Z" }, Z: { model: "Z", name: 3 } }))).toEqual({});
  });
  it("the model of a session is its name before the tag", () => {
    expect(modelOfSession("Claude Code · 43c8")).toBe("Claude Code");
    expect(modelOfSession("Claude Code")).toBe("Claude Code");
  });
  it("--new-session is a flag that needs --claim", () => {
    expect(argsOf(["--claim", "Claude Code", "--new-session"])).toMatchObject({ claim: "Claude Code", newSession: true });
  });
  it("the printed lines name the resume command and the reason for resuming", () => {
    const resumed = renderSessionChoice({ name: OLD, resumed: true, task: "B", quietMin: 25 }, "Claude Code");
    expect(resumed).toContain(`Resuming as "${OLD}": B was quiet for 25 min (your client likely ended the conversation). Pass --new-session to start a separate session instead.`);
    expect(renderSessionChoice({ name: "Claude Code · n3w0", resumed: false }, "Claude Code")).toContain('Your session name is "Claude Code · n3w0"');
    // A name given with its tag prints nothing before the board, as before.
    expect(renderSessionChoice({ name: OLD, resumed: false }, OLD)).toBe("");
    expect(renderResumeCommand(OLD)).toBe(`If your client ends this conversation, start the next one with: node scripts/next-task.mjs --claim "${OLD}"`);
  });
});

// ---- The real CLI against local Git origins (pattern: scripts/nextTaskClaimTaskCli.test.ts). ----
const CLI = fileURLToPath(new URL("./next-task.mjs", import.meta.url));

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "short-session-cli-"));
  const work = path.join(dir, "work"), remote = path.join(dir, "origin.git"), mock = path.join(dir, "mock.mjs");
  mkdirSync(path.join(work, "docs/plans"), { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8", stdio: "pipe" }).trim();
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("remote", "add", "origin", remote);
  const task = (id: string) => ({
    id, title: `${id} title`, row: id, packet: "docs/plans/test.md", tier: 2, lane: id,
    branch: `agent/queue/${id.toLowerCase()}`, status: "todo", dependsOn: [], syncedTo: "D-001", owns: [`scripts/${id}.mjs`],
  });
  writeFileSync(path.join(work, "docs/plans/test.md"), "# Fixture\n");
  writeFileSync(path.join(work, "docs/plans/assignments.json"), JSON.stringify({ version: 1, repo: "o/r", tasks: [task("A"), task("B")] }));
  writeFileSync(path.join(work, "docs/DECISIONS.md"), [
    "# Decisions", "| ID | Date | Decision | Evidence | Notes | Status |",
    "|---|---|---|---|---|---|", "| D-001 | 2026-11-17 | Fixture | e | Affects tasks: none. | adopted |", "",
  ].join("\n"));
  git("add", "docs");
  git("commit", "-m", "fixture");
  git("push", "-u", "origin", "main");
  const head = git("rev-parse", "HEAD");
  writeFileSync(mock, `
const response = body => ({ ok: true, status: 200, json: async () => body });
globalThis.fetch = async input => {
  const url = String(input);
  if (url.includes('/runs?branch=main')) return response({ workflow_runs: [{
    status: 'completed', conclusion: 'success', head_sha: '${head}', updated_at: '2026-11-17T12:00:00Z',
  }] });
  if (url.includes('/pulls?state=open') || url.includes('/pulls?state=closed')) return response([]);
  throw Error('unexpected fetch: ' + url);
};
`);
  const commonDir = path.resolve(work, git("rev-parse", "--git-common-dir"));
  const recordFile = path.join(commonDir, "skipwait-sessions.json");
  /** Push a Claim marker for task A by `who`, committed `minutesAgo` minutes ago. */
  const claimA = (who: string, minutesAgo: number) => {
    const date = new Date(Date.now() - minutesAgo * MIN).toISOString();
    const sha = execFileSync("git", ["commit-tree", "origin/main^{tree}", "-p", "origin/main", "-m", `Claim A: ${who}`], {
      cwd: work, encoding: "utf8", env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
    }).trim();
    git("push", "-q", "origin", `${sha}:refs/heads/agent/queue/a`);
  };
  // The CLI runs on the real clock, so the record is written 30 real minutes ago.
  const remember = (name: string) => writeFileSync(recordFile, JSON.stringify({
    "Claude Code": { model: "Claude Code", name, at: new Date(Date.now() - 30 * MIN).toISOString() },
  }));
  // The suite itself may run inside an agent loop (PICKER-durable-session): only a test that sets the loop's name
  // passes one on, so every other run is a manual claim.
  const env = (extra: Record<string, string> = {}) => {
    const out: Record<string, string | undefined> = { ...process.env, NEXT_TASK_LIST_REF: "origin/main", NODE_USE_ENV_PROXY: "1", GH_TOKEN: "fixture-only", ...extra };
    if (!(LOOP_SESSION_ENV in extra)) delete out[LOOP_SESSION_ENV];
    return out;
  };
  const runWith = (extra: Record<string, string>, ...args: string[]) =>
    spawnSync(process.execPath, ["--import", mock, CLI, "--claim", ...args], { cwd: work, encoding: "utf8", env: env(extra) });
  const run = (...args: string[]) => runWith({}, ...args);
  return { dir, work, git, claimA, remember, recordFile, run, runWith, env, mock };
}

function withFixture(test: (f: ReturnType<typeof fixture>) => void) {
  const f = fixture();
  try { test(f); } finally { rmSync(f.dir, { recursive: true, force: true }); }
}

describe("bare --claim with local Git origins", () => {
  it("resumes a recorded session whose claim was quiet 25 minutes and hands it its own work", () => withFixture(f => {
    f.claimA(OLD, 25);
    f.remember(OLD);
    const result = f.run("Claude Code");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(new RegExp(`Resuming as "${OLD}": A was quiet for 2[56] min`));
    expect(result.stdout).toContain(`start the next one with: node scripts/next-task.mjs --claim "${OLD}"`);
    expect(result.stdout).toContain("CONTINUE");
    expect(result.stdout).not.toContain("Your session name is");
    // The record stays under the git common dir, names the resumed session, and the working tree stays clean.
    expect(JSON.parse(readFileSync(f.recordFile, "utf8"))["Claude Code"].name).toBe(OLD);
    expect(f.git("status", "--porcelain")).toBe("");
    expect(existsSync(path.join(f.work, "skipwait-sessions.json"))).toBe(false);
  }), 30_000);

  it("mints a new tag when the recorded session's claim moved 5 minutes ago, and records it", () => withFixture(f => {
    f.claimA(OLD, 5);
    f.remember(OLD);
    const result = f.run("Claude Code");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).not.toContain("Resuming as");
    const name = /Your session name is "([^"]+)"/.exec(result.stdout)?.[1];
    expect(name).toMatch(/^Claude Code · [0-9a-f]{4}$/);
    expect(name).not.toBe(OLD);
    expect(f.git("log", "-1", "--format=%s", "origin/agent/queue/b")).toBe(`Claim B: ${name}`);
    expect(JSON.parse(readFileSync(f.recordFile, "utf8"))["Claude Code"].name).toBe(name);
    expect(f.git("status", "--porcelain")).toBe("");
  }), 30_000);

  it("--new-session mints even when the recorded claim is quiet", () => withFixture(f => {
    f.claimA(OLD, 25);
    f.remember(OLD);
    const result = f.run("Claude Code", "--new-session");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).not.toContain("Resuming as");
    expect(result.stdout).toMatch(/Your session name is "Claude Code · [0-9a-f]{4}"/);
  }), 30_000);

  it("a first claim with no record writes one under the git common dir", () => withFixture(f => {
    const result = f.run("Claude Code");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const name = /Your session name is "([^"]+)"/.exec(result.stdout)?.[1];
    expect(result.stdout).toContain(`start the next one with: node scripts/next-task.mjs --claim "${name}"`);
    const saved = JSON.parse(readFileSync(f.recordFile, "utf8"));
    expect(saved["Claude Code"]).toMatchObject({ model: "Claude Code", name });
    expect(f.git("status", "--porcelain")).toBe("");
  }), 30_000);
});

// ---- PICKER-durable-session (D-415 (4)(a)): an agent loop's name, with local Git origins. ----
const LOOP_SCRIPT = fileURLToPath(new URL("./agent-loop.mjs", import.meta.url));
const LOOP_NAME = "Claude Code · aa11";
const loopLine = (name: string) => `Session name "${name}" from this agent loop`;
const count = (text: string, part: string) => text.split(part).length - 1;
/** Every marker subject on origin's work branch for task A, newest first. */
const markersOnA = (f: ReturnType<typeof fixture>) => {
  const tip = f.git("ls-remote", "origin", "refs/heads/agent/queue/a").split(/\s+/)[0];
  return tip ? f.git("log", "--format=%s", `main..${tip}`).split("\n") : [];
};
const exists = (f: ReturnType<typeof fixture>, ref: string) => f.git("ls-remote", "origin", ref) !== "";

describe("bare --claim inside an agent loop (SKIPWAIT_SESSION_NAME)", () => {
  it("an agent loop keeps one name across three runs, and each later run continues its claim instead of taking new work", () => withFixture(f => {
    const loop = spawnSync(process.execPath, [
      LOOP_SCRIPT, "--session", "Claude Code", "--max-runs", "3", "--prompt", "Claude Code", "--",
      process.execPath, "--import", f.mock, CLI, "--claim", "{prompt}",
    ], { cwd: f.work, encoding: "utf8", env: f.env(), timeout: 120_000 });
    expect(loop.status, loop.stdout + loop.stderr).toBe(0);
    const name = /session name "([^"]+)"/.exec(loop.stderr)?.[1] ?? "";
    expect(name).toMatch(/^Claude Code · [0-9a-f]{4}$/);
    expect(count(loop.stdout, loopLine(name))).toBe(3);
    expect(loop.stdout).not.toContain("Your session name is");
    expect(count(loop.stdout, "CONTINUE")).toBeGreaterThanOrEqual(2);
    // Run 1 claimed A; runs 2 and 3 kept it: no takeover, no second claim, no new work.
    const markers = markersOnA(f);
    expect(markers.at(-1)).toBe(`Claim A: ${name}`);
    for (const subject of markers) expect(subject.endsWith(`: ${name}`), subject).toBe(true);
    expect(markers.some(subject => subject.startsWith("Takeover"))).toBe(false);
    expect(exists(f, "refs/heads/agent/queue/b")).toBe(false);
    // The D-401 record names the loop's session too, and nothing reached the working tree.
    expect(JSON.parse(readFileSync(f.recordFile, "utf8"))["Claude Code"].name).toBe(name);
    expect(f.git("status", "--porcelain")).toBe("");
  }), 120_000);

  it("the loop's name continues its claim that moved a minute ago, where D-401 alone would mint a new tag", () => withFixture(f => {
    f.claimA(LOOP_NAME, 1);
    const result = f.runWith({ SKIPWAIT_SESSION_NAME: LOOP_NAME }, "Claude Code");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain(loopLine(LOOP_NAME));
    expect(result.stdout).toContain("CONTINUE");
    expect(result.stdout).not.toContain("Resuming as");
    expect(result.stdout).not.toContain("Your session name is");
    expect(result.stdout).toContain(`start the next one with: node scripts/next-task.mjs --claim "${LOOP_NAME}"`);
    expect(exists(f, "refs/heads/agent/queue/b")).toBe(false);
    expect(JSON.parse(readFileSync(f.recordFile, "utf8"))["Claude Code"].name).toBe(LOOP_NAME);
  }), 30_000);

  it("a name for another model is ignored with one line, and D-401 resumes the recorded session", () => withFixture(f => {
    f.claimA(OLD, 25);
    f.remember(OLD);
    const result = f.runWith({ SKIPWAIT_SESSION_NAME: "GPT-6.1 Sol · ab12" }, "Claude Code");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(count(result.stdout + result.stderr, "SKIPWAIT_SESSION_NAME")).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/SKIPWAIT_SESSION_NAME.*ignored/);
    expect(result.stdout).toMatch(new RegExp(`Resuming as "${OLD}": A was quiet for 2[56] min`));
    expect(result.stdout).not.toContain("GPT-6.1 Sol · ab12\" from this agent loop");
  }), 30_000);

  it("a malformed name is ignored with one line, and a fresh tag is minted as today", () => withFixture(f => {
    f.claimA(LOOP_NAME, 1);
    const result = f.runWith({ SKIPWAIT_SESSION_NAME: "Claude Code" }, "Claude Code");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(count(result.stdout + result.stderr, "SKIPWAIT_SESSION_NAME")).toBe(1);
    const name = /Your session name is "([^"]+)"/.exec(result.stdout)?.[1];
    expect(name).toMatch(/^Claude Code · [0-9a-f]{4}$/);
    expect(name).not.toBe(LOOP_NAME);
    expect(f.git("log", "-1", "--format=%s", "origin/agent/queue/b")).toBe(`Claim B: ${name}`);
  }), 30_000);

  it("a manual claim without the variable behaves exactly as today", () => withFixture(f => {
    f.claimA(LOOP_NAME, 1);
    const result = f.run("Claude Code");
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout + result.stderr).not.toContain("SKIPWAIT_SESSION_NAME");
    expect(result.stdout).not.toContain("from this agent loop");
    const name = /Your session name is "([^"]+)"/.exec(result.stdout)?.[1];
    expect(name).toMatch(/^Claude Code · [0-9a-f]{4}$/);
    expect(f.git("log", "-1", "--format=%s", "origin/agent/queue/b")).toBe(`Claim B: ${name}`);
    expect(markersOnA(f)).toEqual([`Claim A: ${LOOP_NAME}`]);
  }), 30_000);
});
