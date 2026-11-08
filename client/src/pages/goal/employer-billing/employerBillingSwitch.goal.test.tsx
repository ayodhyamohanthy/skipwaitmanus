// @vitest-environment jsdom
// D-048-p3-employer-billing switch: /employer/billing renders the goal page only
// when goalSurfaceOn("employer-billing") is true; with the flag off the kit page
// stays exactly as it is (one switch line in client/src/pages/EmployerBilling.tsx,
// the D-048 split method). The goal page's own states are pinned by
// employerBilling.goal.test.tsx; the kit page has no test file of its own, so the
// flag-off half of this file is the parity pin for the untouched kit surface.
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmployerBilling from "../../EmployerBilling";

const { flag } = vi.hoisted(() => ({ flag: { on: false, asked: [] as string[] } }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => { flag.asked.push(id); return flag.on; } }));
// Signed in, so the goal half reaches its billing render; SignInButton is not
// mocked (see employerBilling.goal.test.tsx — the gate calls openSignIn instead).
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, openSignIn: vi.fn() }),
  useUser: () => ({ user: null }),
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => null }));
vi.mock("@/components/Brand", () => ({ Brand: () => null }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/", vi.fn()] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const ACCOUNT = { id: 7, companyName: "Northwind Robotics", billingEmail: "hire@northwind.example", credits: 8, budgetMonthlyUsdCents: 5000, approvalStatus: "approved" };

const serve = () => vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
  const path = String(input).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const json = (body: unknown) => ({ ok: true, status: 200, url: `http://localhost:3000${path}`, headers: new Headers({ "content-type": "application/json" }), json: async () => body });
  if (path === "/api/employer/account") return json({ account: ACCOUNT });
  if (path === "/api/employer/spend-history") return json({ spend: [] });
  return json({});
}) as never);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = false; flag.asked = []; });

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("/employer/billing switch (D-048-p3-employer-billing)", () => {
  it("renders the goal page when the goal flag is on", async () => {
    serve(); flag.on = true;
    const { container } = renderPage(<EmployerBilling />);
    expect(await screen.findByRole("heading", { level: 1, name: "Control what you spend." })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='employer']")).toBeTruthy();
    expect(flag.asked).toContain("employer-billing");
  });

  it("keeps the kit page, untouched, when the goal flag is off", async () => {
    serve();
    const { container } = renderPage(<EmployerBilling />);
    await waitFor(() => expect(container.querySelector("[data-skipwait-screen='employer-billing']")).toBeTruthy());
    expect(container.querySelector("[data-goal-page]")).toBeNull();
    expect(screen.getByRole("heading", { name: "Credits and billing." })).toBeTruthy();
    // The kit page's three per-pack "Buy" buttons: the goal page replaces them
    // with one commit, so this is the parity pin that the kit is untouched.
    expect(screen.getAllByRole("button", { name: "Buy" })).toHaveLength(3);
    expect(screen.getByText("Buy a pack, unlock talent, or sponsor a role to get started.")).toBeTruthy();
    expect(flag.asked).toContain("employer-billing");
  });
});
