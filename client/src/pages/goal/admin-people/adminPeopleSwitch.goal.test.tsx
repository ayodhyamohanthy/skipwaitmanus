// @vitest-environment jsdom
// D-048-p3-admin-people switches (D-048-admin.md §3): /admin/users and
// /admin/privacy-requests render the goal page only when
// goalSurfaceOn("admin-people") is true; with the flag off both kit pages stay
// untouched (adminUsers.test.tsx pins the kit behaviour). One switch per page
// file, the goal implementation under pages/goal/admin-people.
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import AdminUsers from "../../AdminUsers";
import AdminPrivacyRequests from "../../AdminPrivacyRequests";
const { flag } = vi.hoisted(() => ({ flag: { on: false, asked: [] as string[] } }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => { flag.asked.push(id); return flag.on; } }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: async () => null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/admin/users", vi.fn()],
  useSearch: () => "",
}));

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

afterEach(() => { cleanup(); flag.on = false; flag.asked = []; });

describe("admin-people switches (D-048-p3-admin-people)", () => {
  it.each([
    ["/admin/users", AdminUsers] as const,
    ["/admin/privacy-requests", AdminPrivacyRequests] as const,
  ])("%s renders the goal page when the goal flag is on", async (_route, Page) => {
    flag.on = true;
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: "Act on people requests." })).toBeTruthy();
    expect(container.querySelector("[data-goal-page]")).toBeTruthy();
    expect(flag.asked).toContain("admin-people");
  });

  it.each([
    ["/admin/users", AdminUsers, "Administrator users directory"] as const,
    ["/admin/privacy-requests", AdminPrivacyRequests, "Privacy request review"] as const,
  ])("%s keeps the kit page when the goal flag is off", async (_route, Page, kitHeading) => {
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: kitHeading })).toBeTruthy();
    await waitFor(() => expect(container.querySelector("[data-goal-page]")).toBeNull());
    expect(flag.asked).toContain("admin-people");
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
