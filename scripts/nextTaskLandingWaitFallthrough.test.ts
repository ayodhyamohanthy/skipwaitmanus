// @vitest-environment node
// PICKER-landing-wait-fallthrough (D-200): a pending landing that cannot start because another session holds the
// landing slot no longer ends pass 1. The claimant is handed the next eligible, disjoint work instead; the slot is
// never touched, no concurrent landing is handed out, and with nothing else eligible the answer is an honest WAIT
// naming the slot holder. An own LAND still waiting on the slot stays a wait (separate case, not broadened).
import { describe, expect, it } from "vitest";
import { pickNextTask } from "./nextTaskCore.mjs";

const NOW = Date.parse("2026-11-06T22:00:00+05:30");
const HOUR = 3_600_000;
const green = { state: "green", sha: "a".repeat(40), url: "https://ci/run/1" };

type Marker = { verb: string; id: string; who: string; verdict?: string };
type Branch = { tipSha?: string; tipMs: number; merged: boolean; markers: Marker[] };
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `${id} title`,
  row: id,
  packet: "docs/plans/FND-1-toolchain-and-test-collection.md",
  tier: 2,
  lane: id.toLowerCase(),
  branch: `agent/queue/${id.toLowerCase()}`,
  status: "todo",
  dependsOn: [] as string[],
  owns: [`scripts/${id.toLowerCase()}.mjs`],
  ...extra,
});

const BUILDER = "DeepSeek · b1";
const HOLDER = "Kimi · s1"; // holds the landing slot
const ME = "Hark · me1";

// A Tier 2 task built by BUILDER, idle for 3 hours, with a green open pull request: its next stage is LAND.
const built = (id: string, hoursAgo = 3): [string, Branch] => [`agent/queue/${id.toLowerCase()}`, { tipSha: "a".repeat(40), tipMs: NOW - hoursAgo * HOUR, merged: false, markers: [{ verb: "Claim", id, who: BUILDER }] }];
const pr = (id: string): [string, string] => [`agent/queue/${id.toLowerCase()}`, `https://github.com/o/r/pull/${id.length + 100}`];
const slotHeld = (id = "Z", who = HOLDER, hoursAgo = 0.1): [string, Branch] => ["agent/queue/landing", { tipSha: "a".repeat(40), tipMs: NOW - hoursAgo * HOUR, merged: false, markers: [{ verb: "Land claim", id, who }] }];

const pick = (tasks: ReturnType<typeof task>[], opts: {
  branches?: [string, Branch][];
  prs?: [string, string][];
  prCi?: [string, string][];
  mainCi?: { state: string; sha?: string; url?: string };
  claimant?: string;
}) => pickNextTask({
  tasks,
  mainCi: opts.mainCi ?? green,
  branches: new Map(opts.branches ?? []),
  openPrs: new Map(opts.prs ?? []),
  prCi: new Map((opts.prCi ?? []).map(([b, state]) => [b, { state, ...(state === "green" ? { sha: "a".repeat(40) } : {}) }])),
  mergedHeads: new Map(),
  reports: [],
  now: NOW,
  claimant: opts.claimant ?? ME,
  avoid: new Set(),
  register: null,
});

const greenPr = (id: string): [string, string] => [`agent/queue/${id.toLowerCase()}`, "green"];

describe("PICKER-landing-wait-fallthrough", () => {
  it("control: with the slot free, the pending green pull request L is handed out as a LAND", () => {
    expect(pick([task("L"), task("N")], { branches: [built("L")], prs: [pr("L")], prCi: [greenPr("L")] }))
      .toMatchObject({ kind: "land", task: { id: "L" } });
  });

  it("slot held by another session: the pending landing L does not end pass 1; disjoint eligible N is built", () => {
    const result = pick([task("L"), task("N")], { branches: [built("L"), slotHeld()], prs: [pr("L")], prCi: [greenPr("L")] });
    expect(result).toMatchObject({ kind: "build", task: { id: "N" } });
    expect(result).not.toHaveProperty("holds");
  });

  it("never hands a concurrent landing: two pending landings and a held slot still pass over both", () => {
    const result = pick([task("L"), task("L2"), task("N")], {
      branches: [built("L"), built("L2"), slotHeld()],
      prs: [pr("L"), pr("L2")],
      prCi: [greenPr("L"), greenPr("L2")],
    });
    expect(result).toMatchObject({ kind: "build", task: { id: "N" } });
    expect(result.kind).not.toBe("land");
  });

  it("other pending work below the blocked landing (a red pull request to make green) is handed out", () => {
    const result = pick([task("L"), task("G")], {
      branches: [built("L"), built("G", 5), slotHeld()],
      prs: [pr("L"), pr("G")],
      prCi: [greenPr("L"), ["agent/queue/g", "red"]],
    });
    expect(result).toMatchObject({ kind: "green", task: { id: "G" } });
  });

  it("control: nothing else eligible returns an honest WAIT naming the slot holder, the landing and the reason", () => {
    expect(pick([task("L")], { branches: [built("L"), slotHeld("Z")], prs: [pr("L")], prCi: [greenPr("L")] }))
      .toMatchObject({ kind: "wait", landing: true, holder: HOLDER, task: "Z", reason: expect.stringContaining(HOLDER) });
  });

  it("a dependent of the pending landing, a same-lane task and a same-files task stay held and are not handed out", () => {
    const tasks = [
      task("L"),
      task("D", { dependsOn: ["L"] }),
      task("S", { lane: "l", owns: [] }),
      task("F", { lane: "f", owns: ["scripts/l.mjs"] }),
    ];
    expect(pick(tasks, { branches: [built("L"), slotHeld()], prs: [pr("L")], prCi: [greenPr("L")] }))
      .toMatchObject({ kind: "wait", landing: true, holder: HOLDER });
  });

  it("work with no declared owns (ownership unknown) is not proven disjoint: the landing wait is kept", () => {
    const result = pick([task("L"), task("U", { owns: undefined })], { branches: [built("L"), slotHeld()], prs: [pr("L")], prCi: [greenPr("L")] });
    expect(result).toMatchObject({ kind: "wait", landing: true, holder: HOLDER });
  });

  it("work whose owns overlap the pending landing's is not handed out; the landing wait is kept", () => {
    const result = pick([task("L"), task("O", { lane: "o", owns: ["scripts/l.mjs"] })], { branches: [built("L"), slotHeld()], prs: [pr("L")], prCi: [greenPr("L")] });
    expect(result).toMatchObject({ kind: "wait", landing: true, holder: HOLDER });
  });

  it("keeps red-main precedence: a red main still returns its wait, not N", () => {
    const result = pick([task("L"), task("N")], {
      branches: [built("L"), slotHeld()],
      prs: [pr("L")],
      prCi: [greenPr("L")],
      mainCi: { state: "running-after-red" },
    });
    expect(result).toMatchObject({ kind: "wait", mainRed: true });
  });

  it("keeps blocked-lane holds: a red task above the landing still holds its own lane while N is handed out", () => {
    const result = pick([task("R"), task("R2", { lane: "r" }), task("L"), task("N")], {
      branches: [built("R", 0.5), built("L"), slotHeld()],
      prs: [pr("R"), pr("L")],
      prCi: [["agent/queue/r", "red"], greenPr("L")],
    });
    expect(result).toMatchObject({ kind: "build", task: { id: "N" } });
    expect(JSON.stringify(result)).not.toContain('"id":"R2"');
  });

  it("separate case: an own LAND waiting on the slot stays an honest WAIT even though N is eligible", () => {
    const own: [string, Branch] = ["agent/queue/m", { tipSha: "a".repeat(40), tipMs: NOW - 3 * HOUR, merged: false, markers: [{ verb: "Claim", id: "M", who: ME }] }];
    expect(pick([task("M"), task("N")], { branches: [own, slotHeld()], prs: [pr("M")], prCi: [greenPr("M")] }))
      .toMatchObject({ kind: "wait", landing: true, holder: HOLDER });
  });

  it("own unfinished work ranked below a blocked pending landing is not reordered: still the landing wait", () => {
    const own: [string, Branch] = ["agent/queue/m", { tipSha: "a".repeat(40), tipMs: NOW - 0.2 * HOUR, merged: false, markers: [{ verb: "Claim", id: "M", who: ME }] }];
    expect(pick([task("L"), task("M"), task("N")], { branches: [built("L"), own, slotHeld()], prs: [pr("L")], prCi: [greenPr("L")] }))
      .toMatchObject({ kind: "wait", landing: true, holder: HOLDER });
  });

  it("the quiet slot (idle past the landing timeout) is not a wait: the pending landing is handed out as before", () => {
    expect(pick([task("L"), task("N")], { branches: [built("L"), slotHeld("Z", HOLDER, 5)], prs: [pr("L")], prCi: [greenPr("L")] }))
      .toMatchObject({ kind: "land", task: { id: "L" } });
  });
});
