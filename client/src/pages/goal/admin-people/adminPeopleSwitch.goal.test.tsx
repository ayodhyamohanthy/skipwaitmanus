// @vitest-environment jsdom
// D-048-K-admin-people: both public routes always render the released goal
// pages, including their signed-out gate, without a surface mock or flag override.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AdminUsers from "../../AdminUsers";
import AdminPrivacyRequests from "../../AdminPrivacyRequests";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: async () => null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/admin/users", vi.fn()],
  useSearch: () => "",
}));

const renderPage = (ui: React.ReactElement) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>,
);
beforeAll(async () => { await Promise.all([import("./GoalAdminUsers"), import("./GoalAdminPrivacyRequests")]); });
afterEach(cleanup);

describe("admin-people retired public wrappers (D-048-K-admin-people)", () => {
  it.each([
    ["/admin/users", AdminUsers, "Administrator users directory", "admin-users-sign-in"] as const,
    ["/admin/privacy-requests", AdminPrivacyRequests, "Privacy request review", "admin-privacy-requests-sign-in"] as const,
  ])("%s renders the goal page unconditionally", async (_route, Page, kitHeading, screenId) => {
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: "Act on people requests." })).toBeTruthy();
    expect(container.querySelector("[data-goal-page]")).toBeTruthy();
    expect(container.querySelector(`[data-skipwait-screen='${screenId}']`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: kitHeading })).toBeNull();
    expect(screen.queryByRole("button", { name: "Secure sign in" })).toBeNull();
  });

  it.each([
    ["AdminUsers", "GoalAdminUsers", "Administrator users directory"] as const,
    ["AdminPrivacyRequests", "GoalAdminPrivacyRequests", "Privacy request review"] as const,
  ])("%s retains only its lazy goal wrapper", (page, goal, kitHeading) => {
    const source = readFileSync(join(__dirname, "../..", `${page}.tsx`), "utf8");
    expect(source).not.toMatch(/goalSurfaceOn|@\/lib\/goalSurfaces|@\/components\/|useAuth|useEffect|useMemo|useState|readApiJson/);
    expect(source).not.toMatch(/type (?:AdminUserRow|PrivacyRequest)|\bfetch\(/);
    expect(source).not.toContain(kitHeading);
    expect(source).toContain(`export default function ${page}()`);
    expect(source).toContain(`const ${goal} = lazy(() => import("./goal/admin-people/${goal}"));`);
    expect(source).toContain(`return <Suspense fallback={null}><${goal} /></Suspense>;`);
  });
});

describe("goal admin-people sources", () => {
  it("carry no inline hex colour (status is dot + text with tokens)", () => {
    const offenders = readdirSync(__dirname)
      .filter(name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      .filter(name => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(join(__dirname, name), "utf8")));
    expect(offenders).toEqual([]);
  });
});
