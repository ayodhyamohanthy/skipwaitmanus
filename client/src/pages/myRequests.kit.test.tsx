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
// /mine rows carry the server directory identity: null outside it, "skipwait.me"/"SW" for skipwait.me.
const base = { targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", companyName: null, companyInitials: null, queueStatus: null, referrerMessage: null, unreadMessageCount: 0, attachmentCount: 1 };
const openAsk = (id: number) => ({ ...base, id, title: "Product Designer", status: "pending", referrerId: null, createdAt: iso(Date.now() - day), updatedAt: iso(Date.now() - day) });
const declined = { ...base, id: 45, title: "Designer", companyDomain: "skipwait.me", companyName: "skipwait.me", companyInitials: "SW", status: "declined", referrerId: 503, referrerMessage: "Not my team", createdAt: iso(Date.now() - 9 * day), updatedAt: iso(Date.now() - 8 * day) };
const expired = { ...base, id: 46, title: "Analyst", status: "closed", referrerId: null, createdAt: iso(Date.now() - 12 * day), updatedAt: iso(Date.now() - 5 * day) };
// The server's open-ask slots payload (shared/openAskSlots.ts): open asks against the plan cap.
const slots = (open: number, extra: Record<string, unknown> = {}) => ({ plan: "free", planLabel: "Free", open, cap: 3, full: open >= 3, nextPlan: { id: "momentum", label: "Momentum", openRequests: 15 }, ...extra });

function stub(requests: unknown[], slotBody: unknown) {
  const fetchMock = vi.fn(async (url: string) => String(url).includes("/api/credits/summary")
    ? { ok: false, status: 500, json: async () => ({ error: "not used by this screen" }) }
    : { ok: true, status: 200, json: async () => ({ requests, slots: slotBody }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); auth.isLoaded = true; auth.isSignedIn = true; });

describe("My Requests kit v4 states", () => {
  it("gates signed-out visitors behind a sign-in panel and never loads asks", () => {
    auth.isSignedIn = false;
    const fetchMock = stub([], slots(0));
    renderPage();
    expect(screen.getByRole("heading", { name: "See the real status." })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Secure sign in/ })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not flash the sign-in gate while auth is still resolving", () => {
    auth.isLoaded = false; auth.isSignedIn = false;
    stub([], slots(0));
    renderPage();
    expect(screen.queryByRole("heading", { name: "See the real status." })).toBeNull();
    expect(document.querySelector('[data-skipwait-loading="true"]')).toBeTruthy();
  });

  it("meters open asks against the plan cap with the kit heading copy", async () => {
    const fetchMock = stub([openAsk(42), openAsk(43), declined], slots(2));
    renderPage();
    const meter = await screen.findByLabelText("Open slots: 2 of 3 used");
    expect(meter.textContent).toBe("OPEN SLOTS · FREE2/3");
    expect(screen.getByRole("progressbar", { name: "Open slots used" }).getAttribute("aria-valuenow")).toBe("2");
    expect(screen.getByText("Track every ask in one place. Answered or expired asks free a slot.")).toBeTruthy();
    expect(screen.queryByText(/slots are in use/)).toBeNull();
    // One source for the list and the meter: the credits wallet is not read here.
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/company-referrals/mine"]);
  });

  it("shows the slots-full nudge with the next plan and its cap, with withdraw as a real option", async () => {
    stub([openAsk(42), openAsk(43), openAsk(44)], slots(3));
    renderPage();
    const lead = await screen.findByText("All 3 slots are in use.");
    expect(lead.parentElement?.textContent).toBe("All 3 slots are in use. Wait for an answer, withdraw an ask, or get more slots with Momentum (15).");
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/plans");
    expect(screen.getByLabelText("Open slots: 3 of 3 used").textContent).toBe("OPEN SLOTS · FREE3/3");
  });

  // Review round 2 (D-067): no plan on sale raises the open-ask cap, so the server sends no
  // next plan and the nudge offers no "See plans" button that would lead nowhere.
  it("offers no plans button when no plan on sale raises the cap", async () => {
    stub([openAsk(42), openAsk(43), openAsk(44)], slots(3, { nextPlan: null }));
    renderPage();
    const lead = await screen.findByText("All 3 slots are in use.");
    expect(lead.parentElement?.textContent).toBe("All 3 slots are in use. Wait for an answer or withdraw an ask.");
    expect(screen.queryByRole("link", { name: "See plans" })).toBeNull();
  });

  it("does not suggest withdrawing when no ask can be withdrawn", async () => {
    stub([{ ...openAsk(42), referrerId: 501 }, { ...openAsk(43), referrerId: 502 }, { ...openAsk(44), referrerId: 503 }], slots(3));
    renderPage();
    const lead = await screen.findByText("All 3 slots are in use.");
    expect(lead.parentElement?.textContent).toBe("All 3 slots are in use. Wait for an answer or get more slots with Momentum (15).");
  });

  it("shows the plan's own label and cap, and Concierge's cap of 75", async () => {
    stub([openAsk(42)], slots(4, { plan: "start", planLabel: "Start", cap: 8, full: false }));
    renderPage();
    expect((await screen.findByLabelText("Open slots: 4 of 8 used")).textContent).toBe("OPEN SLOTS · START4/8");
    cleanup();
    stub([openAsk(42)], slots(12, { plan: "land_concierge", planLabel: "Land Concierge", cap: 75, full: false, nextPlan: null }));
    renderPage();
    expect((await screen.findByLabelText("Open slots: 12 of 75 used")).textContent).toBe("OPEN SLOTS · LAND CONCIERGE12/75");
    expect(screen.getByRole("progressbar", { name: "Open slots used" }).getAttribute("aria-valuenow")).toBe("12");
  });

  it("says the slots did not load instead of drawing a fake meter, and reloads them", async () => {
    const fetchMock = stub([openAsk(42)], { plan: "free", open: "two" });
    renderPage();
    expect(await screen.findByText(/Open slots didn’t load/)).toBeTruthy();
    expect(screen.getByLabelText("acme.com request, Requested")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ requests: [openAsk(42)], slots: slots(1) }) }));
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Open slots used" }).getAttribute("aria-valuenow")).toBe("1"));
  });

  it("lists declined and expired asks under Closed with the company name and the referrer's reason", async () => {
    stub([openAsk(42), declined, expired], slots(1));
    renderPage();
    await screen.findByLabelText("acme.com request, Requested");
    expect(screen.queryByLabelText("skipwait.me request, Declined")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Closed" }));
    const row = await screen.findByLabelText("skipwait.me request, Declined");
    expect(row.getAttribute("href")).toBe("/conversation/45");
    // Launch companies show their name and kit initials, not the raw domain.
    expect(row.textContent).toContain("skipwait.me · Not my team");
    expect(row.querySelector(".company-mark")?.textContent).toBe("SW");
    expect(row.textContent).not.toContain("Ref-");
    expect(screen.getByLabelText("acme.com request, Expired")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });

  it("shows the closed-tab empty state when nothing has closed", async () => {
    stub([openAsk(42)], slots(1));
    renderPage();
    await screen.findByLabelText("acme.com request, Requested");
    fireEvent.click(screen.getByRole("tab", { name: "Closed" }));
    expect(await screen.findByRole("heading", { name: "Nothing closed yet." })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Explore companies" })).toBeNull();
  });

  it("explains a dropped connection instead of showing zero asks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t reach skipwait.me. Check your connection and try again.");
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
