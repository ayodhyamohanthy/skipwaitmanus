// @vitest-environment jsdom
// /requests pending, expiry and recovery states on the goal UI (D-048 phase 3).
// The expiry wording still comes from the shared ask clock; only the surface changed.
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyRequests from "./MyRequests";

const { go, getToken, auth } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("test-token"), auth: { openSignIn: vi.fn() } }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 4106, getToken, openSignIn: auth.openSignIn }),
  useUser: () => ({ user: { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/requests", go],
}));
vi.mock("sonner", () => ({ toast: vi.fn() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MyRequests /></QueryClientProvider>);
}

const pendingRequest = { id: 12, title: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", companyName: null, companyInitials: null, status: "pending", referrerId: 77, queueStatus: "available_for_review", referrerMessage: null, unreadMessageCount: 0, createdAt: "2026-09-01T09:41:00.000Z", updatedAt: "2026-09-02T14:05:00.000Z", attachmentCount: 1 };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function stubRequests(requests: unknown[], slots?: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/api/credits/summary")
    ? { ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 4 } }) }
    : { ok: true, status: 200, json: async () => ({ requests, ...(slots ? { slots } : {}) }) }));
}

describe("My asks pending states", () => {
  it("shows the honest empty headline", async () => {
    stubRequests([]);
    renderPage();
    expect(await screen.findByText("No asks yet.")).toBeTruthy();
    expect(screen.getByText("Pick a company, find a verified referrer, and write one great ask.")).toBeTruthy();
    expect(document.querySelector('[data-skipwait-zero-action="job_seeker"]')).toBeNull();
  });

  it("renders a claimed pending ask as Under review and never names the referrer", async () => {
    stubRequests([pendingRequest]);
    renderPage();
    const row = (await screen.findByText("Product Designer")).closest("a");
    expect(row?.textContent).toContain("acme.com");
    expect(row?.textContent).toContain("Under review");
    expect(row?.textContent).toContain("Nothing to do yet. You’ll hear from us when they decide.");
    expect(row?.textContent).not.toContain("77");
  });

  it("labels the expiry clock honestly on the row, including a server expiresAt that disagrees", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const expiring = { ...pendingRequest, id: 21, referrerId: null, queueStatus: null, createdAt: iso(now - 5.2 * day), updatedAt: iso(now - 5.2 * day) };
    const urgent = { ...pendingRequest, id: 22, referrerId: null, queueStatus: null, createdAt: iso(now - 6 * day - 12 * 60 * 60 * 1000), updatedAt: iso(now - 6 * day) };
    const fresh = { ...pendingRequest, id: 23, referrerId: null, queueStatus: null, createdAt: iso(now - day), updatedAt: iso(now - day) };
    const overridden = { ...pendingRequest, id: 24, referrerId: null, queueStatus: null, createdAt: iso(now - 4.5 * day), updatedAt: iso(now - 4.5 * day), expiresAt: iso(now + 2.5 * day) };
    stubRequests([expiring, urgent, fresh, overridden]);
    renderPage();
    expect(await screen.findByText("Expires tomorrow")).toBeTruthy();
    expect(screen.getByText("Expires today")).toBeTruthy();
    expect(screen.getByText("Expires in 6 days")).toBeTruthy();
    // The count comes from createdAt, not a server expiresAt that would extend it.
    expect(screen.getByText("Expires in 3 days")).toBeTruthy();
    expect(document.querySelector("main")?.textContent).not.toContain("Ref-");
  });

  it("labels a lapsed ask Expired under Closed instead of hiding it", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const lapsed = { ...pendingRequest, id: 31, referrerId: null, queueStatus: null, status: "closed", createdAt: new Date(now - 9 * day).toISOString(), updatedAt: new Date(now - 9 * day).toISOString() };
    stubRequests([lapsed]);
    renderPage();
    expect(await screen.findByRole("heading", { name: "Closed · 1" })).toBeTruthy();
    expect(screen.getByText("Product Designer").closest("a")?.textContent).toContain("Expired");
  });

  it("meters the server's open-ask count against the plan cap", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const ask = { ...pendingRequest, id: 41, referrerId: null, queueStatus: null, createdAt: new Date(now - day).toISOString(), updatedAt: new Date(now - day).toISOString() };
    stubRequests([ask], { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: { id: "momentum", label: "Momentum", openRequests: 15 } });
    renderPage();
    expect((await screen.findByTestId("asks-slots")).textContent).toBe("Open asks 1 of 3 · Free plan");
    expect(screen.queryByText(/All 3 slots are in use/)).toBeNull();
  });

  it("nudges to plans when every slot is in use", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const asks = [51, 52, 53].map(id => ({ ...pendingRequest, id, referrerId: null, queueStatus: null, createdAt: new Date(now - day).toISOString(), updatedAt: new Date(now - day).toISOString() }));
    stubRequests(asks, { plan: "free", planLabel: "Free", open: 3, cap: 3, full: true, nextPlan: { id: "momentum", label: "Momentum", openRequests: 15 } });
    renderPage();
    const lead = await screen.findByText(/All 3 slots are in use\./);
    expect(lead.closest('[role="status"]')?.textContent).toContain("All 3 slots are in use.");
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/plans");
  });

  // Review round 2 (D-067): no plan on sale raises the open-ask cap, so the server sends no
  // next plan and the nudge offers no "See plans" link that would lead nowhere.
  it("offers no plans link when no plan on sale raises the cap", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const asks = [51, 52, 53].map(id => ({ ...pendingRequest, id, referrerId: null, queueStatus: null, createdAt: new Date(now - day).toISOString(), updatedAt: new Date(now - day).toISOString() }));
    stubRequests(asks, { plan: "free", planLabel: "Free", open: 3, cap: 3, full: true, nextPlan: null });
    renderPage();
    const lead = await screen.findByText(/All 3 slots are in use\./);
    expect(lead.closest('[role="status"]')?.textContent).toContain("Wait for an answer or withdraw an ask.");
    expect(screen.queryByRole("link", { name: "See plans" })).toBeNull();
  });

  it("keeps the list intact and retries after a failed load", async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/credits/summary")) return { ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 4 } }) };
      attempts += 1;
      return attempts === 1
        ? { ok: false, status: 503, json: async () => ({ error: "Referral service is temporarily unavailable" }) }
        : { ok: true, status: 200, json: async () => ({ requests: [pendingRequest] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load your requests");
    expect(alert.textContent).toContain("Referral service is temporarily unavailable");
    expect(alert.textContent).toContain("nothing was lost");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/company-referrals/mine")).length).toBe(2);
  });

  it("adds the taking-longer notice once loading passes 15 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let release: (() => void) | undefined;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (String(url).includes("/api/credits/summary")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 4 } }) });
      return new Promise(resolve => { release = () => resolve({ ok: true, status: 200, json: async () => ({ requests: [] }) }); });
    }));
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-skipwait-loading="true"]')).toBeTruthy());
    expect(document.querySelector('[data-skipwait-loading-slow="true"]')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_100); });
    expect(document.querySelector('[data-skipwait-loading-slow="true"]')?.textContent).toContain("taking longer than expected");
    await act(async () => { release?.(); await vi.advanceTimersByTimeAsync(400); });
    await waitFor(() => expect(document.querySelector('[data-skipwait-loading="true"]')).toBeNull());
    expect(await screen.findByText("No asks yet.")).toBeTruthy();
  });
});
