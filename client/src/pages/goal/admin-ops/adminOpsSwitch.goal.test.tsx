// @vitest-environment jsdom
// D-048-K-admin-ops: every existing route export renders its released goal page
// without a surface override, and none retains a legacy fallback or switch.
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminActivity from "../../AdminActivity";
import AdminFlowHealth from "../../AdminFlowHealth";
import AdminSchema from "../../AdminSchema";
import AdminSmoke from "../../AdminSmoke";
import AdminPartners from "../../AdminPartners";
import { GOAL_PAGE as ACTIVITY_PAGE } from "./GoalAdminActivity";
import { GOAL_PAGE as FLOW_HEALTH_PAGE } from "./GoalAdminFlowHealth";
import { GOAL_PAGE as SCHEMA_PAGE } from "./GoalAdminSchema";
import { GOAL_PAGE as SMOKE_PAGE } from "./GoalAdminSmoke";
import { GOAL_PAGE as PARTNERS_PAGE } from "./GoalAdminPartners";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: async () => null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/admin", vi.fn()],
  useSearch: () => "",
}));

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const CASES = [
  ["AdminActivity", AdminActivity, ACTIVITY_PAGE],
  ["AdminFlowHealth", AdminFlowHealth, FLOW_HEALTH_PAGE],
  ["AdminSchema", AdminSchema, SCHEMA_PAGE],
  ["AdminSmoke", AdminSmoke, SMOKE_PAGE],
  ["AdminPartners", AdminPartners, PARTNERS_PAGE],
] as const;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
    String(input).includes("/smoke/status") ? { enabled: true, active: false, csrf: "test-csrf" } : {},
  ), { status: String(input).includes("/smoke/status") ? 200 : 404, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("retired admin operations routes", () => {
  it.each(CASES)("%s renders its released goal page without a surface override", async (_name, Page, goalPage) => {
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: goalPage.goalLine })).toBeTruthy();
    expect(container.querySelectorAll("[data-goal-page='admin']")).toHaveLength(1);
  });

  it.each(CASES)("%s retains only its goal route and lazy boundary", (name) => {
    const source = readFileSync(join(__dirname, "..", "..", `${name}.tsx`), "utf8");
    expect(source).not.toMatch(/goalSurfaceOn|@\/components\/kit/);
    expect(source).toContain(`<Goal${name} />`);
    expect(source).toContain("<Suspense fallback={null}>");
  });
});
