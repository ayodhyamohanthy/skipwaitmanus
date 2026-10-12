// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Settings from "./Settings";

const accessState = vi.hoisted(() => ({ verified: false }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, signOut: vi.fn(), getToken: vi.fn(async () => null) }),
  useUser: () => ({ user: { emailAddresses: [] } }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

// The Privacy section renders talent consent through tRPC; these suites cover
// work email and data controls, so the consent queries are stubbed out.
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ talentConsent: { state: { invalidate: vi.fn().mockResolvedValue(undefined) } } }),
    talentConsent: {
      state: { useQuery: () => ({ data: undefined, isLoading: false }) },
      grant: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      revoke: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

const renderAt = (search: string) => {
  window.history.replaceState({}, "", `/settings${search}`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Settings /></QueryClientProvider>);
};

describe("Settings work email", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (input: string) => String(input).includes("/api/company-referrals/access") ? { ok: true, json: async () => ({ verifiedCompanyAccess: accessState.verified, workEmailDomain: accessState.verified ? "acme.com" : null }) } : String(input).includes("/api/blocks/mine") ? { ok: true, json: async () => ({ blocks: [] }) } : { ok: true, json: async () => ({ requests: [] }) })); });
  afterEach(() => { cleanup(); accessState.verified = false; window.history.replaceState({}, "", "/"); vi.unstubAllGlobals(); });

  it("offers Add work email, linking the verify flow, when no verified work email exists", async () => {
    renderAt("?section=account");
    expect(await screen.findByText("No verified work email yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add work email" }).getAttribute("href")).toBe("/verify");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/company-referrals/access", expect.objectContaining({ credentials: "include" }));
  });

  it("offers Referrer mode after a work email is verified", async () => {
    accessState.verified = true;
    renderAt("?section=account");
    expect(await screen.findByText("Work email verified")).toBeTruthy();
    expect(screen.getByText(/acme\.com/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch to Job Referrer mode" })).toBeTruthy();
  });

  it("asks for a deletion review instead of claiming an immediate deletion", () => {
    renderAt("?section=account");
    expect(screen.getByRole("button", { name: "Request account deletion" })).toBeTruthy();
    expect(screen.getByText(/review deletion requests rather than silently removing/i)).toBeTruthy();
  });

  it("keeps the personal data download in Privacy", () => {
    renderAt("?section=privacy");
    expect(screen.getByRole("button", { name: "Download my data" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Blocked people" })).toBeTruthy();
  });
});
