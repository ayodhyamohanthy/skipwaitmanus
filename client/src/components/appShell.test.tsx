// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell, shellRouteInfo } from "./AppShell";

const state = vi.hoisted(() => ({
  path: "/requests",
  signedIn: true,
  verified: false,
  balance: { isSuccess: true, isError: false, data: 2 as number | undefined },
  signOut: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: state.signedIn, signOut: state.signOut }),
  useUser: () => ({ user: state.signedIn ? { fullName: "Asha Rao", primaryEmailAddress: { emailAddress: "asha@example.com" } } : null }),
}));
vi.mock("@/hooks/useReferrerAccess", () => ({
  useReferrerAccess: () => (state.verified ? { status: "verified", access: { verified: true, domain: "example.com", companyName: "Example", companyInitials: "EX" } } : { status: "unverified", access: { verified: false, domain: "", companyName: null, companyInitials: null } }),
}));
vi.mock("@/lib/goalShellData", () => ({
  useCreditBalance: (enabled: boolean) => (enabled ? { ...state.balance, refetch: vi.fn() } : { isSuccess: false, isError: false, data: undefined, refetch: vi.fn() }),
  useUnreadAlerts: () => ({ data: 3 }),
}));
vi.mock("@/lib/logoutPrivacy", () => ({ clearPrivateReferralBrowserData: state.clear }));
vi.mock("wouter", () => ({
  useLocation: () => [state.path],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeEach(() => {
  state.path = "/requests";
  state.signedIn = true;
  state.verified = false;
  state.balance = { isSuccess: true, isError: false, data: 2 };
  state.signOut.mockClear();
  state.clear.mockClear();
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const rail = () => screen.getAllByRole("navigation", { name: "Primary" })[0];

describe("AppShell (goal UI, D-048 phase 3)", () => {
  it("gives a seeker one navigation, marks the route's place and titles the page", () => {
    render(<AppShell><p>page</p></AppShell>);
    expect(within(rail()).getAllByRole("link").map(link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["SkipWait", "/"],
      ["Find", "/explore"],
      ["My asks", "/requests"],
      ["Inbox", "/inbox"],
      ["Give a referralWork email only", "/sign-in?intent=referrer&returnTo=%2Freferrer-setup"],
    ]);
    expect(within(rail()).getByRole("link", { name: "My asks" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("My asks", { selector: "p" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "2 credits available. Open credit details" }).getAttribute("href")).toBe("/plans");
    expect(screen.getByRole("link", { name: "Alerts, 3 unread" }).getAttribute("href")).toBe("/alerts");
  });

  it("adds the Referral queue for a verified referrer and hides credits on referrer surfaces", () => {
    state.verified = true;
    state.path = "/queue";
    render(<AppShell><p>page</p></AppShell>);
    expect(within(rail()).getAllByRole("link").map(link => link.textContent)).toEqual(["SkipWait", "Find", "My asks", "Queue", "Inbox"]);
    expect(within(rail()).getByRole("link", { name: "Queue" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByTestId("goal-credits")).toBeNull();
    expect(screen.queryByText("Give a referral")).toBeNull();
  });

  it("marks no place on a referrer surface for someone who is not verified", () => {
    state.path = "/referrer-home";
    render(<AppShell><p>page</p></AppShell>);
    expect(within(rail()).queryAllByRole("link").some(link => link.getAttribute("aria-current") === "page")).toBe(false);
  });

  it("offers Sign in with a return path when signed out, and no account or alerts", () => {
    state.signedIn = false;
    state.path = "/explore";
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toMatch(/^\/sign-in\?returnTo=/);
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Alerts/ })).toBeNull();
  });

  it("says when the balance failed to load instead of showing 0", () => {
    state.balance = { isSuccess: false, isError: true, data: undefined };
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.getByRole("button", { name: "Your balance didn’t load. Retry" })).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("clears private browser data before signing out", async () => {
    const user = userEvent.setup();
    render(<AppShell><p>page</p></AppShell>);
    await user.click(screen.getAllByRole("button", { name: "Account menu" })[0]);
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(state.signOut).toHaveBeenCalledOnce());
    expect(state.clear).toHaveBeenCalledOnce();
    expect(state.clear.mock.invocationCallOrder[0]).toBeLessThan(state.signOut.mock.invocationCallOrder[0]);
  });

  it("lets a moved screen set its own place and title", () => {
    state.path = "/somewhere";
    render(<AppShell active="find" title="Find a referral"><p>page</p></AppShell>);
    expect(within(rail()).getByRole("link", { name: "Find" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Find a referral", { selector: "p" })).toBeTruthy();
  });
});

describe("shellRouteInfo", () => {
  it.each([
    ["/explore", "find", "Find a referral"],
    ["/explore/acme", "find", "Find a referral"],
    ["/ask", "find", "Find a referral"],
    ["/requests", "asks", "My asks"],
    ["/queue", "queue", "Referral queue"],
    ["/conversation/12", "inbox", "Inbox"],
    ["/referrer/impact", "queue", "Impact"],
    ["/settings", null, "Settings"],
    ["/unknown", null, "SkipWait"],
  ])("%s → %s, %s", (path, active, title) => {
    expect(shellRouteInfo(path)).toMatchObject({ active, title });
  });
});
