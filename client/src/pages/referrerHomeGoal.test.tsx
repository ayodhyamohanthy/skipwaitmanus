// @vitest-environment jsdom
// D-048-p3-referrer-home: flag-off parity and flag-on goal rebuild for
// /referrer-home. Stubs mirror client/src/pages/referrerHome.test.tsx.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReferrerHome from "./ReferrerHome";
import ReferrerSetup from "./ReferrerSetup";
import { assertGoalPage } from "@/test/goalPageContract";
import { REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { GOAL_PAGE as HOME_GOAL } from "./goal/referrer-home/GoalReferrerHome";
import { GOAL_PAGE as SETUP_GOAL } from "./goal/referrer-home/GoalReferrerSetup";

const { authState, surfaces } = vi.hoisted(() => ({ authState: { isSignedIn: true, userId: "11", getToken: vi.fn().mockResolvedValue("test-token") }, surfaces: { on: new Set<string>() } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children ?? "Sign in"}</button> }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/referrer-home", vi.fn()],
  useSearch: () => "",
}));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const renderWithQuery = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();
const ask = (id: number, createdMs: number, extra: Record<string, unknown> = {}) => ({ id, companyDomain: "wipro.com", companyName: "Wipro", companyInitials: "W", status: "pending", savedAt: null, createdAt: iso(createdMs), updatedAt: iso(createdMs), isClaimedByYou: false, unreadMessageCount: 0, attachmentCount: 1, ...extra });
const unavailable = async () => ({ ok: false, status: 503, json: async () => ({ error: "Service unavailable" }) });
const originalOnlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

function setOffline() {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
  window.dispatchEvent(new Event("offline"));
}

type HomeStub = { verified?: boolean; paused?: boolean; reverifyDays?: number; fresh?: unknown[]; neverReviewed?: boolean };
function stubHome(options: HomeStub = {}) {
  const now = Date.now();
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/access")) return ok(options.verified === false ? { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null } : { verifiedCompanyAccess: true, workEmailDomain: "wipro.com", companyName: "Wipro", companyInitials: "W" });
    if (path.endsWith("/referrer/thank-yous")) return ok({ thankYous: [], total: 0 });
    if (path.endsWith("/referrer-preferences") && init?.method === "PUT") return ok({ preferences: { referralCapacity: 3, paused: JSON.parse(String(init.body)).paused } });
    if (path.endsWith("/referrer-preferences")) return ok({ preferences: { referralCapacity: 3, preferAreas: ["Design"], referrerVisibility: "anon", notifyNewAsk: true, paused: options.paused ?? false } });
    if (path.endsWith("/profile/me")) return ok({ profile: { workEmailVerifiedAt: options.reverifyDays === undefined ? iso(now - 20 * DAY) : iso(now - (30 - options.reverifyDays) * DAY), referralCapacity: 3 } });
    if (path.endsWith("/referrer-impact/me")) return ok({ summary: { reviewed: options.neverReviewed ? 0 : 2, approved: 1, introductions: 1, interviews: 0, offers: 0, repliedWithin3DaysPct: 100 } });
    if (path.includes("scope=new")) return ok({ requests: options.fresh ?? [ask(31, now - 2 * DAY), ask(32, now - 2 * DAY, { expiresAt: iso(now + 5 * HOUR) })], hasEverReviewed: options.neverReviewed ? false : true });
    if (path.includes("scope=completed")) return ok({ requests: options.neverReviewed ? [] : [{ id: 40, companyDomain: "wipro.com", status: "approved", isClaimedByYou: true, unreadMessageCount: 0, createdAt: iso(now - 10 * DAY) }] });
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const HOUR = 3600000;

beforeEach(() => { onlineManager.setOnline(true); authState.isSignedIn = true; surfaces.on = new Set(["referrer-home"]); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalOnlineDescriptor) Object.defineProperty(window.navigator, "onLine", originalOnlineDescriptor);
  else Reflect.deleteProperty(window.navigator, "onLine");
  window.dispatchEvent(new Event("online"));
  onlineManager.setOnline(true);
});

describe("Goal /referrer-home flag gate", () => {
  it("renders the kit home untouched when the flag is off", async () => {
    surfaces.on = new Set();
    stubHome();
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Waiting for you")).toBeTruthy();
    expect(screen.queryByText("Answer the asks waiting for you.")).toBeNull();
  });
});

describe("Goal /referrer-home", () => {
  it("uses the goal-page contract, verified and count primitives, and approved no-payout copy", async () => {
    stubHome();
    const { container } = renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Referral requests waiting for your review")).toBeTruthy();
    expect(screen.getByText(HOME_GOAL.goalLine)).toBeTruthy();
    expect(screen.getByText("Referral requests waiting for your review")).toBeTruthy();
    expect(screen.getByText("Expiring soon")).toBeTruthy();
    expect((await screen.findByRole("link", { name: /Private referral request · Ref-1031/ })).getAttribute("href")).toBe("/queue?request=31");
    expect(screen.getByText("Your private record")).toBeTruthy();
    expect(screen.getByText("Never ranked. Never public.")).toBeTruthy();
    expect(screen.getByTestId("goal-verified-mark")).toBeTruthy();
    expect(screen.getAllByTestId("goal-num").length).toBeGreaterThan(0);
    expect(screen.getByText(REFERRER_MONEY_SENTENCE)).toBeTruthy();
    assertGoalPage(container, HOME_GOAL);
    expect(container.querySelector("main.g-scope")).toBeTruthy();
    expect(container.querySelector("main.bg-white")).toBeNull();
    const userCopy = (container.textContent ?? "").replace(REFERRER_MONEY_SENTENCE, "");
    expect(userCopy).not.toMatch(/\basks?\b/i);
    expect(container.textContent).not.toMatch(/\bcredits?\b/i);
  });

  it("keeps requests behind work-email sign-in via the referrer OTP href", () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<ReferrerHome />);
    const link = screen.getByRole("link", { name: "Sign in with work email" });
    expect(link.getAttribute("href")).toBe("/sign-in?intent=referrer&returnTo=%2Freferrer-home");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gates unverified employees on work-email verification", async () => {
    stubHome({ verified: false });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Verify a work email to begin.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Verify work email" }).getAttribute("href")).toBe("/verify");
  });

  it("shows the Become a referrer link only before verification", async () => {
    stubHome({ verified: false });
    const { unmount } = renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Verify a work email to begin.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Become a referrer" }).getAttribute("href")).toBe("/verify");
    unmount();
    stubHome({ fresh: [] });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Verified at Wipro")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Become a referrer" })).toBeNull();
  });

  it("shows inert sample referral-request rows without claiming a decline releases credit", async () => {
    stubHome({ fresh: [], neverReviewed: true });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("SAMPLE · NOT REAL REFERRAL REQUESTS")).toBeTruthy();
    expect(screen.getAllByText("SAMPLE").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Sample/ })).toBeNull();
    const sampleText = screen.getByTestId("goal-referrer-sample-rows").textContent ?? "";
    expect(sampleText).not.toMatch(/credit|release|pass/i);
  });

  it("resumes a paused queue with a real preferences write", async () => {
    const fetchMock = stubHome({ paused: true });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("New referral requests are paused. Open conversations remain available.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Resume$/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/referrer-preferences") && call[1]?.method === "PUT" && String(call[1]?.body).includes('"paused":false'))).toBeTruthy());
  });

  it("shows an explicit empty state after a verified referrer has reviewed before", async () => {
    stubHome({ fresh: [], neverReviewed: false });
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByTestId("goal-empty-state")).toBeTruthy();
    expect(screen.getByText("No referral requests right now.")).toBeTruthy();
  });

  it("keeps the loading state visible while the home request is stalled", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    renderWithQuery(<ReferrerHome />);
    expect(screen.getByTestId("goal-skeleton-rows")).toBeTruthy();
  });

  it("renders the error state and retries the real home query", async () => {
    const fetchMock = stubHome();
    const successImplementation = fetchMock.getMockImplementation();
    if (!successImplementation) throw new Error("Expected the home stub implementation.");
    let shouldFail = true;
    fetchMock.mockImplementation((url, init) => shouldFail ? unavailable() : successImplementation(url, init));
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByTestId("goal-error-state")).toBeTruthy();
    const callsBeforeRetry = fetchMock.mock.calls.length;
    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(HOME_GOAL.goalLine)).toBeTruthy();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it("announces an offline connection after the page has loaded", async () => {
    stubHome();
    renderWithQuery(<ReferrerHome />);
    expect(await screen.findByText("Your private record")).toBeTruthy();
    setOffline();
    expect(await screen.findByTestId("goal-offline-state")).toBeTruthy();
  });
});

const SETUP_PREFS = { preferences: { preferAreas: ["Design"], preferLevels: ["Mid-level"], referralCapacity: 3, referrerVisibility: "anon", notifyNewAsk: true, notifyDigest: false, paused: false } };
function stubSetup(preferences: Record<string, unknown> = SETUP_PREFS) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com", companyName: "Wipro", companyInitials: "W" });
    if (path.endsWith("/referrer-preferences") && init?.method === "PUT") return ok({ preferences: { preferAreas: ["Design"], preferLevels: ["Mid-level"], referralCapacity: 5, notifyNewAsk: true, paused: false } });
    if (path.endsWith("/referrer-preferences")) return ok(preferences);
    if (path.endsWith("/profile/me")) return ok({ profile: { handle: "aya-d" } });
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Goal /referrer-setup", () => {
  it("keeps setup behind work-email sign-in via the referrer OTP href", async () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<ReferrerSetup />);
    const link = await screen.findByRole("link", { name: "Sign in with work email" });
    expect(link.getAttribute("href")).toBe("/sign-in?intent=referrer&returnTo=%2Freferrer-setup");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gates setup behind verification without inventing state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ verifiedCompanyAccess: false, workEmailDomain: null })));
    renderWithQuery(<ReferrerSetup />);
    expect(await screen.findByText("Verify first.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Verify work email/ }).getAttribute("href")).toBe("/verify");
    expect(screen.queryByText("Which roles can you judge?")).toBeNull();
    expect(screen.getByTestId("goal-empty-state")).toBeTruthy();
  });

  it("walks the four steps and saves through the real preferences write", async () => {
    const fetchMock = stubSetup();
    const { container } = renderWithQuery(<ReferrerSetup />);
    expect(await screen.findByText("Verified at Wipro")).toBeTruthy();
    assertGoalPage(container, SETUP_GOAL);
    expect(screen.getByTestId("goal-verified-mark")).toBeTruthy();
    expect(screen.getByText(REFERRER_MONEY_SENTENCE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Design" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Engineering" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("How many referral requests can you review each month?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Monthly referral capacity"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("When should we notify you?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(await screen.findByText("You’re ready to review referral requests.")).toBeTruthy();
    const put = fetchMock.mock.calls.find(call => String(call[0]).endsWith("/referrer-preferences") && call[1]?.method === "PUT");
    expect(String(put?.[1]?.body)).toContain('"referralCapacity":5');
    expect(screen.getByRole("link", { name: "Share my profile" }).getAttribute("href")).toBe("/p/aya-d");
    expect(screen.getByRole("link", { name: /Go to referrer home/ }).getAttribute("href")).toBe("/referrer-home");
  });

  it("requires at least one area before continuing", async () => {
    stubSetup({ preferences: { preferAreas: [], preferLevels: [], referralCapacity: 3, referrerVisibility: "anon", notifyNewAsk: true, paused: false } });
    renderWithQuery(<ReferrerSetup />);
    expect(await screen.findByText("Which roles can you judge?")).toBeTruthy();
    const next = screen.getByRole("button", { name: /Continue/ });
    fireEvent.click(next);
    expect(screen.queryByText("How many referral requests can you review each month?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Design" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("How many referral requests can you review each month?")).toBeTruthy();
  });

  it("keeps the setup loading state visible while its verification request is stalled", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    renderWithQuery(<ReferrerSetup />);
    expect(screen.getByTestId("goal-skeleton-rows")).toBeTruthy();
  });

  it("renders the setup error state and retries the real setup query", async () => {
    const fetchMock = stubSetup();
    const successImplementation = fetchMock.getMockImplementation();
    if (!successImplementation) throw new Error("Expected the setup stub implementation.");
    let shouldFail = true;
    fetchMock.mockImplementation((url, init) => shouldFail ? unavailable() : successImplementation(url, init));
    renderWithQuery(<ReferrerSetup />);
    expect(await screen.findByTestId("goal-error-state")).toBeTruthy();
    const callsBeforeRetry = fetchMock.mock.calls.length;
    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Which roles can you judge?")).toBeTruthy();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it("announces an offline connection after setup has loaded", async () => {
    stubSetup();
    renderWithQuery(<ReferrerSetup />);
    expect(await screen.findByText("Which roles can you judge?")).toBeTruthy();
    setOffline();
    expect(await screen.findByTestId("goal-offline-state")).toBeTruthy();
  });
});
