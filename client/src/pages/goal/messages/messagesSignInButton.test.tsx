// @vitest-environment jsdom
// Regression for the signed-out goal /messages sign-in button
// (docs/plans/UI-messages-signin-button.md). The released screen wraps
// <GoalButton> inside <SignInButton>, but SignInButton adopts literal
// <button> children only, so the production DOM nested a button inside a
// button and exposed two accessible "Sign in" actions. The old suite mocked
// SignInButton as a div and could not see that. These tests render the real
// AuthProvider and the real SignInButton; only the WorkOS SDK below it and
// the network are mocked lower down. RED on the current nested DOM, green
// once the screen renders one button that calls useAuth().openSignIn exactly
// once with no arguments. Vitest + RTL/jsdom, @ aliases to client/src, no new
// dependencies.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import { DM_REFERRER_ACCEPTANCE_ERROR } from "@shared/directMessages";

const { openSignIn, spyMode, calls } = vi.hoisted(() => ({
  openSignIn: vi.fn(),
  spyMode: { on: false },
  calls: [] as string[],
}));

// Lower provider mock: a signed-out WorkOS AuthKit SDK behind the real AuthProvider.
vi.mock("@workos-inc/authkit-react", () => ({
  AuthKitProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    isLoading: false,
    user: null,
    signIn: async () => {},
    getAccessToken: async () => null,
    signOut: async () => {},
  }),
}));
// Lower network/server mock: no server session, so the real provider reports signed out.
vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: null, isLoading: false }) } },
    useUtils: () => ({ auth: { me: { invalidate: async () => {}, cancel: async () => {}, setData: () => {} } } }),
  },
}));
vi.mock("@/lib/clarity", () => ({ identifyClarity: () => {} }));
vi.mock("@/contexts/smokeRuntime", () => ({ smokeState: () => ({ active: false, identity: undefined }) }));
vi.mock("@/_core/accessToken", () => ({ setGlobalAccessToken: () => {} }));
vi.mock("wouter", () => ({
  useLocation: () => ["/messages", vi.fn()],
  Link: ({ children, href, ...rest }: { children: React.ReactNode; href: string } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

// The real module stays in use: actual AuthProvider and actual SignInButton,
// never a div stand-in or a copied adoption logic. Only the page-facing
// useAuth hook can swap in the action spy (the action-spy case); the
// structural case runs the real hook on the real provider.
vi.mock("@/_core/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/_core/auth")>();
  return {
    ...actual,
    useAuth: () => {
      const compat = actual.useAuth();
      return spyMode.on ? { ...compat, isSignedIn: false, openSignIn } : compat;
    },
  };
});

import { AuthProvider } from "@/_core/auth";
import GoalMessages, { GOAL_PAGE } from "./GoalMessages";

beforeAll(async () => {
  // Force the WorkOS provider path (not the server-session-only fallback).
  import.meta.env.VITE_WORKOS_CLIENT_ID = "pk_test_messages_sign_in_button";
  // Warm the lazily loaded goal chunk so a cold transform on a busy runner
  // never outlasts findBy's timeout.
  await import("./GoalMessages").catch(() => undefined);
}, 60_000);

beforeEach(() => {
  spyMode.on = false;
  openSignIn.mockClear();
  calls.length = 0;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ threads: [] }) } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.sessionStorage.clear(); });

function renderSignedOutGoalMessages() {
  return render(
    <AuthProvider>
      <GoalMessages />
    </AuthProvider>,
  );
}

describe("goal /messages signed-out sign-in button (real provider DOM)", () => {
  it("renders no button inside a button, exactly one accessible Sign in, unchanged goal and rule, and no DM GET", async () => {
    const { container } = renderSignedOutGoalMessages();
    expect(await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine })).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(screen.getByText(DM_REFERRER_ACCEPTANCE_ERROR)).toBeTruthy();

    // The production bug: SignInButton adopts only literal <button> children,
    // so the GoalButton component rendered as a nested button in the wrapper.
    expect(container.querySelectorAll("button button")).toHaveLength(0);
    expect(container.querySelectorAll("button [data-testid='goal-button']")).toHaveLength(0);
    const goalButtons = container.querySelectorAll("[data-testid='goal-button']");
    expect(goalButtons).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Sign in" })).toHaveLength(1);

    // Signed out: nothing is fetched, in particular no DM list GET.
    expect(calls.filter(url => url.startsWith("/api/dms"))).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("clicking the corrected Sign in action calls the unchanged useAuth().openSignIn exactly once with no arguments", async () => {
    spyMode.on = true;
    renderSignedOutGoalMessages();
    expect(await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine })).toBeTruthy();
    const signInActions = screen.getAllByRole("button", { name: "Sign in" });
    expect(signInActions).toHaveLength(1);
    fireEvent.click(signInActions[0] as HTMLElement);
    expect(openSignIn).toHaveBeenCalledTimes(1);
    expect(openSignIn.mock.calls).toEqual([[]]);
  });
});

