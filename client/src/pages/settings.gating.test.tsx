// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Settings from "./Settings";

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

  it("renders the kit page with the Region panel by default, without any account fetch", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    renderAt("");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Settings.");
    expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Region" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { name: "Language & region" })).toBeTruthy();
    expect(screen.queryByText("SKIPWAIT.ME")).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("asks guests to sign in on account sections and never fires the authenticated consent query", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    renderAt("?section=privacy");
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(window.location.search).toBe("?section=account");
    expect(screen.getByRole("heading", { name: "Account" })).toBeTruthy();
    expect(trpcSpies.stateUseQuery).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("falls back to Region for an unknown section", () => {
    renderAt("?section=billing");
    expect(screen.getByRole("heading", { name: "Language & region" })).toBeTruthy();
  });

  it("loads the consent state on the Privacy section when signed in", () => {
    authState.signedIn = true;
    trpcSpies.stateUseQuery.mockReturnValue({ data: { active: false }, isLoading: false });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ blocks: [] }) })));
    renderAt("?section=privacy");
    expect(trpcSpies.stateUseQuery).toHaveBeenCalledWith(undefined, expect.objectContaining({ retry: false }));
    expect(screen.getByRole("heading", { name: "Talent discovery consent" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage assistants" }).getAttribute("href")).toBe("/assistants");
  });
});
