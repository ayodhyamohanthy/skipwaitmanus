// @vitest-environment jsdom
// D-048-p3-referrer: flag-off parity and flag-on goal rebuild for /referrer
// (workspace, OTP sign-in dialog, setup & capacity) and /referrer/impact.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Referrer from "./Referrer";
import ReferrerImpact from "./ReferrerImpact";

const { authState, userState, go, search, surfaces, otpControl } = vi.hoisted(() => ({
  otpControl: { useReal: false },
  authState: { isLoaded: true, isSignedIn: true, userId: "12", getToken: vi.fn().mockResolvedValue("test-token") },
  userState: { user: null as null | { primaryEmailAddress?: { emailAddress?: string } } },
  go: vi.fn(),
  search: { value: "" },
  surfaces: { on: new Set<string>() },
}));
vi.mock("@/_core/auth", () => ({ useAuth: () => authState, useUser: () => userState, SignInButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children ?? "Sign in"}</button> }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
vi.mock("@/components/ReferrerOtpSignIn", async () => {
  const actual = await vi.importActual<typeof import("@/components/ReferrerOtpSignIn")>("@/components/ReferrerOtpSignIn");
  return { ReferrerOtpSignIn: () => (otpControl.useReal ? <actual.ReferrerOtpSignIn /> : <div data-testid="referrer-otp-sign-in" />) };
});
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/referrer", go],
  useSearch: () => search.value,
}));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });
const ACCESS = { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "A" };
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
  otpControl.useReal = false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); go.mockClear(); });

describe("Goal /referrer flag gate", () => {
  it("renders the kit workspace untouched when the flag is off", () => {
    surfaces.on = new Set();
    authState.isSignedIn = false;
    stubWorkspace();
    renderWithQuery(<Referrer />);
    expect(document.querySelector(".referrer-workspace")).toBeTruthy();
    expect(screen.queryByText("YOUR NEXT STEP")).toBeNull();
  });
});

describe("Goal /referrer workspace", () => {
  it("opens the work-email OTP dialog first for signed-out visitors", async () => {
    authState.isSignedIn = false;
    stubWorkspace();
    renderWithQuery(<Referrer />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Verify work email.")).toBeTruthy();
    expect(screen.getByTestId("referrer-otp-sign-in")).toBeTruthy();
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
    expect(screen.getByTestId("referrer-otp-sign-in")).toBeTruthy();
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
      if (path.endsWith("/access")) return ok({ verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });
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

  it("surfaces the server rejection of a personal email through the real OTP form", async () => {
    otpControl.useReal = true;
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

  it("shows the goal overview with the next-step commit for signed-in visitors", async () => {
    stubWorkspace();
    renderWithQuery(<Referrer />);
    expect(await screen.findByText("Help when the fit feels right.")).toBeTruthy();
    expect(document.querySelector(".referrer-workspace")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Preview incoming referral requests/ }));
    expect(go).toHaveBeenCalledWith("/queue");
    fireEvent.click(screen.getByRole("tab", { name: "Impact" }));
    expect(go).toHaveBeenCalledWith("/referrer/impact");
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
    fireEvent.click(screen.getByRole("button", { name: "Sign in with work email" }));
    expect(go).toHaveBeenCalledWith("/referrer?setup=work-email");
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
