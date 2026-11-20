// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { GoalAppShell } from "./goal/GoalAppShell";
import GoalLandingV9 from "@/pages/GoalLandingV9";

const { state } = vi.hoisted(() => ({
  state: { path: "/requests", signedIn: false },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: state.signedIn, getToken: async () => "test-token" }),
  useUser: () => ({ user: state.signedIn ? { fullName: "Test User", primaryEmailAddress: { emailAddress: "test@example.com" } } : null }),
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("@/hooks/useCreditBalance", () => ({ useCreditBalance: () => null }));
vi.mock("@/components/goal/useGoalShellMeta", () => ({ useGoalShellMeta: () => ({ active: "asks", pageTitle: "My asks" }) }));
vi.mock("@/components/goal/GoalLanguageConsent", () => ({
  GoalLanguageConsent: () => <div data-testid="language-consent" />,
}));
vi.mock("@/components/goal/GoalLanguagePicker", () => ({
  GoalLanguagePicker: ({ variant }: { variant: string }) => <div data-testid="language-picker" data-variant={variant} />,
}));
vi.mock("@/components/goal/GoalShell", () => ({
  GoalShell: ({ account, children }: { account: { menu?: React.ReactNode }; children: React.ReactNode }) => (
    <div data-testid="goal-shell">
      <div data-testid="account-slot">{account.menu}</div>
      <main>{children}</main>
    </div>
  ),
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account menu</div> }));
vi.mock("@/components/goal/GoalButton", () => ({
  GoalButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
vi.mock("wouter", () => ({
  useLocation: () => [state.path, (path: string) => { state.path = path; }],
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

afterEach(() => {
  cleanup();
  state.path = "/requests";
  state.signedIn = false;
});

describe("D-093 shell language mounts", () => {
  it("places the signed-out bar picker beside the existing Sign in link", () => {
    render(<AppShell><p>App content</p></AppShell>);

    const account = screen.getByTestId("account-slot");
    expect(account.querySelector('[data-testid="language-picker"]')?.getAttribute("data-variant")).toBe("bar");
    expect(account.querySelector('a[href="/sign-in"]')?.textContent).toBe("Sign in");
  });

  it("places consent before every AppShell-wrapped page and does not offer the picker when signed in", () => {
    state.signedIn = true;
    render(<AppShell><p data-testid="app-content">App content</p></AppShell>);

    const main = screen.getByTestId("goal-shell").querySelector("main");
    expect(main?.firstElementChild?.getAttribute("data-testid")).toBe("language-consent");
    expect(screen.getByTestId("app-content").parentElement).toBe(main);
    expect(screen.queryByTestId("language-picker")).toBeNull();
  });

  it("places consent before GoalAppShell page content", () => {
    state.signedIn = true;
    render(<GoalAppShell active="asks" pageTitle="My asks"><p data-testid="goal-content">Goal content</p></GoalAppShell>);

    const main = screen.getByTestId("goal-shell").querySelector("main");
    expect(main?.firstElementChild?.getAttribute("data-testid")).toBe("language-consent");
    expect(screen.getByTestId("goal-content").parentElement).toBe(main);
  });

  it("places consent above the signed-out goal landing header without changing Sign in destinations", () => {
    window.localStorage.removeItem("skipwait:cookie-consent");
    render(<GoalLandingV9 />);

    expect(screen.getByTestId("language-consent").nextElementSibling?.tagName).toBe("HEADER");
    expect(screen.getAllByRole("link", { name: "Sign in" }).some(link => link.getAttribute("href") === "/sign-in")).toBe(true);
  });
});
