// @vitest-environment jsdom
// D-048-K-employer (D-332, packet docs/plans/D-048-retire.md §3): the
// goalSurfaceOn("employer") switch is gone, so /employer and
// /employer/opportunities render the goal page unconditionally. This file
// replaces the retired switch test's two cases (flag on rendered the goal page,
// flag off kept the kit page) with one unconditional goal-render assertion per
// route: there is no kit page left to keep, and no flag left to ask.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmployerDashboard from "../../EmployerDashboard";
import EmployerOpportunities from "../../EmployerOpportunities";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  useUser: () => ({ user: null }),
}));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/", vi.fn()] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const stub = () => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 401, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ error: "sign in" }) })));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("employer routes render the goal page alone (D-048-K-employer)", () => {
  it.each([
    ["/employer", EmployerDashboard, "Hire without the noise."] as const,
    ["/employer/opportunities", EmployerOpportunities, "Sponsor a role."] as const,
  ])("$route renders the goal page with no switch", async (_route, Page, goalLine) => {
    stub();
    const { container } = renderPage(<Page />);
    // The page module is still a lazy chunk, so the first cold transform can
    // take longer than the 1 s query default.
    expect(await screen.findByRole("heading", { level: 1, name: goalLine }, { timeout: 10_000 })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='employer']")).toBeTruthy();
  });
});
