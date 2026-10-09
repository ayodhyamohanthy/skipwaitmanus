// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyRequests from "./MyRequests";

const { go, getToken } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 4106, getToken }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/requests", go] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MyRequests /></QueryClientProvider>);
}


const pendingRequest = { id: 12, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", status: "pending", referrerId: 77, referrerMessage: null, unreadMessageCount: 0, createdAt: "2026-09-01T09:41:00.000Z", updatedAt: "2026-09-02T14:05:00.000Z", attachmentCount: 1 };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("My Requests pending states", () => {
  it("shows the honest empty headline alongside the visual action state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [] }) })));
    renderPage();
    expect(await screen.findByRole("heading", { name: "No asks yet." })).toBeTruthy();
    expect(screen.getByText("Pick a company, find a verified referrer, and write one great ask.")).toBeTruthy();
    expect(document.querySelector('[data-skipwait-zero-action="job_seeker"]')).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore companies" })).toBeTruthy();
  });

  it("renders the pending row with a review state and never names the Referrer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [pendingRequest] }) })));
    renderPage();
    const row = await screen.findByLabelText("acme.com request, Requested");
    const item = row.closest("li");
    expect(item?.textContent).toContain("acme.com · Under review");
    expect(item?.textContent).not.toContain("77");
  });

  it("counts expiring asks and labels their countdown honestly", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const expiring = { ...pendingRequest, id: 21, referrerId: null, createdAt: iso(now - 5.2 * day), updatedAt: iso(now - 5.2 * day) };
    const urgent = { ...pendingRequest, id: 22, referrerId: null, createdAt: iso(now - 6 * day - 12 * 60 * 60 * 1000), updatedAt: iso(now - 6 * day) };
    const fresh = { ...pendingRequest, id: 23, referrerId: null, createdAt: iso(now - day), updatedAt: iso(now - day) };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [expiring, urgent, fresh, pendingRequest] }) })));
    renderPage();
    const tomorrowNote = await screen.findByText("acme.com · Expires tomorrow");
    expect(tomorrowNote.textContent).toContain("Ref-1021");
    expect(screen.getByText("EXPIRING SOON").parentElement?.textContent).toContain("2");
    const urgentNote = await screen.findByText("acme.com · Expires today");
    expect(urgentNote.className).toContain("text-destructive");
    expect(urgentNote.textContent).toContain("Ref-1022");
    expect(screen.getByText(/acme\.com · Expires in 5 days/).className).toContain("text-muted-foreground");
  });

  it("counts down from createdAt even when the server also sends expiresAt", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const ask = { ...pendingRequest, id: 41, referrerId: null, createdAt: iso(now - 4.5 * day), updatedAt: iso(now - 4.5 * day), expiresAt: iso(now + 2.5 * day) };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [ask] }) })));
    renderPage();
    expect(await screen.findByText("acme.com · Expires in 2 days")).toBeTruthy();
  });

  it("labels a lapsed ask Expired instead of hiding it", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const lapsed = { ...pendingRequest, id: 31, referrerId: null, createdAt: iso(now - 9 * day), updatedAt: iso(now - 9 * day) };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [lapsed] }) })));
    renderPage();
    expect(await screen.findByText("acme.com · Expired")).toBeTruthy();
  });

  it("meters open slots against the real monthly allowance", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const ask = { ...pendingRequest, id: 41, referrerId: null, createdAt: iso(now - day), updatedAt: iso(now - day) };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/credits/summary")) return { ok: true, json: async () => ({ summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 2, purchasedCreditsRemaining: 0, totalAvailable: 2 } }) };
      return { ok: true, json: async () => ({ requests: [ask] }) };
    }));
    renderPage();
    const meter = await screen.findByLabelText("Open slots: 2 of 3");
    expect(meter.textContent).toContain("2/3");
    expect(screen.queryByText(/All 3 slots are in use/)).toBeNull();
  });

  it("nudges to plans when every slot is in use", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const asks = [51, 52, 53].map(id => ({ ...pendingRequest, id, referrerId: null, createdAt: iso(now - day), updatedAt: iso(now - day) }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/credits/summary")) return { ok: true, json: async () => ({ summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 0, purchasedCreditsRemaining: 0, totalAvailable: 0 } }) };
      return { ok: true, json: async () => ({ requests: asks }) };
    }));
    renderPage();
    expect(await screen.findByText("All 3 slots are in use.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/plans");
  });

  it("keeps the list intact and retries after a failed load", async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/company-referrals/mine")) { attempts += 1; return attempts === 1 ? { ok: false, status: 503, json: async () => ({ error: "Referral service is temporarily unavailable" }) } : { ok: true, json: async () => ({ requests: [pendingRequest] }) }; }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load your requests");
    expect(alert.textContent).toContain("Referral service is temporarily unavailable");
    expect(alert.textContent).toContain("nothing was lost");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByLabelText("acme.com request, Requested")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/company-referrals/mine")).length).toBe(2);
  });

  it("adds the taking-longer notice once loading passes 15 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let release: (() => void) | undefined;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("/company-referrals/mine")) return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ requests: [] }) }); });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-skipwait-loading="true"]')).toBeTruthy());
    expect(screen.getByText("Loading your requests…")).toBeTruthy();
    expect(screen.getByText("Routing checks usually take a second.")).toBeTruthy();
    expect(document.querySelector('[data-skipwait-loading-slow="true"]')).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(15_100); });
    expect(document.querySelector('[data-skipwait-loading-slow="true"]')?.textContent).toContain("taking longer than expected");

    await act(async () => { release?.(); await vi.advanceTimersByTimeAsync(400); });
    await waitFor(() => expect(document.querySelector('[data-skipwait-loading="true"]')).toBeNull());
    expect(await screen.findByRole("heading", { name: "No asks yet." })).toBeTruthy();
  });
});
