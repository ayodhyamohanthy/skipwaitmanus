// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
const flag = vi.hoisted(() => ({ on: true }));
const clarity = vi.hoisted(() => ({ trackClarityEvent: vi.fn() }));
const auth = vi.hoisted(() => ({ getToken: vi.fn(async () => "test-token") }));
const sentry = vi.hoisted(() => ({ captureClientError: vi.fn() }));
vi.mock("@/lib/shareFlags", () => ({ get SHARE_IMPACT_CARD() { return flag.on; } }));
vi.mock("@/lib/clarity", () => ({ trackClarityEvent: clarity.trackClarityEvent }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken: auth.getToken }) }));
vi.mock("@/lib/sentry", () => ({ captureClientError: sentry.captureClientError, scrubSentryUrl: (url: string) => url }));
import { ShareImpactCard } from "./ShareImpactCard";

const ready = {
  state: "ready",
  screenName: "QuietFalcon",
  companyName: "Kestrel Pay",
  companySlug: "kestrel-pay",
  linkPath: "/refer/kestrel-pay/quietfalcon",
  stats: { referredThisMonth: 3, medianFirstReplyHours: 3, acceptRatePct: 64 },
};

function stubFetch(payload: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: status < 400, status, url: "http://localhost/api/referrer/impact-card", json: async () => payload }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ShareImpactCard /></QueryClientProvider>);
}
function clipboard() {
  const writeText = vi.fn(async (_text: string) => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  return writeText;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = true; clarity.trackClarityEvent.mockClear(); sentry.captureClientError.mockClear(); auth.getToken.mockClear(); });

describe("Referrer impact card", () => {
  it("flag off (shipped state): nothing renders, no fetch", async () => {
    flag.on = false;
    stubFetch(ready);
    const { container } = mount();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(container.firstChild).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("insufficient (min-3 gate): renders nothing", async () => {
    stubFetch({ state: "insufficient" });
    const { container } = mount();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(container.firstChild).toBeNull();
  });
  it("F4: fetches with the signed-in Bearer token through the owning data layer", async () => {
    const fetchMock = stubFetch(ready);
    mount();
    await screen.findByTestId("share-impact-card");
    expect(auth.getToken).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/referrer/impact-card");
    expect(init?.headers).toEqual({ Authorization: "Bearer test-token" });
  });
  it("ready: screen name, company and aggregates only", async () => {
    stubFetch(ready);
    mount();
    const card = await screen.findByTestId("share-impact-card");
    expect(within(card).getByText("QuietFalcon · Verified at Kestrel Pay")).toBeTruthy();
    expect(within(card).getByText("3 referrals")).toBeTruthy();
    expect(within(card).getByText("into Kestrel Pay this month.")).toBeTruthy();
    expect(within(card).getByText("3h")).toBeTruthy();
    expect(within(card).getByText("median first reply, all time")).toBeTruthy();
    expect(within(card).getByText("64%")).toBeTruthy();
    expect(within(card).getByText("asks accepted, all time")).toBeTruthy();
    expect(within(card).getByText("skipwait.me/refer/kestrel-pay/quietfalcon")).toBeTruthy();
  });
  it("F3: one referral and none read truthfully", async () => {
    stubFetch({ ...ready, stats: { ...ready.stats, referredThisMonth: 1 } });
    mount();
    let card = await screen.findByTestId("share-impact-card");
    expect(within(card).getByText("1 referral")).toBeTruthy();
    cleanup();
    stubFetch({ ...ready, stats: { ...ready.stats, referredThisMonth: 0 } });
    mount();
    card = await screen.findByTestId("share-impact-card");
    expect(within(card).getByText("No referrals")).toBeTruthy();
  });
  it("copied text carries no seeker data and keeps the honest copy", async () => {
    stubFetch(ready);
    const writeText = clipboard();
    mount();
    await screen.findByTestId("share-impact-card");
    fireEvent.click(screen.getByRole("button", { name: "Copy card as text" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(clarity.trackClarityEvent).toHaveBeenCalledWith("impact_card_copy_text");
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("QuietFalcon · Verified at Kestrel Pay");
    expect(text).not.toMatch(/seeker|pitch|hired/i);
    fireEvent.click(screen.getByRole("button", { name: "Copy for LinkedIn" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(clarity.trackClarityEvent).toHaveBeenCalledWith("impact_card_copy_linkedin");
    expect(writeText.mock.calls[1][0] as string).toContain("Ask me for a referral: https://skipwait.me/refer/kestrel-pay/quietfalcon");
  });
  it("F4: a 503 is reported while the card renders nothing, never a raw error", async () => {
    stubFetch({ error: "Impact card unavailable" }, 503);
    const { container } = mount();
    await waitFor(() => expect(sentry.captureClientError).toHaveBeenCalled());
    const [error] = sentry.captureClientError.mock.calls[0];
    expect(String(error instanceof Error ? error.message : error)).toContain("API 503");
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/unavailable/i)).toBeNull();
  });
  it("F5: a malformed payload renders nothing", async () => {
    stubFetch({ state: "ready", screenName: "QuietFalcon" });
    const { container } = mount();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(container.firstChild).toBeNull();
  });
  it("fetch failure renders nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    const { container } = mount();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(container.firstChild).toBeNull();
  });
});
