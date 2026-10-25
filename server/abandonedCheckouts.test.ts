import { describe, expect, it, vi } from "vitest";
import { createAbandonedCheckoutCloser, ABANDONED_CHECKOUT_AGE_MS, ABANDONED_UNVERIFIABLE_ABORT_MIN, ABANDONED_VERIFY_BATCH, type AbandonedCandidate, type AbandonedCheckoutPlan, type HostedPageProbe } from "./abandonedCheckouts";

const NOW = Date.parse("2026-10-25T00:00:00.000Z");
const CUTOFF = new Date(NOW - ABANDONED_CHECKOUT_AGE_MS);
const planFor = (candidates: number): AbandonedCheckoutPlan => ({ cutoff: CUTOFF.toISOString(), candidates, accounts: 1, oldest: null, newest: null, byCurrency: [] });
const cand = (id: number, hp: string | null = `hp_${id}`): AbandonedCandidate => ({ id, hostedPageId: hp });
const found = (pageState: string, paid = false): HostedPageProbe => ({ outcome: "found", pageState, paid });

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
    const { deps, run } = make([cand(1)], { hp_1: found("expired") });
    const result = await run(NOW, { apply: false });
    expect(result).toMatchObject({ candidates: 1, applied: false, closed: 0 });
    expect(deps.listCandidates).not.toHaveBeenCalled();
    expect(deps.probeHostedPage).not.toHaveBeenCalled();
    expect(deps.markAbandoned).not.toHaveBeenCalled();
  });

  it("marks only rows whose provider page is in a terminal state", async () => {
    const { deps, run } = make([cand(1), cand(2)], { hp_1: found("expired"), hp_2: found("cancelled") });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ applied: true, closed: 2, aborted: null });
    expect(deps.markAbandoned).toHaveBeenCalledWith([1, 2], CUTOFF);
  });

  it("never marks still-open pages: requested and created do not prove unpayable", async () => {
    const { deps, run } = make([cand(1), cand(2), cand(3)], { hp_1: found("requested"), hp_2: found("created"), hp_3: found("expired") });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 1, skippedNonTerminal: 2, aborted: null });
    expect(deps.markAbandoned).toHaveBeenCalledWith([3], CUTOFF);
  });

  it("never marks a page that is gone (404): missing status is unknown, not abandoned", async () => {
    const { deps, run } = make([cand(1), cand(2)], { hp_1: { outcome: "not_found" }, hp_2: found("expired") });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 1, skippedNotFound: 1 });
    expect(deps.markAbandoned).toHaveBeenCalledWith([2], CUTOFF);
  });

  it("never marks on provider faults or probe throws", async () => {
    const { deps, run } = make([cand(1), cand(2), cand(3)], { hp_1: { outcome: "fault" }, hp_2: new Error("timeout"), hp_3: found("expired") });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 1, skippedFault: 2, aborted: null });
    expect(deps.markAbandoned).toHaveBeenCalledWith([3], CUTOFF);
  });

  it("never marks a row the provider says is paid", async () => {
    const { deps, run } = make([cand(1), cand(2)], { hp_1: found("succeeded", true), hp_2: found("expired") });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 1, skippedPaid: 1 });
    expect(deps.markAbandoned).toHaveBeenCalledWith([2], CUTOFF);
  });

  it("treats a candidate without a hosted page id as not provable, not abandoned", async () => {
    const { deps, run } = make([cand(1, null), cand(2)], { hp_2: found("expired") });
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
    const { run } = make([cand(1), cand(2), cand(3), cand(4)], { hp_1: { outcome: "fault" }, hp_2: { outcome: "not_found" }, hp_3: { outcome: "not_found" }, hp_4: found("expired") });
    const result = await run(NOW, { apply: true });
    expect(result).toMatchObject({ closed: 1, skippedFault: 1, skippedNotFound: 2, aborted: null });
  });

  it("probes at most ABANDONED_VERIFY_BATCH rows per run and reports the rest as over-batch", async () => {
    const candidates = Array.from({ length: ABANDONED_VERIFY_BATCH + 5 }, (_, i) => cand(i + 1));
    const pages = Object.fromEntries(candidates.map(c => [c.hostedPageId as string, found("expired")]));
    const { deps, run } = make(candidates, pages);
    const result = await run(NOW, { apply: true });
    expect(deps.probeHostedPage).toHaveBeenCalledTimes(ABANDONED_VERIFY_BATCH);
    expect(result).toMatchObject({ closed: ABANDONED_VERIFY_BATCH, skippedOverBatch: 5 });
  });
});
