// @vitest-environment node
// PICKER-packet-pass-red-recovery (D-307, packet docs/plans/PICKER-packet-pass-red-recovery.md).
// A Tier 1 architect packet whose exact-tip CI is red only at the review gate, whose review stage is
// `passed`, and whose review lock and work branch are genuinely quiet is handed the ordinary REVIEW again,
// because a CI re-run cannot clear a rejected lineage. Every other state keeps today's answer.
import { describe, expect, it } from "vitest";
import { IDLE_MS, pickNextTask, statusBoard } from "./nextTaskCore.mjs";

const NOW = Date.parse("2026-11-09T10:00:00+05:30");
const HOUR = 3_600_000;
const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const ARCH = "agent/architect/p";
const REVIEW = "agent/review/p";
const PR = "https://example.test/pr/878";

type Marker = { verb: string; id: string; who: string; verdict?: string };
type Branch = { tipMs: number; tipSha?: string; work?: boolean; merged: boolean; markers: Marker[] };

const task = (extra: Record<string, unknown> = {}) => ({
  id: "P", title: "packet", row: "P", packet: null, tier: 1, lane: "p",
  branch: "agent/queue/p", status: "architect", dependsOn: [] as string[], syncedTo: "D-001", ...extra,
});
const claim = { verb: "Claim", id: "P", who: "Writer · 1111" };
const archBranch = (extra: Partial<Branch> = {}): Branch => ({ tipMs: NOW - 3 * HOUR, tipSha: HEAD, work: true, merged: false, markers: [claim], ...extra });
const lockBranch = (markers: Marker[], ageMs = 3 * HOUR): Branch => ({ tipMs: NOW - ageMs, merged: false, markers });
const pass = { verb: "Verdict", id: "P", who: "Reviewer · 9", verdict: "pass" } as Marker;
const reviewClaim = { verb: "Review claim", id: "P", who: "Reviewer · 9" } as Marker;
const gateOnlyRed = { state: "red", gateOnly: true, sha: HEAD };

const pick = (extra: Record<string, unknown> = {}) =>
  pickNextTask({
    tasks: [task()],
    mainCi: { state: "green", sha: HEAD },
    branches: new Map<string, Branch>([[ARCH, archBranch()]]),
    openPrs: new Map([[ARCH, PR]]),
    prCi: new Map([[ARCH, gateOnlyRed]]),
    mergedHeads: new Map(),
    reports: [],
    now: NOW,
    claimant: "Fresh · 2222",
    register: [],
    ...extra,
  } as never);

const reviewLock = (markers: Marker[], ageMs?: number) => new Map<string, Branch>([[ARCH, archBranch()], [REVIEW, lockBranch(markers, ageMs)]]);

describe("PICKER-packet-pass-red-recovery: passed, gate-only-red, quiet packet", () => {
  it("(1) hands the ordinary REVIEW instead of a rerun-only skip", () => {
    const got = pick({ branches: reviewLock([reviewClaim, pass]) }) as { kind: string; work?: string; lock?: string; packet?: boolean; reason?: string };
    expect(got).toMatchObject({ kind: "review", work: ARCH, lock: REVIEW, packet: true });
    expect(String(got.reason ?? "")).not.toMatch(/re-run CI/);
  });

  it("(1b) keeps the rerun skip while the review lock is still active", () => {
    const got = pick({ branches: reviewLock([reviewClaim, pass], 1_000) }) as { kind: string; reason?: string };
    expect(got.kind).not.toBe("review");
    expect(JSON.stringify(got)).toMatch(/re-run CI/);
  });

  it("(1c) a post-review commit on the work branch keeps the stage alive, exactly like #878", () => {
    const fresh = new Map<string, Branch>([[ARCH, archBranch({ tipMs: NOW - 1_000, markers: [claim, { verb: "Land claim", id: "P", who: "Lander · 3" }] })], [REVIEW, lockBranch([reviewClaim, pass])]]);
    const got = pick({ branches: fresh }) as { kind: string };
    expect(got.kind).not.toBe("review");
  });

  it("(2) refuses builder, writer, takeover and fixer models, including other session tags of the same model", () => {
    for (const claimant of ["Writer · 1111", "Writer · aaaa"]) {
      expect((pick({ branches: reviewLock([reviewClaim, pass]), claimant }) as { kind: string }).kind).not.toBe("review");
    }
    const taken = new Map<string, Branch>([[ARCH, archBranch({ markers: [claim, { verb: "Takeover", id: "P", who: "Taker · 4" }] })], [REVIEW, lockBranch([reviewClaim, pass])]]);
    expect((pick({ branches: taken, claimant: "Taker · 9999" }) as { kind: string }).kind).not.toBe("review");
    const fixed = new Map<string, Branch>([[ARCH, archBranch()], [REVIEW, lockBranch([reviewClaim, { verb: "Fixed", id: "P", who: "Fixer · 7" }, pass])]]);
    expect((pick({ branches: fixed, claimant: "Fixer · 8888" }) as { kind: string }).kind).not.toBe("review");
  });

  it("(3) treats the quiet boundary exactly as the clock does (strictly greater than two hours)", () => {
    expect((pick({ branches: reviewLock([reviewClaim, pass], IDLE_MS) }) as { kind: string }).kind).not.toBe("review");
    expect((pick({ branches: reviewLock([reviewClaim, pass], IDLE_MS + 1) }) as { kind: string }).kind).toBe("review");
  });

  it("(4) keeps mixed, running, unknown, wrong-tip and unclassified CI closed", () => {
    const cases = [
      { state: "red", gateOnly: false, sha: HEAD },
      { state: "red", sha: HEAD },
      { state: "red", gateOnly: true, sha: OTHER },
      { state: "running", gateOnly: true, sha: HEAD },
      { state: "unknown" },
      { state: "error" },
    ];
    for (const ci of cases) {
      expect((pick({ branches: reviewLock([reviewClaim, pass]), prCi: new Map([[ARCH, ci]]) }) as { kind: string }).kind).not.toBe("review");
    }
  });

  it("(5) preserves the packet needs-review and quiet in-review hand-outs", () => {
    expect((pick({ branches: reviewLock([reviewClaim]) }) as { kind: string }).kind).toBe("review");
    expect((pick({ branches: reviewLock([reviewClaim], 1_000) }) as { kind: string }).kind).not.toBe("review");
  });

  it("(6) preserves landing, fixing, needs-fix, Tier 2/3 and owner rows", () => {
    const land = new Map<string, Branch>([[ARCH, archBranch()], [REVIEW, lockBranch([reviewClaim, pass, { verb: "Land claim", id: "P", who: "Lander · 3" }])]]);
    expect((pick({ branches: land }) as { kind: string }).kind).not.toBe("review");
    const fixing = new Map<string, Branch>([[ARCH, archBranch()], [REVIEW, lockBranch([{ verb: "Fix claim", id: "P", who: "Fixer · 7" }])]]);
    expect((pick({ branches: fixing }) as { kind: string }).kind).not.toBe("review");
    const needsFix = new Map<string, Branch>([[ARCH, archBranch()], [REVIEW, lockBranch([{ verb: "Verdict", id: "P", who: "Reviewer · 9", verdict: "findings" }])]]);
    expect((pick({ branches: needsFix }) as { kind: string }).kind).not.toBe("review");
    expect((pick({ tasks: [task({ tier: 2 })], branches: reviewLock([reviewClaim, pass]) }) as { kind: string }).kind).not.toBe("review");
    expect((pick({ tasks: [task({ status: "owner" })], branches: reviewLock([reviewClaim, pass]) }) as { kind: string }).kind).not.toBe("review");
  });

  it("(7) keeps dependencies and decision re-sync ahead of the routing", () => {
    expect((pick({ tasks: [task({ dependsOn: ["missing"] })], branches: reviewLock([reviewClaim, pass]) }) as { kind: string }).kind).not.toBe("review");
    const register = [{ id: "D-001", number: 1, affects: [] }, { id: "D-002", number: 2, date: "2026-11-09", decision: "sync", affects: ["P"] }];
    expect((pick({ branches: reviewLock([reviewClaim, pass]), register }) as { kind: string }).kind).toBe("resync");
  });

  it("(8) never lets a blocked report be cleared by this routing", () => {
    const blocked = [{ id: "P", status: "blocked", who: "Fresh · 2222", at: NOW - HOUR, note: "awaiting a ruling" }];
    const asBlocker = pick({ branches: reviewLock([reviewClaim, pass]), reports: blocked }) as { kind: string };
    expect(asBlocker.kind).not.toBe("review");
    const asOther = pick({ branches: reviewLock([reviewClaim, pass]), reports: blocked, claimant: "Another · 5151" }) as { kind: string; reason?: string };
    expect(asOther.kind).not.toBe("review");
    expect(String(asOther.reason ?? JSON.stringify(asOther))).toMatch(/blocked/);
    const board = statusBoard(pickInput({ branches: reviewLock([reviewClaim, pass]), reports: blocked }));
    expect(JSON.stringify(board)).toMatch(/blocked/);
  });
});

function pickInput(extra: Record<string, unknown>) {
  return {
    tasks: [task()],
    mainCi: { state: "green", sha: HEAD },
    branches: new Map<string, Branch>([[ARCH, archBranch()]]),
    openPrs: new Map([[ARCH, PR]]),
    prCi: new Map([[ARCH, gateOnlyRed]]),
    mergedHeads: new Map(),
    reports: [],
    now: NOW,
    register: [],
    ...extra,
  } as never;
}
