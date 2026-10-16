// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReferrerImpact from "./ReferrerImpact";

const authState = vi.hoisted(() => ({ isSignedIn: false }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, getToken: vi.fn().mockResolvedValue("test-token") }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));

const renderImpact = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReferrerImpact /></QueryClientProvider>);

function stubFetch(handler: (url: string) => { ok: boolean; status?: number; json: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => handler(String(input))));
}

beforeEach(() => { authState.isSignedIn = false; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReferrerImpact dashboard", () => {
  it("asks unauthenticated visitors to sign in with their work email before showing any impact", () => {
    renderImpact();
    expect(screen.getByText("Sign in with your work email to see your referral impact")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in with work email" })).toBeTruthy();
    expect(document.querySelector('[data-skipwait-screen="referrer-impact-sign-in"]')).toBeTruthy();
    // One interactive control: the kit Button is not nested inside another button.
    expect(document.querySelector("button button")).toBeNull();
  });

  it("routes signed-in members without a verified work email to the work-email setup", async () => {
    authState.isSignedIn = true;
    stubFetch(url => url.endsWith("/api/company-referrals/access") ? { ok: true, json: async () => ({ verifiedCompanyAccess: false, workEmailDomain: null }) } : { ok: true, json: async () => ({}) });
    renderImpact();
    expect(await screen.findByText("Verify your work email")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add work email" }).getAttribute("href")).toBe("/referrer?setup=work-email");
    expect(screen.queryByText(/Accepted referrals/)).toBeNull();
  });

  it("greets verified referrers with a friendly empty state before their first acceptance", async () => {
    authState.isSignedIn = true;
    stubFetch(url => {
      if (url.endsWith("/api/company-referrals/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
      if (url.endsWith("/api/referrer/impact-summary")) return { ok: true, json: async () => ({ acceptedReferrals: 0, pendingRequests: 0, declinedRequests: 0, unreadMessages: 0, creditsRemaining: 3, recentAccepted: [] }) };
      return { ok: true, json: async () => ({}) };
    });
    renderImpact();
    // Kit v4 impact-zero: honest zeros from the real summary, never invented numbers.
    expect(await screen.findByText("No invented scoreboards.")).toBeTruthy();
    expect(screen.getByText("YOUR IMPACT STARTS AT ZERO")).toBeTruthy();
    const stats = screen.getByLabelText("Your private impact");
    expect(Array.from(stats.querySelectorAll("strong")).map(node => node.textContent)).toEqual(["0", "0", "0"]);
    expect(stats.textContent).toContain("referrals accepted");
    expect(screen.queryByText("Recent referrals")).toBeNull();
    expect(screen.getByRole("link", { name: "See how a request looks" }).getAttribute("href")).toBe("/queue");
  });

  it("renders the real stat numbers and recent accepted referrals once data exists", async () => {
    authState.isSignedIn = true;
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    stubFetch(url => {
      if (url.endsWith("/api/company-referrals/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
      if (url.endsWith("/api/referrer/impact-summary")) return { ok: true, json: async () => ({ acceptedReferrals: 4, pendingRequests: 2, declinedRequests: 1, unreadMessages: 1, creditsRemaining: 3, recentAccepted: [{ id: 9, companyDomain: "acme.com", acceptedAt: twoDaysAgo }] }) };
      return { ok: true, json: async () => ({}) };
    });
    renderImpact();
    expect(await screen.findByText("Recent referrals")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("acme.com")).toBeTruthy();
    expect(screen.getByText("Accepted 2 days ago")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open my inbox" }).getAttribute("href")).toBe("/inbox");
    expect(screen.getByRole("link", { name: "Share skipwait.me" }).getAttribute("href")).toBe("/share");
  });

  it("shows a verified referrer's impact when the server verified a work email the SSO sign-in does not carry (D-019)", async () => {
    authState.isSignedIn = true;
    stubFetch(url => {
      if (url.endsWith("/api/company-referrals/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "skipwait.me", companyName: "SkipWait", companyInitials: "SW" }) };
      if (url.endsWith("/api/referrer/impact-summary")) return { ok: true, json: async () => ({ acceptedReferrals: 0, pendingRequests: 1, declinedRequests: 0, unreadMessages: 0, creditsRemaining: 3, recentAccepted: [] }) };
      return { ok: true, json: async () => ({}) };
    });
    renderImpact();
    expect(await screen.findByText("No invented scoreboards.")).toBeTruthy();
    expect(screen.queryByText("Verify your work email")).toBeNull();
  });

  it("shows a retryable error, never the work-email setup, when the verification check fails", async () => {
    authState.isSignedIn = true;
    let accessFails = true;
    stubFetch(url => {
      if (url.endsWith("/api/company-referrals/access")) return accessFails ? { ok: false, status: 500, json: async () => ({ error: "We could not check your company-email access" }) } : { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
      if (url.endsWith("/api/referrer/impact-summary")) return { ok: true, json: async () => ({ acceptedReferrals: 0, pendingRequests: 0, declinedRequests: 0, unreadMessages: 0, creditsRemaining: 3, recentAccepted: [] }) };
      return { ok: true, json: async () => ({}) };
    });
    renderImpact();
    expect(await screen.findByText("We could not check your verification.", undefined, { timeout: 4000 })).toBeTruthy();
    expect(document.querySelector('[data-skipwait-screen="referrer-impact-access-error"] [role="alert"]')?.textContent).toContain("We could not check your company-email access");
    expect(screen.queryByText("Verify your work email")).toBeNull();
    accessFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No invented scoreboards.")).toBeTruthy();
  });

  it("offers a Try again card when the impact summary fails to load", async () => {
    authState.isSignedIn = true;
    stubFetch(url => {
      if (url.endsWith("/api/company-referrals/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
      return { ok: false, status: 500, json: async () => ({ error: "We could not load your referral impact" }) };
    });
    const { container } = renderImpact();
    await waitFor(() => expect(document.querySelector('[data-skipwait-screen="referrer-impact-error"]')).toBeTruthy());
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
