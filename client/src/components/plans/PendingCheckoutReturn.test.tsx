// @vitest-environment jsdom
// GO-LIVE-1b ruling 5: the pending return recovers a pass checkout through
// /api/chargebee/subscription-recovery with bounded retries, then tells the
// truth - active with its end date, review, expired, or still confirming.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingCheckoutReturn } from "./PendingCheckoutReturn";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("pending checkout return (GO-LIVE-1b)", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); window.sessionStorage.clear(); });

  const getToken = async () => "token";
  const seedPass = () => window.sessionStorage.setItem("skipwait.pending-chargebee-checkout", JSON.stringify({ hostedPageId: "hp_1", role: "job_seeker", kind: "plan" }));

  it("a pass checkout activates on return and says when it ends", async () => {
    seedPass();
    const fetchMock = vi.fn(async () => ok({ status: "activated", summary: { subscriptionCurrentTermEnd: "2026-11-20T00:00:00.000Z" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PendingCheckoutReturn role="job_seeker" getToken={getToken} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Your pass is active." })).toBeTruthy(), { timeout: 4_000 });
    expect(screen.getByText(/Ends 20 Nov 2026/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/chargebee/subscription-recovery", expect.objectContaining({ method: "POST", body: JSON.stringify({ hostedPageId: "hp_1", role: "job_seeker" }) }));
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull();
  });

  it("retries a pending page a bounded three times, then keeps the honest confirming copy", async () => {
    seedPass();
    const fetchMock = vi.fn(async () => ok({ status: "pending" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PendingCheckoutReturn role="job_seeker" getToken={getToken} />);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1), { timeout: 4_000 });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("heading", { name: "We’re confirming your payment." })).toBeTruthy();
  });

  it("an expired checkout says nothing was charged and stops", async () => {
    seedPass();
    const fetchMock = vi.fn(async () => ok({ status: "cancelled" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PendingCheckoutReturn role="job_seeker" getToken={getToken} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "That checkout expired before payment." })).toBeTruthy(), { timeout: 4_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a pack checkout keeps the static confirming copy and never calls subscription recovery", async () => {
    window.sessionStorage.setItem("skipwait.pending-chargebee-checkout", JSON.stringify({ hostedPageId: "hp_pack", role: "job_seeker", kind: "pack" }));
    const fetchMock = vi.fn(async () => ok({ status: "activated" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PendingCheckoutReturn role="job_seeker" getToken={getToken} />);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(screen.getByRole("heading", { name: "We’re confirming your payment." })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
