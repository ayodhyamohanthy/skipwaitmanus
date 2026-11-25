// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Settings from "./Settings";
import "./goal/settings/GoalSettings";

const authState = vi.hoisted(() => ({ signedIn: false }));
const trpcSpies = vi.hoisted(() => ({ stateUseQuery: vi.fn() }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.signedIn, isLoaded: true, signOut: vi.fn(), getToken: vi.fn(async () => null) }),
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    talentConsent: {
      state: { useQuery: trpcSpies.stateUseQuery },
      grant: { useMutation: () => ({ mutate: vi.fn() }) },
      revoke: { useMutation: () => ({ mutate: vi.fn() }) },
    },
    useUtils: () => ({ talentConsent: { state: { invalidate: vi.fn() } } }),
  },
}));

const renderAt = (search: string) => {
  window.history.replaceState({}, "", `/settings${search}`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Settings /></QueryClientProvider>);
};

describe("Settings signed-out gating", () => {
  afterEach(() => { cleanup(); authState.signedIn = false; trpcSpies.stateUseQuery.mockReset(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

  it("renders the goal page with the Region section by default, without any account fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    renderAt("");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Control your account.");
    expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Region" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { name: "Language & region" })).toBeTruthy();
    expect(screen.queryByText("SKIPWAIT.ME")).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("asks guests to sign in on account sections and never fires the authenticated consent query", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    renderAt("?section=privacy");
    expect(await screen.findByText("Sign in to manage blocked people, talent discovery consent, assistants and your data.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in?returnTo=%2Fsettings%3Fsection%3Dprivacy");
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(window.location.search).toBe("?section=account");
    expect(screen.getByText("Sign in to manage your work email and account.")).toBeTruthy();
    expect(trpcSpies.stateUseQuery).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("falls back to Region for an unknown section", async () => {
    renderAt("?section=billing");
    expect(await screen.findByRole("heading", { name: "Language & region" })).toBeTruthy();
  });

  it("loads the consent state on the Privacy section when signed in", async () => {
    authState.signedIn = true;
    trpcSpies.stateUseQuery.mockReturnValue({ data: { active: false }, isLoading: false });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ blocks: [] }) })));
    renderAt("?section=privacy");
    await screen.findByRole("heading", { name: "Talent discovery consent" });
    expect(trpcSpies.stateUseQuery).toHaveBeenCalledWith(undefined, expect.objectContaining({ retry: false }));
    expect(screen.getByRole("heading", { name: "Talent discovery consent" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage assistants" }).getAttribute("href")).toBe("/assistants");
  });
});
