// @vitest-environment node
// PICKER-claim-stale-ref (D-324, D-321 (11)): a claim's marker parent is read from the refs at write
// time, never from the pick's snapshot. The snapshot is taken before the run's GitHub reads, so another
// session's merge can delete the branch on origin in between. Observed on 2026-11-24: PR #1510 merged
// and its `agent/architect/skippy-auto-send` lock was deleted while a `--claim` was still deciding, so
// `tip()` threw `git rev-parse` status 128 and the run died with a stack trace (exit 1) instead of
// re-picking. A lock that is gone is a fresh claim from main; a work branch that is gone is stale.
import { describe, expect, it } from "vitest";
import { claimParentOf } from "./next-task.mjs";

const MAIN = "a".repeat(40);
const TIP = "b".repeat(40);
const refs = (present: boolean) => ({ onOrigin: () => present, tip: () => TIP, origin: () => MAIN });

describe("claimParentOf (PICKER-claim-stale-ref)", () => {
  it("uses the branch tip when the ref is on origin", () => {
    expect(claimParentOf("agent/architect/x", refs(true))).toBe(TIP);
  });

  it("creates a lock claim from main when the lock was deleted after the snapshot", () => {
    expect(claimParentOf("agent/architect/x", refs(false))).toBe(MAIN);
  });

  it("refuses a stale work pick instead of inventing a parent for it", () => {
    expect(claimParentOf("agent/queue/x", { ...refs(false), required: true })).toBeNull();
  });

  it("never asks for a tip of a ref that is not on origin, which is what threw status 128", () => {
    let tips = 0;
    const parent = claimParentOf("agent/queue/x", {
      onOrigin: () => false,
      tip: () => {
        tips += 1;
        return TIP;
      },
      origin: () => MAIN,
    });
    expect(parent).toBe(MAIN);
    expect(tips).toBe(0);
  });
});
