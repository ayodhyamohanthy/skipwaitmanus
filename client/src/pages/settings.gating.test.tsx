// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

describe("Settings signed-out gating", () => {
  afterEach(() => { cleanup(); authState.signedIn = false; trpcSpies.stateUseQuery.mockReset(); vi.unstubAllGlobals(); });

  it("never fires the authenticated consent query when logged out, so no AuthKit redirect", () => {
    trpcSpies.stateUseQuery.mockReturnValue({ data: undefined, isLoading: false });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    render(<Settings />);
    expect(screen.getByText("Secure sign in")).toBeTruthy();
    expect(trpcSpies.stateUseQuery).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: false }));
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith("/api/company-referrals/access", expect.anything());
  });

  it("loads the consent state when signed in", () => {
    authState.signedIn = true;
    trpcSpies.stateUseQuery.mockReturnValue({ data: { consented: false }, isLoading: false });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [] }) })));
    render(<Settings />);
    expect(trpcSpies.stateUseQuery).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: true }));
  });
});
