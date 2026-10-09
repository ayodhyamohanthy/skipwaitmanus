// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyRequests from "./MyRequests";

const { go, getToken, auth } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("test-token"), auth: { isLoaded: true, isSignedIn: true } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: auth.isLoaded, isSignedIn: auth.isSignedIn, userId: auth.isSignedIn ? 4106 : null, getToken }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/requests", go] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MyRequests /></QueryClientProvider>);
}

const day = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
const base = { targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", queueStatus: null, referrerMessage: null, unreadMessageCount: 0, attachmentCount: 1 };
const openAsk = (id: number) => ({ ...base, id, title: "Product Designer", status: "pending", referrerId: null, createdAt: iso(Date.now() - day), updatedAt: iso(Date.now() - day) });
const declined = { ...base, id: 45, title: "Designer", companyDomain: "skipwait.me", status: "declined", referrerId: 503, referrerMessage: "Not my team", createdAt: iso(Date.now() - 9 * day), updatedAt: iso(Date.now() - 8 * day) };
const expired = { ...base, id: 46, title: "Analyst", status: "closed", referrerId: null, createdAt: iso(Date.now() - 12 * day), updatedAt: iso(Date.now() - 5 * day) };
const credits = (remaining: number, extra: Record<string, unknown> = {}) => ({ summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: remaining, purchasedCreditsRemaining: 0, totalAvailable: remaining, cycleKey: "2026-10", subscriptionStatus: null, subscriptionCurrentTermEnd: null, ...extra } });

function stub(requests: unknown[], creditBody: unknown, creditsOk = true) {
  const fetchMock = vi.fn(async (url: string) => String(url).includes("/api/credits/summary")
    ? { ok: creditsOk, status: creditsOk ? 200 : 500, json: async () => creditBody }
    : { ok: true, status: 200, json: async () => ({ requests }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); auth.isLoaded = true; auth.isSignedIn = true; });

describe("My Requests kit v4 states", () => {
  it("gates signed-out visitors behind a sign-in panel and never loads asks", () => {
    auth.isSignedIn = false;
    const fetchMock = stub([], credits(3));
    renderPage();
    expect(screen.getByRole("heading", { name: "See the real status." })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Secure sign in/ })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not flash the sign-in gate while auth is still resolving", () => {
    auth.isLoaded = false; auth.isSignedIn = false;
    stub([], credits(3));
    renderPage();
    expect(screen.queryByRole("heading", { name: "See the real status." })).toBeNull();
    expect(document.querySelector('[data-skipwait-loading="true"]')).toBeTruthy();
  });

  it("shows the slots-full nudge from the live wallet, with withdraw as a real option", async () => {
    stub([openAsk(42)], credits(0));
    renderPage();
    const lead = await screen.findByText("All 3 slots are in use.");
    expect(lead.parentElement?.textContent).toBe("All 3 slots are in use. Wait for an unclaimed ask to expire, withdraw one, or get more slots with Pro (10).");
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/plans");
    expect(screen.getByRole("progressbar", { name: "Open slots this month" }).getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByLabelText("Open slots: 0 of 3").textContent).toContain("OPEN SLOTS · FREE0/3");
  });

  it("does not suggest withdrawing when no ask can be withdrawn", async () => {
    stub([declined], credits(0));
    renderPage();
    const lead = await screen.findByText("All 3 slots are in use.");
    expect(lead.parentElement?.textContent).toBe("All 3 slots are in use. Get more slots with Pro (10).");
  });

  it("hides the nudge while credits remain and counts pack credits honestly", async () => {
    stub([openAsk(42)], credits(0, { purchasedCreditsRemaining: 2, totalAvailable: 2 }));
    renderPage();
    expect(await screen.findByText("+2 one-time credits")).toBeTruthy();
    expect(screen.getByLabelText("Open slots: 0 of 3")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "See plans" })).toBeNull();
  });

  it("lists declined and expired asks under Closed with the referrer's reason", async () => {
    stub([openAsk(42), declined, expired], credits(1));
    renderPage();
    await screen.findByLabelText("acme.com request, Requested");
    expect(screen.queryByLabelText("skipwait.me request, Declined")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Closed" }));
    const row = await screen.findByLabelText("skipwait.me request, Declined");
    expect(row.getAttribute("href")).toBe("/conversation/45");
    expect(row.closest("li")?.textContent).toContain("skipwait.me · Not my team");
    expect(screen.getByLabelText("acme.com request, Expired")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });

  it("shows the closed-tab empty state when nothing has closed", async () => {
    stub([openAsk(42)], credits(2));
    renderPage();
    await screen.findByLabelText("acme.com request, Requested");
    fireEvent.click(screen.getByRole("tab", { name: "Closed" }));
    expect(await screen.findByRole("heading", { name: "Nothing closed yet." })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Explore companies" })).toBeNull();
  });

  it("keeps the list when credits fail and reloads only the credits", async () => {
    const fetchMock = stub([openAsk(42)], { error: "Credits are unavailable" }, false);
    renderPage();
    expect(await screen.findByText(/Credits didn’t load/)).toBeTruthy();
    expect(screen.getByLabelText("acme.com request, Requested")).toBeTruthy();
    fetchMock.mockImplementation(async (url: string) => String(url).includes("/api/credits/summary")
      ? { ok: true, status: 200, json: async () => credits(2) }
      : { ok: true, status: 200, json: async () => ({ requests: [openAsk(42)] }) });
    fireEvent.click(screen.getByRole("button", { name: "Reload credits" }));
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Open slots this month" }).getAttribute("aria-valuenow")).toBe("2"));
  });

  it("explains a dropped connection instead of showing zero asks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t reach SkipWait. Check your connection and try again.");
    expect(screen.queryByText("IN CONVERSATION")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to home" }));
    expect(go).toHaveBeenCalledWith("/");
  });

  it("treats a malformed list payload as an error, never as data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ requests: [{ id: "x" }] }) })));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not load your referral requests");
  });
});
