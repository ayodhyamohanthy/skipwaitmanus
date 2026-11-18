// @vitest-environment jsdom
// D-048-p3-admin-ops switch (D-048-admin.md §3): each of the five ops pages
// renders its goal variant only when goalSurfaceOn("admin-ops") is true, and
// the untouched kit page otherwise - the row adds a switch only, the goal
// implementation lives under pages/goal/admin-ops (D-048 split method).
import React from "react";
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

const { flag, auth } = vi.hoisted(() => ({ flag: { on: false, asked: [] as string[] }, auth: { isSignedIn: false } }));

vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => { flag.asked.push(id); return flag.on; } }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: auth.isSignedIn, getToken: async () => null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/admin", vi.fn()],
  useSearch: () => "",
}));

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

/** The signed-out kit screen each page shows today - proof the kit page still renders with the flag off. */
const CASES = [
  ["AdminActivity", AdminActivity, ACTIVITY_PAGE, "Administrator activity"],
  ["AdminFlowHealth", AdminFlowHealth, FLOW_HEALTH_PAGE, "Admin Flow Health"],
  ["AdminSchema", AdminSchema, SCHEMA_PAGE, "Schema reconcile"],
  ["AdminSmoke", AdminSmoke, SMOKE_PAGE, "Protected smoke fixture"],
  ["AdminPartners", AdminPartners, PARTNERS_PAGE, "Administrator sign-in required"],
] as const;

// The fixture surface only shows a screen at all while it is enabled, so its
// status route answers as an enabled fixture; every other route 404s, which
// leaves the other four pages on their signed-out screens.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    void url;
    if (String(url).includes("/smoke/status")) return { ok: true, status: 200, url: "http://localhost/api", json: async () => ({ enabled: true, active: false, csrf: "test-csrf" }) } as unknown as Response;
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = false; flag.asked = []; auth.isSignedIn = false; });

describe("admin-ops switch (D-048-p3-admin-ops)", () => {
  it.each(CASES)("%s renders the goal page when the goal flag is on", async (_name, Page, goalPage) => {
    flag.on = true;
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: goalPage.goalLine })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='admin']")).toBeTruthy();
    expect(flag.asked).toContain("admin-ops");
  });

  it.each(CASES)("%s keeps the kit page when the goal flag is off", async (_name, Page, _goalPage, kitHeading) => {
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: kitHeading })).toBeTruthy();
    expect(container.querySelector("[data-goal-page]")).toBeNull();
    expect(flag.asked).toContain("admin-ops");
  });
});
