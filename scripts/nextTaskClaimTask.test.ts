// @vitest-environment node
// PICKER-claim-task (D-353 (2)): `--claim "<name>" --task <id>` runs the normal pick restricted to that one task,
// under the same red-main, ownership, dependency, lane and independence rules. It answers exactly what the full pick
// would answer if that task were the only candidate, or an INELIGIBLE refusal naming the reason the picker recorded;
// it never answers with another task's work or another task's landing-slot wait, and a refusal claims nothing.
import { describe, expect, it } from "vitest";
import { pickNextTask } from "./nextTaskCore.mjs";
import { argsOf, renderIneligible } from "./next-task.mjs";
import { renderPick } from "./nextTaskText.mjs";

const NOW = Date.parse("2026-11-17T10:00:00+05:30");
const HOUR = 3_600_000;
const HEAD = "a".repeat(40);
const mainGreen = { state: "green", sha: "c".repeat(40), url: "https://ci/main" };

type Marker = { verb: string; id: string; who: string; verdict?: string };
type Branch = { tipMs: number; tipSha?: string; merged: boolean; markers: Marker[] };
type Ci = { state: string; sha?: string; url?: string; gateOnly?: boolean };
type Report = { id: string; who: string; status: string; note?: string; at: number };
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `${id} title`,
  row: id,
  packet: "docs/plans/D-344-unblock.md",
  tier: 2,
  lane: id.toLowerCase(),
  branch: `agent/queue/${id.toLowerCase()}`,
  status: "todo",
  dependsOn: [] as string[],
  owns: [`scripts/${id.toLowerCase()}.mjs`],
  ...extra,
});
type Task = ReturnType<typeof task>;

const ME = "Claude Code · a971"; // a Claude session (no CEO review answers a restricted pick)
const OTHER = "Kimi · k1"; // a non-Claude session
const REVIEWER = "GPT-6.1 Sol · 12fe";
const SLOT_HOLDER = "GPT-6.1 Sol · fa4c";
const branchOf = (id: string) => `agent/queue/${id.toLowerCase()}`;
const lockOf = (id: string) => `agent/review/${id.toLowerCase()}`;
const prOf = (id: string): [string, string] => [branchOf(id), `https://github.com/o/r/pull/${1200 + id.length}`];
const work = (id: string, who: string, hoursAgo = 3, extra: Partial<Branch> = {}): [string, Branch] =>
  [branchOf(id), { tipMs: NOW - hoursAgo * HOUR, tipSha: HEAD, merged: false, markers: [{ verb: "Claim", id, who }], ...extra }];
const lock = (id: string, markers: Marker[], hoursAgo = 3): [string, Branch] => [lockOf(id), { tipMs: NOW - hoursAgo * HOUR, tipSha: "d".repeat(40), merged: false, markers }];
const slotHeld = (forId = "OTHER-LANDING", who = SLOT_HOLDER): [string, Branch] =>
  ["agent/queue/landing", { tipMs: NOW - 0.1 * HOUR, tipSha: "e".repeat(40), merged: false, markers: [{ verb: "Land claim", id: forId, who }] }];
const ciGreen: Ci = { state: "green", sha: HEAD };
const ciGateOnlyRed: Ci = { state: "red", sha: HEAD, url: "https://ci/run/9", gateOnly: true };

const pick = (tasks: Task[], opts: {
  branches?: [string, Branch][];
  prs?: [string, string][];
  prCi?: [string, Ci][];
  mainCi?: Ci;
  reports?: Report[];
  claimant?: string;
  avoid?: string[];
  only?: string;
}) => pickNextTask({
  tasks,
  mainCi: opts.mainCi ?? mainGreen,
  branches: new Map(opts.branches ?? []),
  openPrs: new Map(opts.prs ?? []),
  prCi: new Map(opts.prCi ?? []),
  mergedHeads: new Map(),
  reports: opts.reports ?? [],
  now: NOW,
  claimant: opts.claimant ?? ME,
  avoid: new Set(opts.avoid ?? []),
  register: null,
  ...(opts.only ? { only: opts.only } : {}),
});

// The board observed on Nov 17: ME holds its own green LANDING of GATE-rc (Tier 2) while another session holds the
// landing slot, and ME built SIGNIN (Tier 1), whose review by REVIEWER recorded findings; its CI is red only at the
// review gate. The full pick answers WAIT for the slot; `--task SIGNIN` must hand the findings fix.
const observed = () => ({
  tasks: [task("GATE-rc"), task("SIGNIN", { tier: 1, lane: "d048-auth", owns: ["client/src/pages/goal/sign-in/**"] })],
  branches: [
    work("GATE-rc", ME, 0.5),
    work("SIGNIN", ME, 0.5),
    lock("SIGNIN", [{ verb: "Review claim", id: "SIGNIN", who: REVIEWER }, { verb: "Verdict", id: "SIGNIN", who: REVIEWER, verdict: "findings" }], 0.5),
    slotHeld(),
  ],
  prs: [prOf("GATE-rc"), prOf("SIGNIN")],
  prCi: [[branchOf("GATE-rc"), ciGreen], [branchOf("SIGNIN"), ciGateOnlyRed]] as [string, Ci][],
});

describe("PICKER-claim-task: the restricted pick hands that task's own stage", () => {
  it("control: the full pick answers the observed landing-slot WAIT for ME's own GATE-rc landing", () => {
    expect(pick(observed().tasks, observed())).toMatchObject({ kind: "wait", landing: true, holder: SLOT_HOLDER });
  });

  it("observed bug: --task SIGNIN hands the findings FIX of SIGNIN, not the unrelated landing-slot wait", () => {
    const result = pick(observed().tasks, { ...observed(), only: "SIGNIN" });
    expect(result).toMatchObject({ kind: "fix", task: { id: "SIGNIN" }, lock: lockOf("SIGNIN") });
    expect(result).not.toHaveProperty("holds");
  });

  it("--task on the own landing that waits for the slot refuses with that task's slot holder, and claims nothing", () => {
    const result = pick(observed().tasks, { ...observed(), only: "GATE-rc" });
    expect(result).toMatchObject({ kind: "ineligible", task: { id: "GATE-rc" } });
    expect(result.reason).toContain(SLOT_HOLDER);
  });

  it("pending work ranked above is not handed: --task N hands N's build although L's landing is pending above it", () => {
    const tasks = [task("L"), task("N")];
    const opts = { branches: [work("L", OTHER, 3)], prs: [prOf("L")], prCi: [[branchOf("L"), ciGreen]] as [string, Ci][] };
    expect(pick(tasks, opts)).toMatchObject({ kind: "land", task: { id: "L" } });
    expect(pick(tasks, { ...opts, only: "N" })).toMatchObject({ kind: "build", task: { id: "N" } });
  });

  it("a stage the full pick would hand for the task alone is the same: a quiet claim is a TAKEOVER", () => {
    const result = pick([task("A"), task("T")], { branches: [work("T", OTHER, 3)], only: "T" });
    expect(result).toMatchObject({ kind: "takeover", task: { id: "T" }, from: OTHER });
  });

  it("your own claimed task comes back as CONTINUE", () => {
    const result = pick([task("A"), task("T")], { branches: [work("T", ME, 0.2)], only: "T" });
    expect(result).toMatchObject({ kind: "continue", of: "build", task: { id: "T" } });
  });
});

describe("PICKER-claim-task: an ineligible task is refused with the reason the picker recorded", () => {
  const refused = (result: { kind: string; reason?: string; task?: { id: string } }, id: string, text: string) => {
    expect(result).toMatchObject({ kind: "ineligible", task: { id } });
    expect(result.reason).toContain(text);
  };

  it("an unknown task id", () => {
    const result = pick([task("A")], { only: "NOPE" });
    expect(result).toMatchObject({ kind: "ineligible" });
    expect(result.reason).toContain("no task NOPE");
  });

  it("a done task", () => {
    refused(pick([task("A", { status: "done" })], { only: "A" }), "A", "done");
  });

  it("waits for a dependency (a Claude session is not handed work ahead)", () => {
    refused(pick([task("D"), task("T", { dependsOn: ["D"] })], { only: "T" }), "T", "waits for D");
  });

  it("D-315 holds for the task alone: a non-Claude session is handed it to build ahead of its dependency", () => {
    expect(pick([task("D"), task("T", { dependsOn: ["D"] })], { claimant: OTHER, only: "T" }))
      .toMatchObject({ kind: "build", task: { id: "T" }, ahead: ["D"] });
  });

  it("held by another session that is still pushing", () => {
    refused(pick([task("T")], { branches: [work("T", OTHER, 0.5)], only: "T" }), "T", `in progress by ${OTHER}`);
  });

  it("you built it: its review goes to another session (D-344 (1))", () => {
    const result = pick([task("T", { tier: 1 })], {
      branches: [work("T", ME, 3)], prs: [prOf("T")], prCi: [[branchOf("T"), ciGreen]], claimant: ME, only: "T",
    });
    refused(result, "T", "you built or fixed it");
  });

  it("its lane is held by a red earlier task (D-109)", () => {
    const tasks = [task("R", { lane: "shared" }), task("T", { lane: "shared" })];
    const result = pick(tasks, {
      branches: [work("R", OTHER, 0.5)], prs: [prOf("R")], prCi: [[branchOf("R"), { state: "red", sha: HEAD }]], only: "T",
    });
    refused(result, "T", "waits for red or blocked R");
  });

  it.each(["red", "blocked"])("keeps a quiet earlier %s task's lane held when excluding its pending action", status => {
    const tasks = [task("R", { lane: "shared" }), task("T", { lane: "shared" })];
    const opts = {
      branches: [work("R", OTHER, 3)],
      prs: [prOf("R")],
      prCi: [[branchOf("R"), status === "red" ? { state: "red", sha: HEAD } : ciGreen]] as [string, Ci][],
      reports: status === "blocked" ? [{ id: "R", who: REVIEWER, status, at: NOW - HOUR, note: "needs evidence" }] : [],
    };
    expect(pick(tasks, opts)).toMatchObject({ kind: status === "red" ? "green" : "unblock", task: { id: "R" } });
    expect(pick(tasks, { ...opts, avoid: ["R"] })).toMatchObject({
      kind: "ceo",
      skipped: expect.arrayContaining([{ id: "T", reason: "waits for red or blocked R (same lane or depends on it)" }]),
    });
    refused(pick(tasks, { ...opts, only: "T" }), "T", "waits for red or blocked R");
  });

  it("you asked to avoid it", () => {
    refused(pick([task("T")], { avoid: ["T"], only: "T" }), "T", "--avoid");
  });

  it("owner-parked", () => {
    refused(pick([task("T", { status: "owner" })], { only: "T" }), "T", "waits for the owner");
  });

  it("you reported it blocked: another session or the owner clears it (D-200)", () => {
    const reports = [{ id: "T", who: ME, status: "blocked", note: "needs the owner", at: NOW - HOUR }];
    refused(pick([task("T")], { branches: [work("T", OTHER, 3)], reports, only: "T" }), "T", "blocked");
  });
});

describe("PICKER-claim-task: red main keeps its rules", () => {
  const redMain = { state: "red", sha: "f".repeat(40), url: "https://ci/main/red" };

  it("red main nobody fixes: the fix comes first, so --task refuses rather than handing another task", () => {
    const result = pick([task("T")], { mainCi: redMain, only: "T" });
    expect(result).toMatchObject({ kind: "ineligible", task: { id: "T" } });
    expect(result.reason).toContain("main is red");
    // control: the full pick hands the fix of main
    expect(pick([task("T")], { mainCi: redMain })).toMatchObject({ kind: "fix-main" });
  });

  it("red main someone else fixes: non-landing work on the task is still handed, its landing is refused", () => {
    const fixing: [string, Branch] = ["agent/queue/fix-main-ffffffff", { tipMs: NOW - 0.2 * HOUR, tipSha: "1".repeat(40), merged: false, markers: [{ verb: "Claim", id: "fix-main-ffffffff", who: OTHER }] }];
    expect(pick([task("T")], { mainCi: redMain, branches: [fixing], only: "T" })).toMatchObject({ kind: "build", task: { id: "T" } });
    const landing = pick([task("L")], { mainCi: redMain, branches: [fixing, work("L", OTHER, 3)], prs: [prOf("L")], prCi: [[branchOf("L"), ciGreen]], only: "L" });
    expect(landing).toMatchObject({ kind: "ineligible", task: { id: "L" } });
    expect(landing.reason).toContain("main is red");
  });
});

describe("PICKER-claim-task: the command line", () => {
  it("--claim with --task parses both, and every other flag keeps its meaning", () => {
    expect(argsOf(["--claim", ME, "--task", "SIGNIN"])).toMatchObject({ claim: ME, task: "SIGNIN" });
    expect(argsOf(["--claim", ME])).not.toHaveProperty("task");
  });

  it("a successful preview keeps the requested task in its claim command", () => {
    const selected = pick([task("A"), task("B")], { only: "B" });
    const context = { who: ME, date: "2026-11-17", claimed: false };
    const text = renderPick(selected, { ...context, requestedTask: "B" });
    expect(text).toContain("NEXT: BUILD B");
    expect(text).toContain('Not claimed yet. To take it: node scripts/next-task.mjs --claim "<your model name>" --task B');
    expect(renderPick(selected, context)).toContain('Not claimed yet. To take it: node scripts/next-task.mjs --claim "<your model name>"\n');
  });

  it("a refusal prints the task, the reason and that nothing was claimed", () => {
    const text = renderIneligible({ kind: "ineligible", task: { id: "T" }, reason: "waits for D" }, ME);
    expect(text).toContain("NEXT: NOT ELIGIBLE");
    expect(text).toContain("T");
    expect(text).toContain("waits for D");
    expect(text).toContain("Nothing was claimed");
    expect(text).toContain(`--claim "${ME}"`);
  });
});
