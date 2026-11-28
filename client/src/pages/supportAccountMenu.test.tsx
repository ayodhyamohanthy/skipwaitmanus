// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { renderToStaticMarkup } from "react-dom/server";
import Support, { SupportRoute } from "./Support";
import Terms from "./Terms";

const { auth, signOut, clearPrivate } = vi.hoisted(() => ({
  auth: { loaded: true, signedIn: true },
  signOut: vi.fn(),
  clearPrivate: vi.fn(),
}));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: auth.loaded, isSignedIn: auth.signedIn, userId: "12", getToken: async () => null, signOut }),
  useUser: () => ({ user: { fullName: "QA Seeker", imageUrl: null, primaryEmailAddress: { emailAddress: "qa@example.com" }, emailAddresses: [] } }),
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("@/hooks/useCreditBalance", () => ({ useCreditBalance: () => null }));
vi.mock("@/lib/logoutPrivacy", () => ({ clearPrivateReferralBrowserData: clearPrivate }));
vi.mock("@/components/NotificationBell", () => ({ NotificationBell: () => null }));

function renderSupport() {
  window.history.replaceState({}, "", "/support");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Router ssrPath="/support"><SupportRoute /></Router></QueryClientProvider>);
}

function supportLinks() {
  return within(screen.getByRole("region", { name: "Solve it yourself" })).getAllByRole("link").map(link => link.getAttribute("href"));
}

beforeEach(() => {
  auth.loaded = true;
  auth.signedIn = true;
  signOut.mockReset().mockResolvedValue(undefined);
  clearPrivate.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected support request"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Support account recovery (#1709)", () => {
  it("opens the real menu, returns focus on Escape, and signs out after private-data cleanup", async () => {
    const page = renderSupport();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(page.container.querySelectorAll('[data-testid="goal-shell"]')).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "Legal" })).toBeNull();
    expect(supportLinks()).toEqual(["/premium", "/requests", "/settings", "/settings"]);
    const trigger = screen.getAllByRole("button", { name: "Account menu" })[0];
    if (!trigger) throw new Error("Signed-in support must expose the account menu");
    trigger.focus();
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    const signOutItem = await screen.findByRole("menuitem", { name: "Sign out" });
    fireEvent.keyDown(signOutItem, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Sign out" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(signOut).not.toHaveBeenCalled();
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(clearPrivate).toHaveBeenCalledTimes(1);
    expect(clearPrivate.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });

  it.each([
    { loaded: true, signedIn: false },
    { loaded: false, signedIn: false },
    { loaded: false, signedIn: true },
  ])("keeps public support without account controls for $loaded/$signedIn auth", state => {
    Object.assign(auth, state);
    renderSupport();
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Contact support." })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Legal" })).toBeTruthy();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(supportLinks()).toEqual(["/premium", "/requests", "/settings", "/settings"]);
    expect(screen.getByRole("link", { name: "Email support@skipwait.me" }).getAttribute("href")).toBe("mailto:support@skipwait.me?subject=skipwait.me%20support%20request&body=Account%20email%3A%0AWhat%20happened%3A%0AReference%20(Ref-%2C%20payment%20id%2C%20or%20link)%2C%20if%20any%3A%0A");
  });

  it("keeps actual policy pages outside the account frame even for a signed-in person", () => {
    window.history.replaceState({}, "", "/terms");
    const page = render(<Router ssrPath="/terms"><Terms /></Router>);
    expect(page.container.querySelector('[data-testid="goal-policy"]')).not.toBeNull();
    expect(page.container.querySelector('[data-testid="goal-shell"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("keeps the public prerender entry auth-provider-free with its real support content", () => {
    const markup = renderToStaticMarkup(<Router ssrPath="/support"><Support /></Router>);
    expect(markup).toContain("Contact support");
    expect(markup).toContain("mailto:support@skipwait.me");
    expect(markup).not.toContain('data-testid="goal-shell"');
    expect(markup).not.toContain('aria-label="Account menu"');
  });
});
