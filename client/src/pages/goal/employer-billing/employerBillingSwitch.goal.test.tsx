// @vitest-environment jsdom
// D-048-K-employer-billing: the released /employer/billing route stays goal-only
// without consulting a surface switch. Goal behavior is pinned in
// employerBilling.goal.test.tsx; this entrypoint test prevents the Kit fallback
// from becoming reachable again.
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import EmployerBilling from "../../EmployerBilling";

beforeAll(async () => { await import("./GoalEmployerBilling"); }, 60_000);
afterAll(() => vi.resetModules());

const { goalSurfaceOn } = vi.hoisted(() => ({ goalSurfaceOn: vi.fn() }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn }));
// Signed in so the real goal billing module reaches its normal read state. The
// detailed money-boundary suite keeps Razorpay and every mutation intercepted.
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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); goalSurfaceOn.mockClear(); });

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("/employer/billing retirement (D-048-K-employer-billing)", () => {
  it("renders the released goal page without consulting a surface switch", async () => {
    serve();
    const { container } = renderPage(<EmployerBilling />);
    expect(await screen.findByRole("heading", { level: 1, name: "Control what you spend." })).toBeTruthy();
    const goalPage = container.querySelector("[data-goal-page='employer']");
    expect(goalPage).toBeTruthy();
    expect(container.querySelectorAll("[data-skipwait-screen='employer-billing']")).toHaveLength(1);
    expect(goalPage).toBe(container.querySelector("[data-skipwait-screen='employer-billing']"));
    expect(goalSurfaceOn).not.toHaveBeenCalled();
    expect(container.querySelectorAll("[data-testid='goal-button']")).toHaveLength(1);
    expect(container.querySelector("button button, a button, button a")).toBeNull();
  });
});
