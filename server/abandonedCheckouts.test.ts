import { describe, expect, it, vi } from "vitest";
import { createAbandonedCheckoutCloser, ABANDONED_CHECKOUT_AGE_MS, ABANDONED_UNVERIFIABLE_ABORT_MIN, ABANDONED_VERIFY_BATCH, type AbandonedCandidate, type AbandonedCheckoutPlan, type HostedPageProbe } from "./abandonedCheckouts";

const NOW = Date.parse("2026-10-25T00:00:00.000Z");
const CUTOFF = new Date(NOW - ABANDONED_CHECKOUT_AGE_MS);
const planFor = (candidates: number): AbandonedCheckoutPlan => ({ cutoff: CUTOFF.toISOString(), candidates, accounts: 1, oldest: null, newest: null, byCurrency: [] });
const cand = (id: number, hp: string | null = `hp_${id}`): AbandonedCandidate => ({ id, hostedPageId: hp });
const found = (pageState: string, over: Partial<Extract<HostedPageProbe, { outcome: "found" }>> = {}): HostedPageProbe => ({ outcome: "found", pageState, paid: false, ...over });
const EXPIRED = NOW - 3_600_000;
const FUTURE = NOW + 3_600_000;

function make(candidates: AbandonedCandidate[], pages: Record<string, HostedPageProbe | Error>) {
  const deps = {
    summarize: vi.fn(async () => planFor(candidates.length)),
    listCandidates: vi.fn(async () => candidates),
    markAbandoned: vi.fn(async (ids: number[]) => ids.length),
    probeHostedPage: vi.fn(async (id: string) => { const page = pages[id]; if (page instanceof Error) throw page; return page; }),
  };
  return { deps, run: createAbandonedCheckoutCloser(deps) };
}

describe("abandoned checkout closeout", () => {
  it("preview plans only: no provider reads, no marks", async () => {
    const { deps, run } = make([cand(1)], { hp_1: found("cancelled") });
    const result = await run(NOW, { apply: false });
    expect(result).toMatchObject({ candidates: 1, applied: false, closed: 0 });
    expect(deps.listCandidates).not.toHaveBeenCalled();
    expect(deps.probeHostedPage).not.toHaveBeenCalled();
    expect(deps.markAbandoned).not.toHaveBeenCalled();
  });

  it("marks a buyer-cancelled page and a page whose documented expires_at has passed", async () => {
    const { deps, run } = make([cand(1), cand(2)], { hp_1: found("cancelled"), hp_2: found("requested", { expiresAtMs: EXPIRED }) });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ applied: true, closed: 2, aborted: null });
    expect(deps.markAbandoned).toHaveBeenCalledWith([1, 2], CUTOFF);
  });

  it("never marks still-open pages: requested/created without a passed expires_at stay payable", async () => {
    const { deps, run } = make([cand(1), cand(2), cand(3), cand(4)], {
      hp_1: found("requested"), // no expires_at returned: not provable
      hp_2: found("created", { expiresAtMs: FUTURE }), // still within its URL lifetime
      hp_3: found("requested", { expiresAtMs: EXPIRED }),
      hp_4: found("created", { expiresAtMs: EXPIRED }),
    });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 2, skippedNonTerminal: 2, aborted: null });
    expect(deps.markAbandoned).toHaveBeenCalledWith([3, 4], CUTOFF);
  });

  it("does not treat the string 'expired' as a state: Chargebee has no such state, expiry comes from expires_at", async () => {
    const { deps, run } = make([cand(1), cand(2)], { hp_1: found("expired"), hp_2: found("expired", { expiresAtMs: EXPIRED }) });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 1, skippedNonTerminal: 1 });
    expect(deps.markAbandoned).toHaveBeenCalledWith([2], CUTOFF);
  });

  it("never marks success states, invoice-verified or not: they belong to the webhook and reconciler", async () => {
    const { deps, run } = make([cand(1), cand(2), cand(3), cand(4)], {
      hp_1: found("succeeded", { paid: true }),
      hp_2: found("succeeded", { paid: false, expiresAtMs: EXPIRED }),
      hp_3: found("acknowledged", { expiresAtMs: EXPIRED }),
      hp_4: found("cancelled"),
    });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 1, skippedPaid: 3 });
    expect(deps.markAbandoned).toHaveBeenCalledWith([4], CUTOFF);
  });

  it("never marks a page that is gone (404): missing status is unknown, not abandoned", async () => {
    const { deps, run } = make([cand(1), cand(2)], { hp_1: { outcome: "not_found" }, hp_2: found("cancelled") });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 1, skippedNotFound: 1 });
    expect(deps.markAbandoned).toHaveBeenCalledWith([2], CUTOFF);
  });

  it("never marks on provider faults or probe throws", async () => {
    const { deps, run } = make([cand(1), cand(2), cand(3)], { hp_1: { outcome: "fault" }, hp_2: new Error("timeout"), hp_3: found("cancelled") });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 1, skippedFault: 2, aborted: null });
    expect(deps.markAbandoned).toHaveBeenCalledWith([3], CUTOFF);
  });

  it("treats a candidate without a hosted page id as not provable, not abandoned", async () => {
    const { deps, run } = make([cand(1, null), cand(2)], { hp_2: found("cancelled") });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 1, skippedNotFound: 1 });
    expect(deps.probeHostedPage).not.toHaveBeenCalledWith(null);
  });

  it("aborts and marks nothing when the provider faults for every candidate (broken key/site/outage guard)", async () => {
    const candidates = Array.from({ length: ABANDONED_UNVERIFIABLE_ABORT_MIN }, (_, i) => cand(i + 1));
    const pages = Object.fromEntries(candidates.map(c => [c.hostedPageId as string, { outcome: "fault" } as HostedPageProbe]));
    const { deps, run } = make(candidates, pages);
    const result = await run(NOW, { apply: true });
    expect(result.aborted).toContain("provider unreadable");
    expect(result.closed).toBe(0);
    expect(deps.markAbandoned).not.toHaveBeenCalled();
  });

  it("does not abort when some candidates are readable, even if most are gone or faulted", async () => {
    const { run } = make([cand(1), cand(2), cand(3), cand(4)], { hp_1: { outcome: "fault" }, hp_2: { outcome: "not_found" }, hp_3: { outcome: "not_found" }, hp_4: found("cancelled") });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 1, skippedFault: 1, skippedNotFound: 2, aborted: null });
  });

  it("probes at most ABANDONED_VERIFY_BATCH rows per run and reports the rest as over-batch", async () => {
    const candidates = Array.from({ length: ABANDONED_VERIFY_BATCH + 5 }, (_, i) => cand(i + 1));
    const pages = Object.fromEntries(candidates.map(c => [c.hostedPageId as string, found("cancelled")]));
    const { deps, run } = make(candidates, pages);
    const result = await run(NOW, { apply: true });
    expect(deps.probeHostedPage).toHaveBeenCalledTimes(ABANDONED_VERIFY_BATCH);
    expect(result).toMatchObject({ closed: ABANDONED_VERIFY_BATCH, skippedOverBatch: 5 });
  });
});
