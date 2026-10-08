// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EmployerOpportunities from "./EmployerOpportunities";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("tok") }), SignInButton: ({ children }: { children: React.ReactNode }) => children, useUser: () => ({ user: { emailAddresses: [] } }) }));
vi.mock("wouter", () => ({ useLocation: () => ["", vi.fn()] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => null }));

const role = { id: 3, companyDomain: "acme.com", kind: "hiring_now" as const, roleTitle: "Backend engineer", location: "Remote", compensation: null, isActive: true, sponsoredTier: null, sponsoredUntil: null, isSponsored: false };

describe("employer opportunities page", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ opportunities: [role] }) })));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("renders the loaded role with its sponsor CTA", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EmployerOpportunities /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Backend engineer" })).toBeTruthy());
    expect(screen.getByRole("button", { name: /Sponsor this role/ })).toBeTruthy();
  });

  it("announces a load failure as an alert", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: "We could not load your opportunities" }) })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EmployerOpportunities /></QueryClientProvider>);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not load your opportunities");
  });
});
