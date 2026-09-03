// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import ReferrerImpact from "./ReferrerImpact";

const authState = vi.hoisted(() => ({ isSignedIn: false }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, getToken: vi.fn().mockResolvedValue("test-token") }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));

function stubFetch(handler: (url: string) => { ok: boolean; json: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => handler(String(input))));
}

beforeEach(() => { authState.isSignedIn = false; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReferrerImpact dashboard", () => {
  it("asks unauthenticated visitors to sign in with their work email before showing any impact", () => {
    render(<ReferrerImpact />);
    expect(screen.getByText("Sign in with your work email to see your referral impact")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Secure sign in" })).toBeTruthy();
    expect(document.querySelector('[data-skipwait-screen="referrer-impact-sign-in"]')).toBeTruthy();
  });

  it("routes signed-in members without a verified work email to the work-email setup", async () => {
    authState.isSignedIn = true;
    stubFetch(url => url.endsWith("/api/company-referrals/access") ? { ok: true, json: async () => ({ verifiedCompanyAccess: false, workEmailDomain: null }) } : { ok: true, json: async () => ({}) });
    render(<ReferrerImpact />);
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
    render(<ReferrerImpact />);
    expect(await screen.findByText("Your impact will show here once you accept your first referral")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open my inbox" }).getAttribute("href")).toBe("/inbox");
  });

  it("renders the real stat numbers and recent accepted referrals once data exists", async () => {
    authState.isSignedIn = true;
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    stubFetch(url => {
      if (url.endsWith("/api/company-referrals/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
      if (url.endsWith("/api/referrer/impact-summary")) return { ok: true, json: async () => ({ acceptedReferrals: 4, pendingRequests: 2, declinedRequests: 1, unreadMessages: 1, creditsRemaining: 3, recentAccepted: [{ id: 9, companyDomain: "acme.com", acceptedAt: twoDaysAgo }] }) };
      return { ok: true, json: async () => ({}) };
    });
    render(<ReferrerImpact />);
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

  it("offers a Try again card when the impact summary fails to load", async () => {
    authState.isSignedIn = true;
    stubFetch(url => {
      if (url.endsWith("/api/company-referrals/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
      return { ok: false, status: 500, json: async () => ({ error: "We could not load your referral impact" }) };
    });
    const { container } = render(<ReferrerImpact />);
    await waitFor(() => expect(document.querySelector('[data-skipwait-screen="referrer-impact-error"]')).toBeTruthy());
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
