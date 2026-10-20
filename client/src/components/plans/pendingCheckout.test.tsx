// @vitest-environment jsdom
// GO-LIVE-1 C6: the return-from-checkout recovery that /premium runs today,
// shared from client/src/lib/pendingCheckout.ts so /plans can run the same
// one: the same sessionStorage key, the same POST /api/chargebee/credit-recovery
// with { hostedPageId, role }, tried at once, at 2.5 s and 7.5 s and on focus.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PENDING_CHECKOUT_STORAGE_KEY, clearPendingCheckout, readPendingCheckout, recoveryCopy, savePendingCheckout, usePendingCheckoutRecovery } from "@/lib/pendingCheckout";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const getToken = vi.fn(async () => "test-token");

function recoveryCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => String(url) === "/api/chargebee/credit-recovery");
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.sessionStorage.clear(); });

describe("pending checkout storage", () => {
  it("keeps one intent under the existing key and reads it back only for its own role", () => {
    expect(PENDING_CHECKOUT_STORAGE_KEY).toBe("skipwait.pending-chargebee-checkout");
    savePendingCheckout({ hostedPageId: "hp_1", role: "job_seeker" });
    expect(JSON.parse(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout") ?? "null")).toEqual({ hostedPageId: "hp_1", role: "job_seeker" });
    expect(readPendingCheckout("job_seeker")).toEqual({ hostedPageId: "hp_1", role: "job_seeker" });
    expect(readPendingCheckout("referrer")).toBeUndefined();
    clearPendingCheckout();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull();
  });

  it("reads a malformed or empty intent as none", () => {
    window.sessionStorage.setItem(PENDING_CHECKOUT_STORAGE_KEY, "{not json");
    expect(readPendingCheckout("job_seeker")).toBeUndefined();
    window.sessionStorage.setItem(PENDING_CHECKOUT_STORAGE_KEY, JSON.stringify({ hostedPageId: "", role: "job_seeker" }));
    expect(readPendingCheckout("job_seeker")).toBeUndefined();
  });
});

describe("usePendingCheckoutRecovery", () => {
  it("does nothing until it is enabled and the visitor is signed in", async () => {
    const fetchMock = vi.fn(async () => json({ status: "credited", tokenCount: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    savePendingCheckout({ hostedPageId: "hp_1", role: "job_seeker" });
    const off = renderHook(() => usePendingCheckoutRecovery({ enabled: false, isSignedIn: true, role: "job_seeker", getToken }));
    const signedOut = renderHook(() => usePendingCheckoutRecovery({ enabled: true, isSignedIn: false, role: "job_seeker", getToken }));
    await flush();
    expect(off.result.current.recovery).toBe("checking");
    expect(signedOut.result.current.recovery).toBe("checking");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without a stored intent for this role reads as pending and calls nothing", async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", fetchMock);
    savePendingCheckout({ hostedPageId: "hp_referrer", role: "referrer" });
    const { result } = renderHook(() => usePendingCheckoutRecovery({ enabled: true, isSignedIn: true, role: "job_seeker", getToken }));
    await flush();
    expect(result.current.recovery).toBe("pending");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("credits through credit-recovery, hands back the summary and clears the intent", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ status: "credited", tokenCount: 5, summary: { totalAvailable: 8 } }));
    vi.stubGlobal("fetch", fetchMock);
    savePendingCheckout({ hostedPageId: "hp_recovery", role: "job_seeker" });
    const onCredited = vi.fn();
    const { result } = renderHook(() => usePendingCheckoutRecovery({ enabled: true, isSignedIn: true, role: "job_seeker", getToken, onCredited }));
    await flush();
    expect(result.current.recovery).toBe("credited");
    expect(result.current.creditedTokens).toBe(5);
    expect(onCredited).toHaveBeenCalledWith({ totalAvailable: 8 });
    const [url, init] = recoveryCalls(fetchMock)[0];
    expect(url).toBe("/api/chargebee/credit-recovery");
    expect(init).toMatchObject({ method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" } });
    expect(JSON.parse(String(init?.body))).toEqual({ hostedPageId: "hp_recovery", role: "job_seeker" });
    expect(readPendingCheckout("job_seeker")).toBeUndefined();
    // Credited is final: no later attempt fires.
    const settled = recoveryCalls(fetchMock).length;
    await act(async () => { vi.advanceTimersByTime(10_000); window.dispatchEvent(new Event("focus")); });
    await flush();
    expect(recoveryCalls(fetchMock).length).toBe(settled);
  });

  it("keeps trying at 2.5 s and 7.5 s while the provider record has not arrived, then stops", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ status: "pending" }));
    vi.stubGlobal("fetch", fetchMock);
    savePendingCheckout({ hostedPageId: "hp_wait", role: "job_seeker" });
    const { result } = renderHook(() => usePendingCheckoutRecovery({ enabled: true, isSignedIn: true, role: "job_seeker", getToken }));
    await flush();
    expect(result.current.recovery).toBe("pending");
    const first = recoveryCalls(fetchMock).length;
    expect(first).toBeGreaterThan(0);
    await act(async () => { vi.advanceTimersByTime(2500); });
    await flush();
    expect(recoveryCalls(fetchMock).length).toBe(first + 1);
    await act(async () => { vi.advanceTimersByTime(5000); });
    await flush();
    expect(recoveryCalls(fetchMock).length).toBe(first + 2);
    // Three attempts in this run: a later focus or timer adds nothing.
    await act(async () => { window.dispatchEvent(new Event("focus")); vi.advanceTimersByTime(30_000); });
    await flush();
    expect(recoveryCalls(fetchMock).length).toBe(first + 2);
    expect(recoveryCalls(fetchMock).every(([, init]) => JSON.parse(String(init?.body)).hostedPageId === "hp_wait")).toBe(true);
  });

  it("retries on window focus before the cap and reads requires_review as its own state", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ status: "requires_review" }));
    vi.stubGlobal("fetch", fetchMock);
    savePendingCheckout({ hostedPageId: "hp_review", role: "referrer" });
    const { result } = renderHook(() => usePendingCheckoutRecovery({ enabled: true, isSignedIn: true, role: "referrer", getToken }));
    await flush();
    expect(result.current.recovery).toBe("requires_review");
    const before = recoveryCalls(fetchMock).length;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await flush();
    expect(recoveryCalls(fetchMock).length).toBe(before + 1);
    expect(JSON.parse(String(recoveryCalls(fetchMock)[0][1]?.body))).toEqual({ hostedPageId: "hp_review", role: "referrer" });
  });

  it("reads a failed call as pending, never as credited", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    savePendingCheckout({ hostedPageId: "hp_offline", role: "job_seeker" });
    const { result } = renderHook(() => usePendingCheckoutRecovery({ enabled: true, isSignedIn: true, role: "job_seeker", getToken }));
    await flush();
    expect(result.current.recovery).toBe("pending");
    expect(readPendingCheckout("job_seeker")).toEqual({ hostedPageId: "hp_offline", role: "job_seeker" });
  });
});

describe("recoveryCopy", () => {
  it("says what the page says today for each recovery state", () => {
    expect(recoveryCopy("credited", 5)).toEqual({ title: "5 referral credits are ready.", body: "Your verified payment is complete and your available credits are updated." });
    expect(recoveryCopy("credited", 1).title).toBe("1 referral credit is ready.");
    expect(recoveryCopy("credited", 0).title).toBe("Your referral credits are ready.");
    expect(recoveryCopy("requires_review", 0)).toEqual({ title: "We’re checking this payment securely.", body: "Your transaction is protected. We will only add credits after the provider record matches your checkout." });
    expect(recoveryCopy("pending", 0)).toEqual({ title: "We’re confirming your payment.", body: "Nothing else is needed from you. We will add credits as soon as the provider’s verified record reaches our server." });
    expect(recoveryCopy("checking", 0).title).toBe("We’re confirming your payment.");
  });
});
