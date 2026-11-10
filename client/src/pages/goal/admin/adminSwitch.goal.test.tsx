// @vitest-environment jsdom
// D-048-p3-admin switch: /admin and /admin-review render the goal page only
// when goalSurfaceOn("admin") is true (the row's flag, D-048-admin.md §3);
// with the flag off the kit pages stay (their own tests pin them:
// adminOverview.test.tsx / adminReview.test.tsx). One switch per page file,
// goal implementation under pages/goal/admin (D-048 split method).
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminOverview from "../../AdminOverview";
import AdminReview from "../../AdminReview";

const { flag } = vi.hoisted(() => ({ flag: { on: false, asked: [] as string[] } }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => { flag.asked.push(id); return flag.on; } }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: async () => null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/admin", vi.fn()],
  useSearch: () => "",
}));

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = false; flag.asked = []; });

describe("admin switch (D-048-p3-admin)", () => {
  it.each([
    ["/admin", AdminOverview, "See what needs a decision."] as const,
    ["/admin-review", AdminReview, "Decide what's waiting."] as const,
  ])("%s renders the goal page when the goal flag is on", async (_route, Page, goalLine) => {
    flag.on = true;
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: goalLine })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='admin']")).toBeTruthy();
    expect(flag.asked).toContain("admin");
  });

  it.each([
    ["/admin", AdminOverview] as const,
    ["/admin-review", AdminReview] as const,
  ])("%s keeps the kit page when the goal flag is off", async (_route, Page) => {
    const { container } = renderPage(<Page />);
    await waitFor(() => expect(container.querySelector("[data-skipwait-screen]")).toBeTruthy());
    expect(container.querySelector("[data-goal-page]")).toBeNull();
    expect(flag.asked).toContain("admin");
  });
});
