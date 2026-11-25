// @vitest-environment jsdom
// D-048-p3-employer switch: /employer and /employer/opportunities render the
// goal page only when goalSurfaceOn("employer") is true; with the flag off the
// kit page stays (its own tests pin it: employerDashboard.test.tsx /
// employerOpportunities.test.tsx on the kit surface). One switch per page
// file, goal implementation under pages/goal/employer (D-048 split method).
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmployerDashboard from "../../EmployerDashboard";
import EmployerOpportunities from "../../EmployerOpportunities";

const { flag } = vi.hoisted(() => ({ flag: { on: false, asked: [] as string[] } }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => { flag.asked.push(id); return flag.on; } }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  useUser: () => ({ user: null }),
}));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/", vi.fn()] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const stub = () => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 401, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ error: "sign in" }) })));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = false; flag.asked = []; });

describe("employer switch (D-048-p3-employer)", () => {
  it.each([
    ["/employer", EmployerDashboard, "Hire without the noise."] as const,
    ["/employer/opportunities", EmployerOpportunities, "Sponsor a role."] as const,
  ])("$route renders the goal page when the goal flag is on", async (_route, Page, goalLine) => {
    stub(); flag.on = true;
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: goalLine })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='employer']")).toBeTruthy();
    expect(flag.asked).toContain("employer");
  });

  it.each([
    ["/employer", EmployerDashboard] as const,
    ["/employer/opportunities", EmployerOpportunities] as const,
  ])("$route keeps the kit page when the goal flag is off", async (_route, Page) => {
    stub();
    const { container } = renderPage(<Page />);
    await waitFor(() => expect(container.querySelector("[data-skipwait-screen]")).toBeTruthy());
    expect(container.querySelector("[data-goal-page]")).toBeNull();
    expect(flag.asked).toContain("employer");
  });
});
