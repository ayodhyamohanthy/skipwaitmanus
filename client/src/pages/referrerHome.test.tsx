// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReferrerHome from "./ReferrerHome";
import { deriveReferrerHome, type ReferrerHomeData } from "@/components/referrer-home/referrerData";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, userId: "11", getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children, className }: { children?: React.ReactNode; className?: string }) => <button type="button" className={className}>{children ?? "Sign in"}</button> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/referrer-home", go],
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });
const renderWithQuery = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();
// Server contract: rows and the access check carry the company directory's name and initials.
const ask = (id: number, createdMs: number, extra: Record<string, unknown> = {}) => ({ id, companyDomain: "wipro.com", companyName: "Wipro", companyInitials: "W", status: "pending", savedAt: null, createdAt: iso(createdMs), updatedAt: iso(createdMs), isClaimedByYou: false, unreadMessageCount: 0, attachmentCount: 1, ...extra });

type HomeStub = { verified?: boolean; capacity?: number; paused?: boolean; verifiedAt?: string; reviewed?: number; replied?: number | null; fresh?: unknown[]; completed?: unknown[]; wall?: unknown };
function stubHome(options: HomeStub = {}) {
  const now = Date.now();
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/access")) return ok(options.verified === false ? { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null } : { verifiedCompanyAccess: true, workEmailDomain: "wipro.com", companyName: "Wipro", companyInitials: "W" });
    if (path.endsWith("/referrer/thank-yous")) return ok(options.wall ?? { thankYous: [], total: 0 });
    if (path.endsWith("/referrer-preferences") && init?.method === "PUT") return ok({ preferences: { referralCapacity: options.capacity ?? 3, paused: JSON.parse(String(init.body)).paused } });
    if (path.endsWith("/referrer-preferences")) return ok({ preferences: { referralCapacity: options.capacity ?? 3, preferAreas: ["Design"], referrerVisibility: "anon", notifyNewAsk: true, paused: options.paused ?? false } });
    if (path.endsWith("/profile/me")) return ok({ profile: { workEmailVerifiedAt: options.verifiedAt ?? iso(now - 20 * DAY), referralCapacity: options.capacity ?? 3 } });
    if (path.endsWith("/referrer-impact/me")) return ok({ summary: { reviewed: options.reviewed ?? 2, approved: 1, introductions: 1, interviews: 0, offers: 0, repliedWithin3DaysPct: options.replied ?? null } });
    if (path.includes("scope=new")) return ok({ requests: options.fresh ?? [ask(31, now - 2 * DAY), ask(32, now - 2 * DAY)] });
    if (path.includes("scope=completed")) return ok({ requests: options.completed ?? [] });
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ReferrerHome", () => {
  it("shows real waiting referrals, capacity, and private records for verified referrers", async () => {
    stubHome();
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Verified at Wipro")).toBeTruthy();
    expect(screen.getByText("Referral requests waiting").parentElement?.textContent).toBe("2Referral requests waiting");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("3 of 3 remaining");
    expect(screen.getByRole("region", { name: "Your private referral record" })).toBeTruthy();
    expect(screen.queryByText(/Asha/)).toBeNull();
    const wall = screen.getByRole("region", { name: "Your private thank-you notes" });
    expect(within(wall).getByText("Notes from people you help will appear here. Only you can see them.")).toBeTruthy();
    expect(screen.queryByText(/DESIGN PREVIEW|EXAMPLE ASKS/)).toBeNull();
    expect((await screen.findByRole("link", { name: /Private referral request · Ref-1031/ })).getAttribute("href")).toBe("/queue?request=31");
    expect(screen.queryByRole("link", { name: "Become a referrer" })).toBeNull();
    expect(screen.getAllByTestId("goal-referrer-row-meta").map(row => row.textContent)).toEqual([
      "Ref-1031 · Wipro · 1 attached file",
      "Ref-1032 · Wipro · 1 attached file",
    ]);
  });

  it("uses the known job function and falls back to the verified company", async () => {
    const now = Date.now();
    stubHome({ fresh: [ask(31, now - 2 * DAY, { jobFunction: "Design" }), ask(32, now - 2 * DAY, { jobFunction: "Astrology" })] });
    renderWithQuery(<ReferrerHome />);
    const rows = await screen.findAllByTestId("goal-referrer-row-meta");
    expect(rows.map(row => row.textContent)).toEqual([
      "Ref-1031 · Design · 1 attached file",
      "Ref-1032 · Wipro · 1 attached file",
    ]);
  });

  it("flags at-capacity from real review load and links to open referrals", async () => {
    stubHome({ capacity: 1, completed: [{ id: 40, companyDomain: "wipro.com", status: "approved", isClaimedByYou: true, unreadMessageCount: 0, createdAt: "2026-09-01T08:00:00Z" }] });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("You have reached your referral capacity.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review open referrals" }).getAttribute("href")).toBe("/queue");
    expect(screen.getByRole("progressbar", { name: "0 of 1 monthly referral capacity remaining" }).getAttribute("aria-valuenow")).toBe("0");
  });

  it("counts only referrals expiring within a day and labels both real deadlines", async () => {
    const now = Date.now();
    stubHome({ fresh: [ask(51, now - 6.5 * DAY), ask(52, now - 2 * DAY, { expiresAt: iso(now + 5 * DAY) })] });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Expiring soon")).toBeTruthy();
    expect(screen.getByText("Expiring soon").parentElement?.textContent).toBe("1Expiring soon");
    const later = screen.getByRole("link", { name: /Ref-1052/ });
    const soon = screen.getByRole("link", { name: /Ref-1051/ });
    expect(within(later).getByText(/days left/).textContent).toBe("5 days left");
    expect(within(soon).getByText(/day left/).textContent).toBe("1 day left");
  });

  it("shows private record metrics without ranking generosity and counts only server thank-yous", async () => {
    stubHome({ fresh: [], reviewed: 4, replied: 100 });
    renderWithQuery(<ReferrerHome />);
    const record = await screen.findByRole("region", { name: "Your private referral record" });
    expect(within(record).getByText("People helped")).toBeTruthy();
    expect(within(record).getByText("100%")).toBeTruthy();
    expect(within(record).getByText("Never ranked. Never public.")).toBeTruthy();
    // An empty wall reads 0, and a wall the server did not answer reads "—".
    expect(within(record).getByText("Thank-yous").nextElementSibling?.textContent).toBe("0");
    expect(screen.getByText("No referral requests right now.")).toBeTruthy();
  });

  it("shows the notes a seeker let this referrer keep, with no sample people", async () => {
    stubHome({
      fresh: [],
      wall: { thankYous: [{ id: 5, message: "I start on the 3rd, thanks to you.", seekerName: "Kavya Menon", roleTitle: "Data Analyst", createdAt: "2026-10-10T09:00:00.000Z" }], total: 4 },
    });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText(/I start on the 3rd, thanks to you\./)).toBeTruthy();
    expect(screen.getByText("Kavya Menon · Data Analyst")).toBeTruthy();
    expect(screen.getByText("Thank-yous").nextElementSibling?.textContent).toBe("4");
    expect(screen.queryByText(/Asha|Rahul|example/i)).toBeNull();
  });

  it("shows no thank-you count when the wall did not load", async () => {
    stubHome({ fresh: [] });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/referrer/thank-yous")) return fail(500, { error: "We could not load your thank-yous" });
      if (path.endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com", companyName: "Wipro", companyInitials: "W" });
      if (path.endsWith("/referrer-preferences")) return ok({ preferences: { referralCapacity: 3, preferAreas: [], referrerVisibility: "anon", notifyNewAsk: true, paused: false } });
      if (path.includes("scope=new") || path.includes("scope=completed")) return ok({ requests: [] });
      return fail(404, {});
    }));
    renderWithQuery(<ReferrerHome />);
    const record = await screen.findByRole("region", { name: "Your private referral record" });
    expect(within(record).getByText("Thank-yous").nextElementSibling?.textContent).toBe("—");
    expect(screen.getByText("Notes from people you help will appear here. Only you can see them.")).toBeTruthy();
  });

  it("shows an honest first-referral empty state for a brand-new referrer", async () => {
    stubHome({ fresh: [], reviewed: 0 });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Your first referral request will appear here.")).toBeTruthy();
    expect(screen.getByText(/Referral requests for Wipro now reach you privately/)).toBeTruthy();
    expect(screen.queryByText(/verified referrer at/)).toBeNull();
    expect(screen.queryByText(/Seekers can now find/)).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows the verify gate without fabricating referrer state", async () => {
    const fetchMock = stubHome({ verified: false });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Verify a work email to begin.")).toBeTruthy();
    expect(screen.queryByText("Referral requests waiting")).toBeNull();
    expect(screen.getByRole("link", { name: "Become a referrer" }).getAttribute("href")).toBe("/verify");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/inbox"))).toBe(false);
  });

  it("warns when re-verification approaches, driven by the real verified date", async () => {
    // 85 days after the grandfathering epoch (2026-10-16) the badge has 5 days left.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-16T00:00:00Z") + 85 * DAY });
    try {
      stubHome({ verifiedAt: "2026-10-16T00:00:00.000Z" });
      renderWithQuery(<ReferrerHome />);
      expect(await screen.findByText("Re-verify your Wipro email within 5 days to keep receiving referral requests.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Re-verify" }).getAttribute("href")).toBe("/verify");
    } finally { vi.useRealTimers(); }
  });

  it("shows the paused state with a working resume", async () => {
    const fetchMock = stubHome({ paused: true, fresh: [] });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("New referral requests are paused. Open conversations remain available.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume referral requests" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/referrer-preferences", expect.objectContaining({ method: "PUT", body: JSON.stringify({ paused: false }) })));
    await waitFor(() => expect(screen.queryByText("New referral requests are paused. Open conversations remain available.")).toBeNull());
    expect(screen.getByRole("button", { name: "Pause referral requests" })).toBeTruthy();
  });

  it("keeps the paused state and says so when the pause change fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/referrer-preferences") && init?.method === "PUT") return fail(500, { error: "We could not save your referrer settings" });
      if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com", companyName: "Wipro", companyInitials: "W" });
      if (String(url).endsWith("/referrer-preferences")) return ok({ preferences: { referralCapacity: 3, paused: true } });
      return ok({ requests: [], summary: { reviewed: 1, approved: 0, introductions: 0, interviews: 0, offers: 0 } });
    }));
    renderWithQuery(<ReferrerHome />);
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    expect(await screen.findByText("We could not save your referrer settings")).toBeTruthy();
    expect(screen.getByText("New referral requests are paused. Open conversations remain available.")).toBeTruthy();
  });

  it("shows a retryable error instead of the verify gate when loading fails", async () => {
    let failing = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com", companyName: "Wipro", companyInitials: "W" });
      if (String(url).includes("/inbox") && failing) throw new TypeError("Failed to fetch");
      if (String(url).endsWith("/referrer-preferences")) return ok({ preferences: { referralCapacity: 3 } });
      return ok({ requests: [] });
    }));
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("We could not load your referral home.")).toBeTruthy();
    expect(screen.queryByText("Verify a work email to begin.")).toBeNull();
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Referral requests waiting")).toBeTruthy();
  });

  it("asks signed-out visitors to sign in without calling referrer APIs", () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<ReferrerHome />);
    expect(screen.getByRole("link", { name: "Sign in with work email" }).getAttribute("href")).toBe("/sign-in?intent=referrer&returnTo=%2Freferrer-home");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("referrer home derivation", () => {
  it("counts only pending asks and active claimed load", () => {
    const now = Date.parse("2026-10-08T04:30:00Z");
    const data: ReferrerHomeData = {
      access: { verified: true, domain: "wipro.com", companyName: "Wipro", companyInitials: "W" },
      preferences: { referralCapacity: 3, preferAreas: [], preferLevels: [], referrerVisibility: "anon", notifyNewAsk: true, paused: false },
      verifiedAt: "2026-09-20T06:00:00.000Z", profileCapacity: 3, impact: null,
      thankYous: null,
      hasEverReviewed: null,
      fresh: [{ id: 1, companyDomain: "wipro.com", jobFunction: null, status: "pending", createdAt: "2026-10-01T16:30:00.000Z", isClaimedByYou: false, unreadMessageCount: 0 }, { id: 2, companyDomain: "wipro.com", jobFunction: null, status: "approved", createdAt: "2026-10-01T16:30:00.000Z", isClaimedByYou: true, unreadMessageCount: 0 }],
      completed: [{ id: 2, companyDomain: "wipro.com", jobFunction: null, status: "approved", createdAt: "2026-10-01T16:30:00.000Z", isClaimedByYou: true, unreadMessageCount: 0 }, { id: 3, companyDomain: "wipro.com", jobFunction: null, status: "declined", createdAt: "2026-10-01T16:30:00.000Z", isClaimedByYou: true, unreadMessageCount: 0 }],
    };
    const view = deriveReferrerHome(data, now);
    expect(view.waiting.map(row => row.id)).toEqual([1]);
    expect(view.expiringSoon).toBe(1);
    expect([view.used, view.left, view.atCapacity]).toEqual([1, 2, false]);
    expect(view.company).toEqual({ name: "Wipro", mark: "W" });
    expect(view.reverifyDue).toBe(false);
  });
});

describe("ReferrerHome re-verification notice", () => {
  it.each([
    [89, "Re-verify your Wipro email within 1 day to keep receiving referral requests."],
    [90, "Re-verify your Wipro email now to keep receiving referral requests."],
  ])("uses the verification date when %i days have passed", async (age, message) => {
    const verifiedAt = "2026-10-16T00:00:00.000Z";
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse(verifiedAt) + age * DAY });
    try {
      stubHome({ verifiedAt });
      renderWithQuery(<ReferrerHome />);
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Re-verify" }).getAttribute("href")).toBe("/verify");
    } finally { vi.useRealTimers(); }
  });
});
