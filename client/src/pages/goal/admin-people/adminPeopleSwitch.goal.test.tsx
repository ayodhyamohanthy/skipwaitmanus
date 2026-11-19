// @vitest-environment jsdom
// D-048-K-admin-people: both route exports keep the released goal pages without
// a surface override. The old kit headings and switch are retired together.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

afterEach(cleanup);

describe("admin-people route retirement (D-048-K-admin-people)", () => {
  it.each([
    ["/admin/users", AdminUsers] as const,
    ["/admin/privacy-requests", AdminPrivacyRequests] as const,
  ])("%s renders the goal page without a surface override", async (_route, Page) => {
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: "Act on people requests." })).toBeTruthy();
    expect(container.querySelector("[data-goal-page]")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it.each([
    ["/admin/users", AdminUsers, "Administrator users directory"] as const,
    ["/admin/privacy-requests", AdminPrivacyRequests, "Privacy request review"] as const,
  ])("%s never returns to its retired kit page", async (_route, Page, kitHeading) => {
    const { container } = renderPage(<Page />);
    await screen.findByRole("heading", { level: 1, name: "Act on people requests." });
    expect(screen.queryByRole("heading", { level: 1, name: kitHeading })).toBeNull();
    expect(container.querySelector("[data-goal-page]")).toBeTruthy();
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
