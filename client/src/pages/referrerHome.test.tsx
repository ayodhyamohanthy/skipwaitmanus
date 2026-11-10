// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReferrerHome from "./ReferrerHome";
import Invite from "./Invite";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import { deriveReferrerHome, greetingFor, type ReferrerHomeData } from "@/components/referrer-home/referrerData";

const { authState, go, search } = vi.hoisted(() => ({ authState: { isSignedIn: true, userId: "11", getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn(), search: { value: "" } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children, className }: { children?: React.ReactNode; className?: string }) => <button type="button" className={className}>{children ?? "Sign in"}</button> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/referrer-home", go],
  useSearch: () => search.value,
}));

beforeEach(() => { authState.isSignedIn = true; search.value = ""; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });
const renderWithQuery = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
const DAY = 86400000;
const DIRECTORY = { companies: LAUNCH_COMPANY_SEED.map(seed => ({ slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals: true })), openCount: LAUNCH_COMPANY_SEED.length };
const suggestionPosts = (fetchMock: { mock: { calls: unknown[][] } }) => fetchMock.mock.calls.filter(call => call[0] === "/api/company-suggestions");
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
  it("shows real new asks, capacity, and private record for verified referrers", async () => {
    stubHome();
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Verified · Wipro")).toBeTruthy();
    expect(screen.getByText("New asks waiting")).toBeTruthy();
    expect(screen.getByText("YOUR RECORD · PRIVATE")).toBeTruthy();
    expect(screen.queryByText(/Asha/)).toBeNull();
    // The wall is live now, but it only ever shows notes the server sent: none yet is
    // the kit's honest empty state, never the prototype's sample note.
    expect(screen.getByText("YOUR THANK-YOU WALL · PRIVATE")).toBeTruthy();
    expect(screen.getByText("Notes from people you help will live here. Only you can see them.")).toBeTruthy();
    expect(screen.queryByText(/DESIGN PREVIEW|EXAMPLE ASKS/)).toBeNull();
    expect((await screen.findByRole("link", { name: /Private ask · Ref-1031/ })).getAttribute("href")).toBe("/queue?request=31");
    expect(screen.getByRole("link", { name: "Become a referrer" }).getAttribute("href")).toBe("/verify");
    expect(screen.getAllByText("Wipro · 1 file attached")).toHaveLength(2);
  });

  it("leads a waiting row with the ask's job function when it has one", async () => {
    const now = Date.now();
    stubHome({ fresh: [ask(31, now - 2 * DAY, { jobFunction: "Design" }), ask(32, now - 2 * DAY, { jobFunction: "Astrology" })] });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Design · 1 file attached")).toBeTruthy();
    expect(screen.getByText("Wipro · 1 file attached")).toBeTruthy();
  });

  it("flags at-capacity from real review load and links to adjust it", async () => {
    stubHome({ capacity: 1, completed: [{ id: 40, companyDomain: "wipro.com", status: "approved", isClaimedByYou: true, unreadMessageCount: 0, createdAt: "2026-09-01T08:00:00Z" }] });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("You've hit your capacity.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Adjust capacity" }).getAttribute("href")).toBe("/referrer?view=setup");
    expect(screen.getByRole("progressbar", { name: "Capacity used" }).getAttribute("aria-valuenow")).toBe("1");
  });

  it("counts asks expiring within 24h and labels row deadlines from real timestamps", async () => {
    const now = Date.now();
    stubHome({ fresh: [ask(51, now - 6.5 * DAY), ask(52, now - 2 * DAY, { expiresAt: iso(now + 5 * DAY) })] });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Expiring within 24h")).toBeTruthy();
    expect(screen.getByText("Expiring within 24h").parentElement?.textContent).toContain("1");
    expect(await screen.findByText("5 days left")).toBeTruthy();
    const urgent = await screen.findByText("1 day left");
    expect(urgent.className).toContain("text-destructive");
  });

  it("shows private record metrics without ranking generosity and counts only server thank-yous", async () => {
    stubHome({ fresh: [], reviewed: 4, replied: 100 });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("YOUR RECORD · PRIVATE")).toBeTruthy();
    expect(screen.getByText("People helped")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    // An empty wall reads 0, and a wall the server did not answer reads "—".
    expect(screen.getByText("Thank-yous").parentElement?.textContent).toBe("Thank-yous0");
    expect(screen.getByText("No asks right now.")).toBeTruthy();
  });

  it("shows the notes a seeker let this referrer keep, with no sample people", async () => {
    stubHome({
      fresh: [],
      wall: { thankYous: [{ id: 5, message: "I start on the 3rd, thanks to you.", seekerName: "Kavya Menon", roleTitle: "Data Analyst", createdAt: "2026-10-10T09:00:00.000Z" }], total: 4 },
    });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText(/I start on the 3rd, thanks to you\./)).toBeTruthy();
    expect(screen.getByText("Kavya Menon · Data Analyst")).toBeTruthy();
    expect(screen.getByText("Thank-yous").parentElement?.textContent).toBe("Thank-yous4");
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
    expect(await screen.findByText("YOUR RECORD · PRIVATE")).toBeTruthy();
    expect(screen.getByText("Thank-yous").parentElement?.textContent).toBe("Thank-yous—");
    expect(screen.getByText("Notes from people you help will live here. Only you can see them.")).toBeTruthy();
  });

  it("greets a brand-new referrer with the honest first-ask empty state", async () => {
    stubHome({ fresh: [], reviewed: 0 });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Your first ask will appear here.")).toBeTruthy();
    expect(screen.getByText(/Referral requests for Wipro now reach you privately/)).toBeTruthy();
    expect(screen.queryByText(/verified referrer at/)).toBeNull();
    expect(screen.queryByText(/Seekers can now find/)).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows the verify gate without fabricating referrer state", async () => {
    const fetchMock = stubHome({ verified: false });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Verify a work email to begin.")).toBeTruthy();
    expect(screen.queryByText("New asks waiting")).toBeNull();
    expect(screen.getByRole("link", { name: "Become a referrer" }).getAttribute("href")).toBe("/verify");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/inbox"))).toBe(false);
  });

  it("warns when re-verification approaches, driven by the real verified date", async () => {
    // 85 days after the grandfathering epoch (2026-10-16) the badge has 5 days left.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-16T00:00:00Z") + 85 * DAY });
    try {
      stubHome({ verifiedAt: "2026-10-16T00:00:00.000Z" });
      renderWithQuery(<ReferrerHome />);
      expect(await screen.findByText("Re-verify your Wipro email within 5 days to keep receiving asks.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Re-verify" }).getAttribute("href")).toBe("/verify");
    } finally { vi.useRealTimers(); }
  });

  it("shows the paused state with a working resume", async () => {
    const fetchMock = stubHome({ paused: true, fresh: [] });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("New asks are paused. Open conversations still work.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume new asks" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/referrer-preferences", expect.objectContaining({ method: "PUT", body: JSON.stringify({ paused: false }) })));
    await waitFor(() => expect(screen.queryByText("New asks are paused. Open conversations still work.")).toBeNull());
    expect(screen.getByRole("button", { name: "Pause new asks" })).toBeTruthy();
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
    expect(screen.getByText("New asks are paused. Open conversations still work.")).toBeTruthy();
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
    expect(await screen.findByText("We could not load your referrer day.")).toBeTruthy();
    expect(screen.queryByText("Verify a work email to begin.")).toBeNull();
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("New asks waiting")).toBeTruthy();
  });

  it("asks signed-out visitors to sign in without calling referrer APIs", () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<ReferrerHome />);
    expect(screen.getByRole("link", { name: "Sign in with work email" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("referrer home derivation", () => {
  it("greets by the viewer's local hour", () => {
    expect(greetingFor(9)).toBe("Good morning");
    expect(greetingFor(14)).toBe("Good afternoon");
    expect(greetingFor(20)).toBe("Good evening");
    expect(greetingFor(2)).toBe("Good evening");
  });

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

describe("Invite colleagues and request companies", () => {
  it("issues the real personal invite link with copy, share and email", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ invite: { inviteCode: "r11-abcdef01" } })));
    renderWithQuery(<Invite />);
    fireEvent.click(screen.getByRole("button", { name: /Invite someone inside/ }));
    expect(await screen.findByText(/\/verify\?invite=r11-abcdef01/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy invitation link" }));
    expect(await screen.findByText("Copied")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Email invite/ }).getAttribute("href")).toMatch(/^mailto:/);
    // Kit row: the link, its icon and one primary "Email invite"; no extra Share button or paragraph.
    expect(screen.queryByRole("button", { name: /^Share$/ })).toBeNull();
    expect(screen.queryByText(/One link per person/)).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW/)).toBeNull();
  });

  it("folds the native share sheet into the link icon where the device has one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    try {
      search.value = "mode=invite";
      vi.stubGlobal("fetch", vi.fn(async () => ok({ invite: { inviteCode: "r11-abcdef01" } })));
      renderWithQuery(<Invite />);
      fireEvent.click(await screen.findByRole("button", { name: "Share invitation link" }));
      await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining("/verify?invite=r11-abcdef01") })));
    } finally {
      Reflect.deleteProperty(navigator, "share");
    }
  });

  it("opens straight on the invite link from referrer home and leads back there", async () => {
    search.value = "mode=invite";
    vi.stubGlobal("fetch", vi.fn(async () => ok({ invite: { inviteCode: "r11-abcdef01" } })));
    renderWithQuery(<Invite />);
    expect(await screen.findByText(/\/verify\?invite=r11-abcdef01/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to referrer home/ }).getAttribute("href")).toBe("/referrer-home");
  });

  it("shows a retryable error when the invite link cannot be issued", async () => {
    search.value = "mode=invite";
    vi.stubGlobal("fetch", vi.fn(async () => fail(503, { error: "Personal invites are not available yet" })));
    renderWithQuery(<Invite />);
    expect(await screen.findByText("Personal invites are not available yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("files a real seeker-demand company request without creating a referral request", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => (url === "/api/companies" ? ok(DIRECTORY) : ok({ suggestion: { id: 7, companyName: "Acme Labs" } })));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    expect(screen.getByText("Tell us where you want to work.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("Name the company you want to see.")).toBeTruthy();
    expect(suggestionPosts(fetchMock)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Acme Labs" } });
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("That’s the growth loop.")).toBeTruthy();
    expect(screen.getByText(/We saved your request for Acme Labs/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/company-suggestions", expect.objectContaining({ method: "POST", body: JSON.stringify({ companyName: "Acme Labs", role: "seeker" }) }));
  });

  it("sends the kit's work function with the vote and stays truthful about a vote already filed", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => (url === "/api/companies" ? ok(DIRECTORY) : ok({ suggestion: { id: 7, companyName: "Acme Labs", jobFunction: "Design", alreadyRecorded: true } })));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Acme Labs" } });
    fireEvent.change(screen.getByLabelText("Work function"), { target: { value: "Design" } });
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText(/You had already asked for Acme Labs, so your vote counts once/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/company-suggestions", expect.objectContaining({ method: "POST", body: JSON.stringify({ companyName: "Acme Labs", role: "seeker", jobFunction: "Design" }) }));
  });

  it("points a listed company to its door instead of filing a request", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => (url === "/api/companies" ? ok(DIRECTORY) : fail(500, {})));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    await waitFor(() => expect(document.querySelectorAll("#launch-companies option")).toHaveLength(5));
    expect(Array.from(document.querySelectorAll("#launch-companies option")).map(option => option.getAttribute("value"))).toEqual(["skipwait.me", "Wipro", "Neutrinos", "TCS", "Merkle"]);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "wipro" } });
    expect(screen.getByText(/Wipro already has a door on skipwait.me/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open it" }).getAttribute("href")).toBe("/explore/wipro");
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(suggestionPosts(fetchMock)).toHaveLength(0);
  });

  it("still files a request when the company list cannot load", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => (url === "/api/companies" ? fail(503, { error: "The company directory is unavailable right now" }) : ok({ suggestion: { id: 8, companyName: "Wipro" } })));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    expect(await screen.findByText(/couldn’t load the companies already on skipwait.me/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Wipro" } });
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("That’s the growth loop.")).toBeTruthy();
    expect(suggestionPosts(fetchMock)).toHaveLength(1);
  });

  it("shows the server's reason when a company request is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(400, { error: "You can suggest up to 3 companies a day" })));
    renderWithQuery(<Invite />);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Acme Labs" } });
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("You can suggest up to 3 companies a day")).toBeTruthy();
  });

  it("keeps requests and invites behind sign-in", () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Invite someone inside/ }));
    expect(screen.getByText("Invite someone inside.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reverifyCopy", () => {
  it("pluralises and handles due-now", async () => {
    const { reverifyCopy } = await import("./ReferrerHome");
    expect(reverifyCopy("Wipro", 1)).toBe("Re-verify your Wipro email within 1 day to keep receiving asks.");
    expect(reverifyCopy("Wipro", 0)).toBe("Re-verify your Wipro email now to keep receiving asks.");
  });
});
