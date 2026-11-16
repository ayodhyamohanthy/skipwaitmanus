// PICKER-path-tier-review (D-353 (1), packet docs/plans/D-344-unblock.md row 8).
//
// The CI review gate asks for a review only where a pull request's changed paths compute Tier 1, or where a row
// declared Tier 1 touches server-side code (D-352 and the #1219 backstop). The picker used to read only the row's
// declared tier, so it handed out reviews the gate no longer needs. It also handed a re-review after a findings
// verdict and a Fixed marker bound to the head (D-344 (7)), and that re-review's own Review claim then became the
// newest marker the gate reads, which voided the pass (seen on #1176, Nov 16). These pin the picker to the gate's
// rule: the loader supplies each pull request's changed paths and whether the gate already clears its head.
import { describe, expect, it } from "vitest";
import { needsReview, pickNextTask, reviewNeeded, statusBoard } from "./nextTaskCore.mjs";
import { reviewGateViolation } from "./review-gate.mjs";
import { classifyTier } from "./tierClassifyCore.mjs";

const NOW = Date.parse("2026-11-16T20:00:00+05:30");
const HOUR = 3_600_000;
const HEAD = "a".repeat(40);
const mainGreen = { state: "green", sha: "c".repeat(40), url: "https://ci/main" };

type Marker = { verb: string; id: string; who: string; verdict?: string; body?: string; reviewed?: string | null };
type Branch = { tipMs: number; tipSha?: string; merged: boolean; markers: Marker[] };
type Facts = { tipSha: string; paths: unknown[] | null; gateClear: boolean };

const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `${id} title`,
  row: id,
  packet: "docs/plans/FND-1-toolchain-and-test-collection.md",
  tier: 1,
  lane: id.toLowerCase(),
  branch: `agent/queue/${id.toLowerCase()}`,
  status: "todo",
  dependsOn: [] as string[],
  owns: [`client/src/pages/${id.toLowerCase()}.tsx`],
  ...extra,
});

const BUILDER = "Codex · b1";
const REVIEWER = "GPT-6.1 Sol · r1";
const FIXER = "Claude Code · f1";
const ME = "Hark · me1";
const branchOf = (id: string) => `agent/queue/${id.toLowerCase()}`;
const lockOf = (id: string) => `agent/review/${id.toLowerCase()}`;
const built = (id: string): [string, Branch] => [branchOf(id), { tipMs: NOW - 3 * HOUR, tipSha: HEAD, merged: false, markers: [{ verb: "Claim", id, who: BUILDER }] }];
const greenCi = { state: "green", sha: HEAD, url: "https://ci/run/1" };
const CLIENT = ["client/src/pages/goal/inbox/GoalInbox.tsx", "client/src/lib/goalSurfaces.ts"];
const SERVER = ["client/src/pages/Ask.tsx", "server/companyDirectory.ts"];

// Findings by REVIEWER, then a Fixed marker by FIXER bound to HEAD (D-344 (7)).
const fixedLock = (id: string): [string, Branch] => [lockOf(id), {
  tipMs: NOW - 2 * HOUR, merged: false, markers: [
    { verb: "Review claim", id, who: REVIEWER },
    { verb: "Verdict", id, who: REVIEWER, verdict: "findings", reviewed: "e".repeat(40), body: `reviewed ${"e".repeat(40)}` },
    { verb: "Fix claim", id, who: FIXER },
    { verb: "Fixed", id, who: FIXER, body: `fixed ${HEAD}` },
  ],
}];

const input = (t: ReturnType<typeof task>, opts: { facts?: Facts | null; branches?: [string, Branch][]; claimant?: string } = {}) => ({
  tasks: [t],
  mainCi: mainGreen,
  branches: new Map(opts.branches ?? [built(t.id)]),
  openPrs: new Map([[branchOf(t.id), "https://github.com/o/r/pull/1"]]),
  prCi: new Map([[branchOf(t.id), greenCi]]),
  ...(opts.facts === null ? {} : { prFacts: new Map([[branchOf(t.id), opts.facts ?? { tipSha: HEAD, paths: CLIENT, gateClear: false }]]) }),
  mergedHeads: new Map(),
  reports: [],
  now: NOW,
  claimant: opts.claimant ?? ME,
  avoid: new Set<string>(),
  register: null,
});

describe("PICKER-path-tier-review: a review only where the changed paths need one (D-352, D-353 (1))", () => {
  it("a declared Tier 1 pull request whose paths are client-only is landed on green CI, not reviewed", () => {
    const pick = pickNextTask(input(task("UI-ONLY")));
    expect(pick.kind).toBe("land");
    expect(pick.tier1).toBe(false);
  });

  it("the same pull request with server-side paths still gets its review (the #1219 backstop)", () => {
    const pick = pickNextTask(input(task("SRV"), { facts: { tipSha: HEAD, paths: SERVER, gateClear: false } }));
    expect(pick.kind).toBe("review");
  });

  it("a declared Tier 2 row whose paths compute Tier 1 gets a review (GATE-tier-floor)", () => {
    const pick = pickNextTask(input(task("MONEY", { tier: 2 }), { facts: { tipSha: HEAD, paths: ["server/payments.ts"], gateClear: false } }));
    expect(pick.kind).toBe("review");
  });

  it("unknown paths fall back to the declared tier, as the gate does without a classifier", () => {
    expect(pickNextTask(input(task("UNKNOWN"), { facts: null })).kind).toBe("review");
    expect(pickNextTask(input(task("EMPTY"), { facts: { tipSha: HEAD, paths: [], gateClear: false } })).kind).toBe("review");
  });

  it("facts read for an older tip are ignored", () => {
    const pick = pickNextTask(input(task("STALE"), { facts: { tipSha: "d".repeat(40), paths: CLIENT, gateClear: false } }));
    expect(pick.kind).toBe("review");
  });
});

describe("PICKER-path-tier-review: no re-review after a bound Fixed marker (D-344 (7))", () => {
  const t = task("FIXED");
  const branches: [string, Branch][] = [built(t.id), fixedLock(t.id)];

  it("hands out the landing when the gate already clears the head", () => {
    const pick = pickNextTask(input(t, { branches, facts: { tipSha: HEAD, paths: SERVER, gateClear: true } }));
    expect(pick.kind).toBe("land");
    expect(pick.tier1).toBe(true);
  });

  it("never hands that landing to the session that fixed it", () => {
    const pick = pickNextTask(input(t, { branches, facts: { tipSha: HEAD, paths: SERVER, gateClear: true }, claimant: FIXER }));
    expect(pick.kind).not.toBe("land");
    expect(pick.kind).not.toBe("review");
  });

  it("still hands the re-review when the gate does not clear the head", () => {
    const pick = pickNextTask(input(t, { branches, facts: { tipSha: HEAD, paths: SERVER, gateClear: false } }));
    expect(pick.kind).toBe("review");
  });

  it("a head red only at the review gate goes back through CI, not to a re-review", () => {
    const pick = pickNextTask({ ...input(t, { branches, facts: { tipSha: HEAD, paths: SERVER, gateClear: true } }), prCi: new Map([[branchOf(t.id), { state: "red", sha: HEAD, url: "https://ci/run/2", gateOnly: true }]]) });
    expect(pick.kind).toBe("green");
    expect(pick.why).toContain("re-run");
  });
});

describe("PICKER-path-tier-review: the board shows a review state only where one is needed", () => {
  it("a client-only declared Tier 1 row shows no review state", () => {
    const t = task("BOARD");
    const { tasks, branches, openPrs, prCi, prFacts, mergedHeads, reports, now } = input(t);
    const rows = statusBoard({ tasks, branches, openPrs, prCi, prFacts, mergedHeads, reports, now });
    expect(rows[0].review ?? null).toBeNull();
  });
});

describe("PICKER-path-tier-review: the picker's rule is the CI gate's rule", () => {
  const cases: [number, unknown[]][] = [
    [1, CLIENT],
    [1, SERVER],
    [1, ["docs/plans/x.md"]],
    [1, ["shared/askNote.ts"]],
    [1, ["drizzle/0100_x.sql"]],
    [1, ["src/worker.ts"]],
    [2, ["server/payments.ts"]],
    [2, CLIENT],
    [2, ["server/companyDirectory.ts"]],
    [3, ["docs/plans/x.md"]],
    [1, [{ path: "server/db.ts", added: ["+  const x = 1;"], removed: [], context: ["listCompanies"] }]],
  ];
  for (const [tier, paths] of cases) {
    it(`declared Tier ${tier}, ${JSON.stringify(paths).slice(0, 60)}: picker and gate agree`, () => {
      const gateWants = reviewGateViolation({ task: { id: "T", tier }, head: HEAD, tierOf: (p: unknown[]) => classifyTier(p).tier, changedPaths: paths }) !== null;
      expect(reviewNeeded({ tier, paths })).toBe(gateWants);
      expect(needsReview({ task: { tier }, reviewPaths: paths })).toBe(gateWants);
    });
  }
});
