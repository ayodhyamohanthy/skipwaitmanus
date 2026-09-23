// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Settings from "./Settings";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }),
  useUser: () => ({ user: { emailAddresses: [] } }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <span>Account</span> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <span>skipwait.me</span> }));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/settings", vi.fn()],
}));
// Settings renders the talent-consent section through tRPC; this suite covers
// the work-email access fetch, so the consent queries are stubbed out.
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
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = String(input);
    if (url.includes("/api/company-referrals/access")) {
      accessAttempts += 1;
      if (accessAttempts === 1) return { ok: false, status: 503, json: async () => ({ error: "We could not check your work-email access" }) };
      return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
    }
    if (url.includes("/api/privacy/requests")) return { ok: true, json: async () => ({ requests: [] }) };
    if (url.includes("/api/referrer/slack-webhook")) return { ok: true, json: async () => ({ connected: false, active: false }) };
    return { ok: true, json: async () => ({}) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Settings work-email access failure", () => {
  it("surfaces the failure inside the Work email section with an announced retry", async () => {
    render(<Settings />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not check your work-email access");
    // Exactly one alert: the failure must not also leak into the privacy section.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    // The failed fetch must not masquerade as the legitimate "not verified yet" state.
    expect(screen.queryByText("No verified work email yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Work email verified")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(accessAttempts).toBe(2);
  });
});
