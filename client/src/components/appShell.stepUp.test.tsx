// @vitest-environment jsdom
// D-057-session-gate (§0b.8c; red first): a server-verified referrer whose
// session is code_required keeps the Referral queue in the shell navigation —
// the queue page itself shows the in-place step-up. Never a standalone sign-in.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { AppShell } from "./AppShell";

const { state } = vi.hoisted(() => ({
  state: {
    path: "/requests",
    signedIn: true,
    referrer: "code_required" as "code_required" | "verified" | "unverified" | "checking",
    credits: { state: "ready", count: 9 } as { state: "ready"; count: number } | { state: "error"; onRetry: () => void } | { state: "loading" } | null,
  },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: state.signedIn, getToken: async () => "tok" }),
  useUser: () => ({ user: state.signedIn ? { fullName: "Ada Lovelace", primaryEmailAddress: { emailAddress: "ada@example.com" } } : null }),
}));
vi.mock("@/hooks/useReferrerAccess", () => ({
  useReferrerAccess: () => ({ status: state.referrer, access: { verified: state.referrer !== "unverified", codeRequired: state.referrer === "code_required" } }),
}));
vi.mock("@/hooks/useCreditBalance", () => ({
  useCreditBalance: (enabled: boolean) => (enabled ? state.credits : null),
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div data-testid="account-menu">account menu</div> }));
vi.mock("wouter", () => ({
  useLocation: () => [state.path],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

function rail() {
  return screen.getAllByRole("navigation", { name: "Primary" })[0];
}

afterEach(() => { cleanup(); state.path = "/requests"; state.signedIn = true; state.referrer = "code_required"; });

describe("AppShell with a code_required verified referrer (D-057)", () => {
  it("keeps the Referral queue in the navigation", () => {
    render(<AppShell><p>page</p></AppShell>);
    expect(within(rail()).getByRole("link", { name: "Queue" }).getAttribute("href")).toBe("/queue");
  });

  it("drops the Give a referral trap: a signed-in referrer is never sent to the standalone code sign-in", () => {
    render(<AppShell><p>page</p></AppShell>);
    expect(screen.queryByTestId("goal-give-referral")).toBeNull();
  });

  it("keeps the seeker navigation unchanged for an unverified account", () => {
    state.referrer = "unverified";
    render(<AppShell><p>page</p></AppShell>);
    expect(within(rail()).queryByRole("link", { name: "Queue" })).toBeNull();
    expect(screen.getAllByTestId("goal-give-referral").length).toBeGreaterThan(0);
  });
});
