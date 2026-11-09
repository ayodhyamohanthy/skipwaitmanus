// @vitest-environment node
// PICKER-packet-pass-red-recovery (D-307): focused tests for the bounded state the D-307
// correction admits — an architect-status Tier 1 packet, open PR, exact-tip completed CI red
// only at the review gate, review stage "passed", and a genuinely quiet review lock — routes
// back to the ordinary REVIEW hand-out, while every other state stays closed.
import { IDLE_MS, pickNextTask, statusBoard } from "./nextTaskCore.mjs";
import { describe, expect, it } from "vitest";

const NOW = Date.parse("2026-11-09T04:00:00+05:30"), HOUR = 3600000;
const HEAD = "a".repeat(40), ARCH = "agent/architect/p", REVIEW = "agent/review/p", PR = "https://example.test/pr/1";
const task = { id: "P", title: "packet", row: "P", packet: null, tier: 1, lane: "p", branch: "agent/queue/p", status: "architect", dependsOn: [], syncedTo: "D-001" };
const arch = { tipMs: NOW - 3 * HOUR, tipSha: HEAD, work: true, merged: false, markers: [{ verb: "Claim", id: "P", who: "Writer · 1111" }] };
const ci = { state: "red", gateOnly: true, sha: HEAD };
const lock = (markers: object[], age = 3 * HOUR) => ({ tipMs: NOW - age, merged: false, markers });
const claim = { verb: "Review claim", id: "P", who: "Other · 1" };
const pass = { verb: "Verdict", id: "P", who: "Other · 1", verdict: "pass" };
const input = (extra: Record<string, unknown> = {}) => ({ tasks: [task], mainCi: { state: "green", sha: HEAD }, branches: new Map([[ARCH, arch]]), openPrs: new Map([[ARCH, PR]]), prCi: new Map([[ARCH, ci]]), mergedHeads: new Map(), reports: [], now: NOW, claimant: "Reviewer · 2222", register: [], ...extra });
const pick = (extra: Record<string, unknown> = {}) => pickNextTask(input(extra));

describe("PICKER-packet-pass-red-recovery (D-307)", () => {
  it("admits a passed gate-only exact-tip packet with a quiet lock to ordinary REVIEW", () => {
    expect(pick({ branches: new Map([[ARCH, arch], [REVIEW, lock([claim, pass])]]) }))
      .toMatchObject({ kind: "review", work: ARCH, lock: REVIEW, packet: true });
  });
  it("rejects a writer claimant even when the passed lock is quiet", () => {
    const got = pick({ claimant: "Writer · 1111", branches: new Map([[ARCH, arch], [REVIEW, lock([claim, pass])]]) });
    expect(got.kind).not.toBe("review");
  });
  it("rejects a fixer claimant even when the passed lock is quiet", () => {
    const branches = new Map([[ARCH, arch], [REVIEW, lock([{ verb: "Fix claim", id: "P", who: "Fixer · 7" }, claim, { ...pass, who: "Fixer · 7" }])]]);
    const got = pick({ claimant: "Fixer · 7", branches });
    expect(got.kind).not.toBe("review");
    expect(JSON.stringify(got)).toMatch(/wrote or fixed/);
  });
  it("keeps an active passed lock held: no REVIEW at or before the quiet boundary", () => {
    for (const age of [IDLE_MS, IDLE_MS - 1, IDLE_MS - HOUR / 2]) {
      const got = pick({ branches: new Map([[ARCH, arch], [REVIEW, lock([claim, pass], age)]]) });
      expect(got.kind).not.toBe("review");
      expect(JSON.stringify(got)).toMatch(/re-run CI/);
    }
  });
  it("keeps mixed red, unknown, wrong-tip, running and unclassified CI closed", () => {
    const lockWith = lock([claim, pass]);
    for (const c of [
      { ...ci, gateOnly: false }, { state: "red", sha: HEAD }, { ...ci, sha: "b".repeat(40) },
      { ...ci, state: "running" }, { ...ci, state: "running-after-red" }, { ...ci, state: "error" }, { ...ci, state: "unknown" },
    ]) {
      expect(pick({ prCi: new Map([[ARCH, c]]), branches: new Map([[ARCH, arch], [REVIEW, lockWith]]) }).kind).not.toBe("review");
    }
  });
  it("preserves needs-review and in-review continuation behavior from D-294/D-299", () => {
    expect(pick({ branches: new Map([[ARCH, arch], [REVIEW, lock([claim])]]) })).toMatchObject({ kind: "review", lock: REVIEW, packet: true });
    expect(pick({ branches: new Map([[ARCH, arch], [REVIEW, lock([claim], 1000)]]) }).kind).not.toBe("review");
  });
  it("preserves green-packet landing, Tier 2/3 packets, owner rows and dependencies", () => {
    const passLock = { branches: new Map([[ARCH, arch], [REVIEW, lock([claim, pass])]]) };
    expect(pick({ ...passLock, prCi: new Map([[ARCH, { state: "green", sha: HEAD }]]) })).toMatchObject({ kind: "land", packet: true });
    expect(pick({ tasks: [{ ...task, tier: 2 }], ...passLock }).kind).not.toBe("review");
    expect(pick({ tasks: [{ ...task, status: "owner" }], ...passLock }).kind).not.toBe("review");
    expect(pick({ tasks: [{ ...task, dependsOn: ["missing"] }], ...passLock }).kind).not.toBe("review");
  });
  it("preserves a truthful blocked report: no synthetic green, withdrawal or report", () => {
    const blocked = { id: "P", status: "blocked", who: "Builder · 9", at: NOW - HOUR, text: "measured contradiction" };
    const extra = { branches: new Map([[ARCH, arch], [REVIEW, lock([claim, pass])]]), reports: [blocked] };
    expect(pick(extra)).toMatchObject({ kind: "review", lock: REVIEW, packet: true });
    expect(statusBoard(input(extra))[0]).toMatchObject({ review: "passed" });
    expect(JSON.stringify(statusBoard(input(extra))[0].report)).toMatch(/measured contradiction/);
  });
});
