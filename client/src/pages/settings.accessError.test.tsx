// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Settings from "./Settings";
import "./goal/settings/GoalSettings";

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
  it("surfaces the work-email failure with its retry and leaves deletion untouched", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Settings /></QueryClientProvider>);
    expect(await screen.findByText("We could not check your work email. Nothing was changed.")).toBeTruthy();
    // Goal settings puts this failure in its next-step block, not the deletion section.
    expect(screen.getAllByText("We could not check your work email. Nothing was changed.")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Request account deletion" })).toBeTruthy();
    // The failed fetch must not masquerade as the legitimate "not verified yet" state.
    expect(screen.queryByText("No verified work email yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Verified · acme.com")).toBeTruthy());
    expect(screen.queryByText("We could not check your work email. Nothing was changed.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(accessAttempts).toBe(2);
  });
});
