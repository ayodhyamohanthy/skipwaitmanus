// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Settings from "./Settings";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, getToken: vi.fn().mockResolvedValue("test-token") }),
  useUser: () => ({ user: { emailAddresses: [] } }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ talentConsent: { state: { invalidate: vi.fn().mockResolvedValue(undefined) } } }),
    talentConsent: {
      state: { useQuery: () => ({ data: undefined }) },
      grant: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      revoke: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

let accessAttempts = 0;

beforeEach(() => {
  accessAttempts = 0;
  window.history.replaceState({}, "", "/settings?section=account");
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = String(input);
    if (url.includes("/api/company-referrals/access")) {
      accessAttempts += 1;
      if (accessAttempts === 1) return { ok: false, status: 503, json: async () => ({ error: "We could not check your work-email access" }) };
      return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
    }
    if (url.includes("/api/privacy/requests")) return { ok: true, json: async () => ({ requests: [] }) };
    return { ok: true, json: async () => ({}) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("Settings work-email access failure", () => {
  it("surfaces the failure inside the Work email Panel with an announced retry", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Settings /></QueryClientProvider>);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not check your work-email access");
    // Exactly one alert: the failure must not also leak into the deletion Panel.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    // The failed fetch must not masquerade as the legitimate "not verified yet" state.
    expect(screen.queryByText("No verified work email yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Work email verified")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(accessAttempts).toBe(2);
  });
});
