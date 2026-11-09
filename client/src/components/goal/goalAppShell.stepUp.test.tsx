// @vitest-environment jsdom
// D-057-session-gate (§0b.8c; red first): the goal shell keeps a server-verified
// referrer's navigation when their session is code_required — the surfaces show
// the in-place step-up, never a standalone sign-in.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { GoalAppShell } from "./GoalAppShell";

const { state } = vi.hoisted(() => ({
  state: {
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
vi.mock("wouter", () => ({
  useLocation: () => ["/requests"],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

function rail() {
  return screen.getAllByRole("navigation", { name: "Primary" })[0];
}

afterEach(() => { cleanup(); state.signedIn = true; state.referrer = "code_required"; });

describe("GoalAppShell with a code_required verified referrer (D-057)", () => {
  it("keeps the Referral queue in the navigation", () => {
    render(<GoalAppShell active="asks" pageTitle="My asks"><p>page</p></GoalAppShell>);
    expect(within(rail()).getByRole("link", { name: "Queue" }).getAttribute("href")).toBe("/queue");
  });

  it("drops the Give a referral trap for a signed-in referrer", () => {
    render(<GoalAppShell active="asks" pageTitle="My asks"><p>page</p></GoalAppShell>);
    expect(screen.queryAllByTestId("goal-give-referral").length).toBe(0);
  });

  it("keeps the seeker navigation unchanged for an unverified account", () => {
    state.referrer = "unverified";
    render(<GoalAppShell active="asks" pageTitle="My asks"><p>page</p></GoalAppShell>);
    expect(within(rail()).queryByRole("link", { name: "Queue" })).toBeNull();
    expect(screen.getAllByTestId("goal-give-referral").length).toBeGreaterThan(0);
  });
});
