// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Settings from "./Settings";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, getToken: vi.fn().mockResolvedValue("token") }),
  useUser: () => ({ user: { imageUrl: "https://cdn.example/a.png", fullName: "Avery", emailAddresses: [{ emailAddress: "ref@acme.com", verification: { status: "verified" } }] }, isSignedIn: true }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: () => null,
}));

describe("Settings new-ask email switch", () => {
  beforeEach(() => { window.history.replaceState({}, "", "/settings?section=notifications"); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

  it("shows the existing preference (default on) and saves only notifyNewAsk", { timeout: 15000 }, async () => {
    const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      const path = String(url);
      if (path.includes("/api/company-referrals/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
      if (path.includes("/api/referrer-preferences")) return { ok: true, json: async () => ({ preferences: { referralCapacity: 3, notifyNewAsk: init?.method === "PUT" ? false : true, paused: false } }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Settings /></QueryClientProvider>);
    const toggle = await screen.findByRole("switch", { name: /Email when a new ask arrives/ });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);
    await waitFor(() => expect(screen.getByRole("switch", { name: /Email when a new ask arrives/ }).getAttribute("aria-checked")).toBe("false"));
    const put = fetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(JSON.parse((put?.[1] as RequestInit).body as string)).toEqual({ notifyNewAsk: false });
  });

  it("does not show the switch without a verified work email", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => String(url).includes("/api/company-referrals/access") ? { ok: true, json: async () => ({ verifiedCompanyAccess: false, workEmailDomain: null }) } : { ok: true, json: async () => ({}) }));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Settings /></QueryClientProvider>);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.queryByRole("switch", { name: /Email when a new ask arrives/ })).toBeNull();
  });
});
