// @vitest-environment jsdom
// D-048-p3-referrer: flag-off parity and flag-on goal rebuild for /referrer
// (workspace, goal-email OTP dialog, setup & capacity) and /referrer/impact.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Referrer from "./Referrer";
import ReferrerImpact from "./ReferrerImpact";
import { referrerSignInHref } from "@/lib/referrerSignIn";

const { authState, userState, go, search, surfaces } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true, userId: "12", getToken: vi.fn().mockResolvedValue("test-token") },
  userState: { user: null as null | { primaryEmailAddress?: { emailAddress?: string } } },
  go: vi.fn(),
  search: { value: "" },
  surfaces: { on: new Set<string>() },
}));
vi.mock("@/_core/auth", () => ({ useAuth: () => authState, useUser: () => userState, SignInButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children ?? "Sign in"}</button> }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
// The flag-off kit page still imports the kit form; the goal dialog renders its own.
vi.mock("@/components/ReferrerOtpSignIn", () => ({ ReferrerOtpSignIn: () => <div data-testid="referrer-otp-sign-in" /> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/referrer", go],
  useSearch: () => search.value,
}));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });
const ACCESS = { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "A" };
const UNVERIFIED = { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null };
const PREFS = { preferences: { referralCapacity: 3, preferAreas: ["Design"], referrerVisibility: "anon", notifyNewAsk: true, paused: false } };
const renderWithQuery = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
function stubWorkspace(impactSummary?: unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/access")) return ok(ACCESS);
    if (path.endsWith("/referrer-preferences") && init?.method === "PUT") return ok({ preferences: { referralCapacity: 4, preferAreas: ["Design"], paused: false } });
    if (path.endsWith("/referrer-preferences")) return ok(PREFS);
    if (path.endsWith("/api/referrer/impact-summary")) return ok(impactSummary ?? { acceptedReferrals: 2, introductions: 2, activeConversations: 1, outcomesShared: 1, pendingRequests: 1, declinedRequests: 0, unreadMessages: 3, recentAccepted: [{ id: 9, companyDomain: "acme.com", acceptedAt: new Date(Date.now() - 86400000).toISOString() }] });
    if (path.includes("/api/company-referrals/inbox")) return fail(403, { error: "Verify your work email to view private company requests." });
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  authState.isLoaded = true; authState.isSignedIn = true; userState.user = null;
  search.value = ""; surfaces.on = new Set(["referrer"]);
  window.sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); go.mockClear(); });

describe("Goal flag gate", () => {
  it("renders the kit workspace untouched when the flag is off", () => {
    surfaces.on = new Set();
    authState.isSignedIn = false;
    stubWorkspace();
    renderWithQuery(<Referrer />);
    expect(document.querySelector(".referrer-workspace")).toBeTruthy();
    expect(screen.queryByText("YOUR NEXT STEP")).toBeNull();
  });

  it("renders the kit impact page untouched when the flag is off", () => {
    surfaces.on = new Set();
    authState.isSignedIn = false;
    stubWorkspace();
    renderWithQuery(<ReferrerImpact />);
    expect(document.querySelector(".impact-zero")).toBeTruthy();
    expect(screen.queryAllByTestId("goal-button")).toHaveLength(0);
  });
});

describe("Goal /referrer workspace", () => {
  it("opens the goal work-email OTP dialog first for signed-out visitors", async () => {
    authState.isSignedIn = false;
    stubWorkspace();
    renderWithQuery(<Referrer />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Verify work email.")).toBeTruthy();
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.getAllByTestId("goal-field").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Close setup" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Help when the fit feels right.")).toBeTruthy();
  });

  it("keeps Tab inside the OTP dialog so background actions stay unreachable", async () => {
    authState.isSignedIn = false;
    stubWorkspace();
    renderWithQuery(<Referrer />);
    const dialog = await screen.findByRole("dialog");
    const setupCta = screen.getByRole("button", { name: /Set up as a referrer/ });
    for (let i = 0; i < 4; i += 1) fireEvent.keyDown(window, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(setupCta);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the work-email step directly for ?setup=work-email links", async () => {
    search.value = "setup=work-email";
    authState.isSignedIn = false;
    stubWorkspace();
    const { unmount } = renderWithQuery(<Referrer />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    unmount();
    authState.isSignedIn = true;
    stubWorkspace();
    renderWithQuery(<Referrer />);
    expect(await screen.findByText("REFERRER SETUP · 2 OF 3")).toBeTruthy();
    expect(screen.getByText("Verify work email.")).toBeTruthy();
  });

  it("sends a signed-in account without a verified domain to /verify from the setup dialog", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/access")) return ok(UNVERIFIED);
      if (path.endsWith("/referrer-preferences")) return ok(PREFS);
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Referrer />);
    fireEvent.click(await screen.findByRole("button", { name: /Set up as a referrer/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }));
    const link = await screen.findByRole("link", { name: /Verify with a one-time code/ });
    expect(link.getAttribute("href")).toBe("/verify");
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/verify-work-email"))).toBe(false);
  });

  it("surfaces the server rejection of a personal email through the goal OTP form", async () => {
    authState.isSignedIn = false;
    stubWorkspace();
    renderWithQuery(<Referrer />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    const fetchMock = vi.fn(async (_url: string) => ({ ok: false, status: 400, json: async () => ({ error: "Personal email providers cannot access private referral requests. Use your company address." }) }));
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.change(screen.getByLabelText("Company email"), { target: { value: "person@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    await screen.findByRole("alert");
    expect(screen.getByText(/personal email providers cannot access private referral requests/i)).toBeTruthy();
    expect(fetchMock.mock.calls.every(call => String(call[0]).includes("/api/auth/otp/send"))).toBe(true);
  });

  it("shows verification as done and saves the chosen lane through the real preferences contract", async () => {
    const fetchMock = stubWorkspace();
    renderWithQuery(<Referrer />);
    fireEvent.click(await screen.findByRole("button", { name: /Set up as a referrer/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }));
    expect(await screen.findByText(/Verified ·/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("Choose your lane.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/referrer-preferences") && call[1]?.method === "PUT" && String(call[1]?.body).includes('"preferAreas"'))).toBeTruthy();
  });

  it("shows the goal overview with one black commit and a quiet impact link for signed-in visitors", async () => {
    stubWorkspace();
    renderWithQuery(<Referrer />);
    expect(await screen.findByText("Help when the fit feels right.")).toBeTruthy();
    expect(screen.getByText("Your next step")).toBeTruthy();
    expect(document.querySelectorAll("[data-g-primary]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Set up as a referrer/ }).hasAttribute("data-g-primary")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Preview incoming referral requests/ }));
    expect(go).toHaveBeenCalledWith("/queue");
    expect(screen.getByRole("link", { name: /private impact/i }).getAttribute("href")).toBe("/referrer/impact");
    expect(screen.queryByRole("tab", { name: /impact/i })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("keeps a company-domain session behind the server verdict and never reads the inbox", async () => {
    userState.user = { primaryEmailAddress: { emailAddress: "rahul@acme.com" } };
    const fetchMock = vi.fn(async (url: string) => (String(url).endsWith("/access") ? ok(UNVERIFIED) : ok({})));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Referrer />);
    const link = await screen.findByRole("link", { name: /Verify your work email/ });
    expect(link.getAttribute("href")).toBe("/verify");
    expect(screen.queryByText("Help when the fit feels right.")).toBeNull();
    expect(fetchMock.mock.calls.every(call => !String(call[0]).includes("/api/company-referrals/inbox"))).toBe(true);
  });

  it("admits a personal-email session on the server verdict alone", async () => {
    userState.user = { primaryEmailAddress: { emailAddress: "rahul@gmail.com" } };
    const fetchMock = stubWorkspace();
    renderWithQuery(<Referrer />);
    expect(await screen.findByText("Help when the fit feels right.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/api/company-referrals/inbox"))).toBe(true);
  });

  it("tells an invited referrer what the inviter earns in referral words only", async () => {
    window.sessionStorage.setItem("skipwait:employee-sign-in-email", "new@acme.com");
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/access")) return ok(ACCESS);
      if (path.endsWith("/verify-work-email") && init?.method === "POST") return ok({ verified: true, workEmailDomain: "acme.com", reward: { rewarded: true } });
      if (path.includes("/api/company-referrals/inbox")) return fail(403, { error: "Verify your work email to view private company requests." });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Referrer />);
    expect(await screen.findByText(/one referral after their next referral request reaches a referrer/)).toBeTruthy();
    expect(screen.queryByText(/credit/i)).toBeNull();
    expect(screen.queryByText(/\bask\b/i)).toBeNull();
  });

  it("shows a checking skeleton, never the verify gate, while the server verdict is in flight", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => (String(url).endsWith("/access") ? new Promise(() => {}) : Promise.resolve(ok({})))));
    renderWithQuery(<Referrer />);
    expect(await screen.findByTestId("goal-skeleton-rows")).toBeTruthy();
    expect(screen.queryByText("Help when the fit feels right.")).toBeNull();
    expect(screen.queryByRole("link", { name: /Verify your work email/ })).toBeNull();
  });

  it("offers a retry, never the verify gate, when the verdict check fails offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    renderWithQuery(<Referrer />);
    expect(await screen.findByText("We could not check your verification.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Verify your work email/ })).toBeNull();
  });

  it("saves capacity settings through the real preferences write on the setup view", async () => {
    search.value = "view=setup";
    const fetchMock = stubWorkspace();
    renderWithQuery(<Referrer />);
    expect(await screen.findByText("Protect your time.")).toBeTruthy();
    expect(await screen.findByDisplayValue("Acme")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/referrer-preferences") && call[1]?.method === "PUT")).toBeTruthy());
    expect(await screen.findByText(/SETTINGS SAVED/)).toBeTruthy();
  });
});

describe("Goal /referrer/impact", () => {
  it("keeps impact behind the work-email door when signed out", async () => {
    authState.isSignedIn = false;
    stubWorkspace();
    renderWithQuery(<ReferrerImpact />);
    expect(await screen.findByText("Sign in with your work email to see your referral impact.")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Sign in with work email" });
    expect(link.getAttribute("href")).toBe(referrerSignInHref("/referrer/impact"));
    expect(document.querySelectorAll("[data-g-primary]")).toHaveLength(1);
  });

  it("sends a signed-in unverified referrer to the work-email door with the Impact return path", async () => {
    const fetchMock = vi.fn(async (url: string) => (String(url).endsWith("/access") ? ok(UNVERIFIED) : ok({})));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<ReferrerImpact />);
    const link = await screen.findByRole("link", { name: /Add work email/ });
    expect(link.getAttribute("href")).toBe(referrerSignInHref("/referrer/impact"));
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/api/referrer/impact-summary"))).toBe(false);
  });

  it("shows the private stats and never-paid line for a verified referrer", async () => {
    stubWorkspace();
    renderWithQuery(<ReferrerImpact />);
    expect(await screen.findByText("Your private impact at a glance.")).toBeTruthy();
    expect(screen.getByText("ONLY YOU CAN SEE THIS")).toBeTruthy();
    expect(screen.getByText(/never pays referrers/)).toBeTruthy();
    expect(screen.getByText("referrals accepted")).toBeTruthy();
    expect(screen.getByText("acme.com")).toBeTruthy();
    expect(screen.getByText(/Accepted yesterday/)).toBeTruthy();
    expect(screen.queryByText(/credit/i)).toBeNull();
    expect(document.querySelectorAll("[data-g-primary]")).toHaveLength(1);
  });

  it("shows the zero state without an invented scoreboard", async () => {
    stubWorkspace({ acceptedReferrals: 0, introductions: 0, activeConversations: 0, outcomesShared: 0, pendingRequests: 0, declinedRequests: 0, unreadMessages: 0, recentAccepted: [] });
    renderWithQuery(<ReferrerImpact />);
    expect(await screen.findByText("No invented scoreboards.")).toBeTruthy();
    expect(screen.getByText(/never rank generosity/)).toBeTruthy();
  });

  it("renders a retryable error when the access check fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(503, { error: "We could not check your work-email verification." })));
    renderWithQuery(<ReferrerImpact />);
    expect(await screen.findByText("We could not check your verification.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("Verify your work email.")).toBeNull();
  });
});

// DESIGN.md names one type scale: the page title is the display token
// (`text-g-display` - 700 28/36, -0.02em), never an ad-hoc size. #575 landed
// both referrer titles as raw 32px semibold, so each state of this surface is
// pinned here as well as in the captures.
describe("Goal page title uses the design type scale", () => {
  const AD_HOC_TYPE = /(?:^|\s)(?:text-\[[\d.]+px\]|font-(?:bold|semibold|medium|normal)|tracking-\[-?[\d.]+em\]|leading-\[[\d.]+\])/;

  const titles = () => Array.from(document.querySelectorAll("h1"));

  it("renders the /referrer title with text-g-display and no ad-hoc type classes", async () => {
    stubWorkspace();
    renderWithQuery(<Referrer />);
    expect(await screen.findByText("Help when the fit feels right.")).toBeTruthy();
    expect(titles()).toHaveLength(1);
    expect(titles()[0].className.split(" ")).toContain("text-g-display");
    expect(titles()[0].className).not.toMatch(AD_HOC_TYPE);
  });

  it("renders the /referrer/impact title with text-g-display and no ad-hoc type classes", async () => {
    stubWorkspace();
    renderWithQuery(<ReferrerImpact />);
    expect(await screen.findByText("Your private impact at a glance.")).toBeTruthy();
    expect(titles()).toHaveLength(1);
    expect(titles()[0].className.split(" ")).toContain("text-g-display");
    expect(titles()[0].className).not.toMatch(AD_HOC_TYPE);
  });
});
