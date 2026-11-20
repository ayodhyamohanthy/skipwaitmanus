// @vitest-environment node
import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pickNextTask, reviewStateOf } from "./nextTaskCore.mjs";
import { renderPick } from "./nextTaskText.mjs";

const CLI = fileURLToPath(new URL("./next-task.mjs", import.meta.url));
const id = "PACKET";
const architect = "agent/architect/packet";
const review = "agent/review/packet";
const writer = "Writer · w2";
const earlierWriter = "Writer · w1";
const reviewer = "Reviewer · r1";
const fresh = "Writer · w3";
const pr = "https://example.test/pull/1";
const commit = "a".repeat(40);
const findingsCommit = "b".repeat(40);
const now = Date.parse("2026-11-14T12:00:00Z");
const task = { id, status: "architect", tier: 1, title: "Fixture packet", row: id, packet: "docs/plans/packet.md", branch: "agent/queue/packet", lane: "fixture", dependsOn: [], syncedTo: "D-001" };
const findings = { verb: "Verdict", id, who: reviewer, verdict: "findings", sha: findingsCommit, reviewed: commit };
const fixed = { verb: "Fixed", id, who: writer, body: `fixed ${commit}` };

type Marker = { verb: string; id: string; who: string; sha?: string; verdict?: string; body?: string };
function board(markers: Marker[], claimant = fresh, gateClear = false, ciState = "red") {
  const reviewRef = { markers, tipMs: now - 3 * 3600_000, merged: false };
  const archRef = {
    markers: [{ verb: "Claim", id, who: earlierWriter }, { verb: "Takeover", id, who: writer }],
    tipMs: now - 3 * 3600_000, tipSha: commit, merged: false, work: true,
  };
  const pick = pickNextTask({
    tasks: [task], mainCi: { state: "green", sha: commit }, branches: new Map([[architect, archRef], [review, reviewRef]]),
    openPrs: new Map([[architect, pr]]), prCi: new Map([[architect, { state: ciState, sha: commit, gateOnly: ciState === "red" }]]),
    prFacts: new Map([[architect, { tipSha: commit, paths: ["server/packetFixture.ts"], gateClear }]]),
    now, claimant, only: id,
  });
  return { pick, reviewRef };
}

function withOrigin(test: (f: OriginFixture) => void, options?: Options) {
  const root = mkdtempSync(join(tmpdir(), "packet-findings-exit-"));
  try { test(setupOrigin(root, options)); } finally { rmSync(root, { recursive: true, force: true }); }
}

type Options = { status?: string; verdict?: "findings" | "pass"; stage?: "Review claim" | "Land claim"; stale?: boolean; open?: boolean };
type OriginFixture = {
  git: (...args: string[]) => string;
  head: string;
  packet: string;
  workRef: string;
  runFixed: (who: string) => SpawnSyncReturns<string>;
  refs: () => string;
};
function setupOrigin(root: string, { status = "architect", verdict = "findings", stage, stale = false, open = true }: Options = {}): OriginFixture {
  const work = join(root, "work"), remote = join(root, "origin.git"), mock = join(root, "github.mjs");
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GH_TOKEN: "local-fixture", NODE_USE_ENV_PROXY: "1" };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: work, encoding: "utf8", stdio: "pipe", env }).trim();
  mkdirSync(join(work, "docs/plans"), { recursive: true });
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe", env });
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("remote", "add", "origin", remote);
  const packet = join(work, task.packet);
  writeFileSync(packet, "# Packet under review\n");
  writeFileSync(join(work, "docs/plans/assignments.json"), JSON.stringify({ version: 1, repo: "o/r", tasks: [{ ...task, status }] }));
  writeFileSync(join(work, "docs/DECISIONS.md"), [
    "# Decisions", "", "| ID | Date | Decision | Evidence | Notes | Status |", "|---|---|---|---|---|---|",
    "| D-001 | 2026-10-19 | **One** | e | — | adopted |",
    ...(stale ? [`| D-002 | 2026-10-20 | **Packet scope changed** | e | Affects tasks: ${id} | adopted |`] : []), "",
  ].join("\n"));
  git("add", "docs"); git("commit", "-m", "base"); git("push", "-u", "origin", "main");
  const workRef = status === "architect" ? architect : task.branch;
  git("switch", "-c", workRef);
  git("commit", "--allow-empty", "-m", `Claim ${id}: ${earlierWriter}`);
  writeFileSync(packet, "# Independent review starts here\n");
  git("commit", "-am", "Submit packet");
  const reviewed = git("rev-parse", "HEAD");
  git("commit", "--allow-empty", "-m", `Takeover ${id}: ${writer}`);
  writeFileSync(packet, "# Address recorded finding\n");
  git("commit", "-am", "Fix packet findings");
  const head = git("rev-parse", "HEAD");
  git("push", "-u", "origin", workRef);
  git("switch", "-c", review, "main");
  git("commit", "--allow-empty", "-m", `Review claim ${id}: ${reviewer}`);
  if (stage !== "Review claim") git("commit", "--allow-empty", "-m", `Verdict ${id}: ${verdict} — ${reviewer}`, "-m", `reviewed ${reviewed}`);
  if (stage === "Land claim") git("commit", "--allow-empty", "-m", `Land claim ${id}: Lander · l1`);
  git("push", "-u", "origin", review);
  git("switch", "main");
  const pulls = open ? [{ head: { ref: workRef, sha: head, repo: { full_name: "o/r" } }, html_url: pr }] : [];
  writeFileSync(mock, `
globalThis.fetch = async input => {
  const url = String(input);
  const json = url.includes('/actions/workflows/ci.yml/runs') ? { workflow_runs: [] }
    : url.includes('/pulls?state=open') ? ${JSON.stringify(pulls)}
    : url.includes('/pulls?state=closed') ? [] : undefined;
  if (json === undefined) throw new Error('Unexpected fixture request: ' + url);
  return { ok: true, json: async () => json };
};\n`);
  const runFixed = (who: string) => spawnSync(process.execPath, ["--import", mock, CLI, "--fixed", "--task", id, "--as", who], { cwd: work, env, encoding: "utf8" });
  const refs = () => git("ls-remote", "--heads", "origin");
  return { git, head, packet, workRef, runFixed, refs };
}

describe("packet findings exit", () => {
  it("names the findings and the command on both the takeover and continuation hand-outs", () => {
    for (const actor of [fresh, writer]) {
      const { pick } = board([findings], actor);
      expect(pick.of ?? pick.kind).toBe("architect");
      const text = renderPick(pick, { who: actor, date: "2026-11-14", claimed: true });
      expect(text).toContain(findingsCommit.slice(0, 8));
      expect(text).toContain(`--fixed --task ${id} --as "${actor}"`);
      expect(text).toContain("push");
    }
  });

  it("keeps a real independent review available when the current gate has not accepted the binding", () => {
    const { reviewRef, pick } = board([findings, fixed]);
    expect(reviewStateOf(reviewRef, id)).toBe("needs-review");
    expect(pick).toMatchObject({ kind: "review", packet: true, work: architect });
    for (const actor of [writer, earlierWriter]) expect(board([findings, fixed], actor).pick.kind).not.toBe("review");
  });

  it("waits for exact-head CI, not a re-review, when the gate already accepts the fix", () => {
    const { pick } = board([findings, fixed], fresh, true);
    expect(pick).toMatchObject({ kind: "ineligible", reason: expect.stringMatching(/fixed.*exact-head CI/i) });
    expect(board([findings, fixed], writer, true).pick).toMatchObject({ kind: "ineligible", reason: expect.stringMatching(/fixed.*exact-head CI/i) });
    expect(board([findings, fixed], fresh, true, "green").pick).toMatchObject({ kind: "land", packet: true });
  });

  it("binds Fixed to the open packet's actual tip, and only its current writer can publish it", () => {
    withOrigin(f => {
      const before = f.refs();
      for (const actor of [reviewer, earlierWriter, fresh]) expect(f.runFixed(actor).status).not.toBe(0);
      expect(f.refs()).toBe(before);
      const result = f.runFixed(writer);
      expect(result.status, result.stderr).toBe(0);
      expect(f.git("log", "-1", "--format=%s", `origin/${review}`)).toBe(`Fixed ${id}: ${writer}`);
      expect(f.git("log", "-1", "--format=%b", `origin/${review}`)).toBe(`fixed ${f.head}`);
      expect(f.git("rev-parse", `origin/${f.workRef}`)).toBe(f.head);
    });
  });

  it.each<Options>([{ status: "todo" }, { stage: "Review claim" }, { verdict: "pass" }, { verdict: "pass", stage: "Land claim" }, { open: false }])(
    "does not grant packet fix authority in the wrong state (%j)", options => {
      withOrigin(f => {
        const before = f.refs();
        expect(f.runFixed(writer).status).not.toBe(0);
        expect(f.refs()).toBe(before);
      }, options);
    },
  );

  it("refuses to record a fix for a packet re-sync or an unpublished correction", () => {
    withOrigin(f => {
      const before = f.refs(), result = f.runFixed(writer);
      expect(result.stderr).toMatch(/re-sync.*D-002/i);
      expect(f.refs()).toBe(before);
    }, { stale: true });
    withOrigin(f => {
      f.git("switch", f.workRef);
      writeFileSync(f.packet, "# More changes still unpublished\n");
      const before = f.refs(), result = f.runFixed(writer);
      expect(result.status).toBe(3);
      expect(result.stderr).toMatch(/not on origin/);
      expect(f.refs()).toBe(before);
    });
  });
});
