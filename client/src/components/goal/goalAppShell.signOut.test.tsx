// @vitest-environment jsdom
// P0-goal-shell-sign-out (D-019, D-412 (6)), red first: on every GoalAppShell page (/explore, /requests, /ask,
// /inbox, the conversation views) the account avatar must open the account menu and Sign out must end the session.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoalAppShell } from "./GoalAppShell";

const { state, signOut, clearPrivate } = vi.hoisted(() => ({
  state: { signedIn: true },
  signOut: vi.fn(),
  clearPrivate: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: state.signedIn, userId: state.signedIn ? "12" : null, getToken: async () => "tok", signOut }),
  useUser: () => ({ user: state.signedIn ? { fullName: "Ada Lovelace", imageUrl: null, primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [{ emailAddress: "ada@example.com", verification: { status: "verified" } }] } : null }),
}));
vi.mock("@/hooks/useReferrerAccess", () => ({
  useReferrerAccess: () => ({ status: "unverified", access: { verified: false, codeRequired: false } }),
}));
vi.mock("@/hooks/useCreditBalance", () => ({ useCreditBalance: () => null }));
vi.mock("@/lib/logoutPrivacy", () => ({ clearPrivateReferralBrowserData: clearPrivate }));
vi.mock("wouter", () => ({
  useLocation: () => ["/explore", () => undefined],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ notifications: [], verifiedCompanyAccess: false }) }));

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><GoalAppShell active="find" pageTitle="Find"><p>page</p></GoalAppShell></QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  signOut.mockReset(); signOut.mockResolvedValue(undefined);
  clearPrivate.mockReset(); clearPrivate.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); state.signedIn = true; });

describe("GoalAppShell account avatar (P0-goal-shell-sign-out)", () => {
  it("opens the account menu with Sign out from the avatar", async () => {
    renderShell();
    const avatars = screen.getAllByRole("button", { name: "Account menu" });
    expect(avatars.length).toBeGreaterThan(0);
    fireEvent.pointerDown(avatars[0], { button: 0, ctrlKey: false });
    expect(await screen.findByRole("menuitem", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeTruthy();
  });

  it("Sign out clears private browser data, then ends the session once", async () => {
    renderShell();
    fireEvent.pointerDown(screen.getAllByRole("button", { name: "Account menu" })[0], { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(clearPrivate).toHaveBeenCalledTimes(1);
    expect(clearPrivate.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });

  it("shows no account button when signed out", () => {
    state.signedIn = false;
    renderShell();
    expect(screen.queryAllByRole("button", { name: "Account menu" })).toHaveLength(0);
  });
});
