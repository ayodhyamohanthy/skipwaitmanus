// @vitest-environment jsdom
// D-048-K-employer-billing: /employer/billing always serves the released goal page.
import React from "react";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import EmployerBilling from "../../EmployerBilling";

beforeAll(async () => { await import("./GoalEmployerBilling"); });

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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("/employer/billing retirement (D-048-K-employer-billing)", () => {
  it("removes the surface switch and legacy billing body", () => {
    const source = readFileSync("client/src/pages/EmployerBilling.tsx", "utf8");
    expect(source).not.toContain("goalSurfaceOn");
    expect(source).not.toContain("Credits and billing.");
    expect(source).not.toContain('id: "starter", credits:');
    expect(source).toContain('lazy(() => import("./goal/employer-billing/GoalEmployerBilling"))');
    expect(source).toContain("fallback={null}");
  });

  it("renders the goal billing page from the default export", async () => {
    serve();
    const { container } = renderPage(<EmployerBilling />);
    expect(await screen.findByRole("heading", { level: 1, name: "Control what you spend." })).toBeTruthy();
    expect(await screen.findByText("Talent unlock balance")).toBeTruthy();
    expect(container.querySelector("[data-goal-page='employer']")).toBeTruthy();
    expect(container.querySelector("[data-skipwait-screen='employer-billing']")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Credits and billing." })).toBeNull();
    expect(screen.queryByRole("button", { name: "Buy" })).toBeNull();
    expect(screen.getByRole("button", { name: "Top up for talent unlocks and sponsored roles" })).toBeTruthy();
    expect(container.querySelectorAll("[data-g-primary]")).toHaveLength(1);
  });
});
