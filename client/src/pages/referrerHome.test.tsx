// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReferrerHome from "./ReferrerHome";
import Invite from "./Invite";
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
const iso = (ms: number) => new Date(ms).toISOString();
const ask = (id: number, createdMs: number, extra: Record<string, unknown> = {}) => ({ id, companyDomain: "wipro.com", status: "pending", savedAt: null, createdAt: iso(createdMs), updatedAt: iso(createdMs), isClaimedByYou: false, unreadMessageCount: 0, attachmentCount: 1, ...extra });

type HomeStub = { verified?: boolean; capacity?: number; paused?: boolean; verifiedAt?: string; reviewed?: number; replied?: number | null; fresh?: unknown[]; completed?: unknown[] };
function stubHome(options: HomeStub = {}) {
  const now = Date.now();
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/access")) return ok({ verifiedCompanyAccess: options.verified ?? true, workEmailDomain: options.verified === false ? null : "wipro.com" });
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
    expect(screen.queryByText(/THANK-YOU WALL/)).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW|EXAMPLE ASKS/)).toBeNull();
    expect((await screen.findByRole("link", { name: /Private ask · Ref-1031/ })).getAttribute("href")).toBe("/conversation/31?from=inbox");
    expect(screen.getAllByText("Wipro · 1 file attached")).toHaveLength(2);
  });

  it("flags at-capacity from real review load and links to adjust it", async () => {
    stubHome({ capacity: 1, completed: [{ id: 40, companyDomain: "wipro.com", status: "approved", isClaimedByYou: true, unreadMessageCount: 0, createdAt: "2026-09-01T08:00:00Z" }] });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("You've hit your capacity.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Adjust capacity" }).getAttribute("href")).toBe("/referrer-setup");
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

  it("shows private record metrics without ranking generosity or a thank-you count", async () => {
    stubHome({ fresh: [], reviewed: 4, replied: 100 });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("YOUR RECORD · PRIVATE")).toBeTruthy();
    expect(screen.getByText("People helped")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.queryByText("Thank-yous")).toBeNull();
    expect(screen.getByText("No asks right now.")).toBeTruthy();
  });

  it("greets a brand-new referrer with the honest first-ask empty state", async () => {
    stubHome({ fresh: [], reviewed: 0 });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Your first ask will appear here.")).toBeTruthy();
    expect(screen.getByText(/verified referrer at Wipro/)).toBeTruthy();
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
    stubHome({ verifiedAt: iso(Date.now() - 80 * DAY) });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText(/Re-verify your Wipro email soon/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Re-verify" }).getAttribute("href")).toBe("/verify");
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
      if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com" });
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
      if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com" });
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
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
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
      access: { verified: true, domain: "wipro.com" },
      preferences: { referralCapacity: 3, preferAreas: [], preferLevels: [], referrerVisibility: "anon", notifyNewAsk: true, paused: false },
      verifiedAt: "2026-09-20T06:00:00.000Z", profileCapacity: 3, impact: null,
      fresh: [{ id: 1, companyDomain: "wipro.com", status: "pending", createdAt: "2026-10-01T16:30:00.000Z", isClaimedByYou: false, unreadMessageCount: 0 }, { id: 2, companyDomain: "wipro.com", status: "approved", createdAt: "2026-10-01T16:30:00.000Z", isClaimedByYou: true, unreadMessageCount: 0 }],
      completed: [{ id: 2, companyDomain: "wipro.com", status: "approved", createdAt: "2026-10-01T16:30:00.000Z", isClaimedByYou: true, unreadMessageCount: 0 }, { id: 3, companyDomain: "wipro.com", status: "declined", createdAt: "2026-10-01T16:30:00.000Z", isClaimedByYou: true, unreadMessageCount: 0 }],
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
    expect(screen.getByRole("button", { name: /Share/ })).toBeTruthy();
    expect(screen.queryByText(/DESIGN PREVIEW/)).toBeNull();
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
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ok({ suggestion: { id: 7, companyName: "Acme Labs" } }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    expect(screen.getByText("Tell us where you want to work.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("Name the company you want to see.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Acme Labs" } });
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("That’s the growth loop.")).toBeTruthy();
    expect(screen.getByText(/We saved your request for Acme Labs/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/company-suggestions", expect.objectContaining({ method: "POST", body: JSON.stringify({ companyName: "Acme Labs", role: "seeker" }) }));
  });

  it("points a listed company to its door instead of filing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "wipro" } });
    expect(screen.getByText(/Wipro already has a door on SkipWait/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open it" }).getAttribute("href")).toBe("/explore/wipro");
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's reason when a company request is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(400, { error: "This company was already suggested and is under review" })));
    renderWithQuery(<Invite />);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Acme Labs" } });
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("This company was already suggested and is under review")).toBeTruthy();
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
