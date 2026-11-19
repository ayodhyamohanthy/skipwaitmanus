// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Assistants from "../../Assistants";
import Approve from "../../Approve";
import ConnectAssistant from "../../ConnectAssistant";
import SeekerAgents from "../../SeekerAgents";

const { openSignIn } = vi.hoisted(() => ({ openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: false, isLoaded: true, getToken: vi.fn(), openSignIn }),
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <button type="button" onClick={() => openSignIn()}>{children ?? "Sign in"}</button>,
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/assistants", vi.fn()],
  useSearch: () => "",
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/goal", async importOriginal => {
  const components = (await importOriginal()) as object;
  return { ...components, GoalAppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

beforeEach(() => {
  vi.stubEnv("VITE_GOAL_SURFACES", "");
  vi.stubGlobal("fetch", vi.fn());
  openSignIn.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("retired assistants routes", () => {
  it.each([
    { route: "/assistants", Page: Assistants, goal: "Let your assistant prepare your next referral", signedOut: "Sign in to manage assistants", action: "Sign in" },
    { route: "/approve", Page: Approve, goal: "Decide what your assistant can do", signedOut: "Sign in to review approvals", action: "Sign in" },
    { route: "/connect-assistant", Page: ConnectAssistant, goal: "Choose what your assistant may do", signedOut: "Sign in to connect ChatGPT", action: "Sign in to skipwait.me" },
    { route: "/agents", Page: SeekerAgents, goal: "Let your agent prepare a better referral", signedOut: "Sign in to let your agent prepare referrals. It cannot send or buy referrals.", action: "Sign in" },
  ])("$route keeps its released goal and sign-in gate without a surface override", async ({ Page, goal, signedOut, action }) => {
    render(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: goal })).toBeTruthy();
    expect(screen.getByText(signedOut, { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(openSignIn.mock.calls).toEqual([[]]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
