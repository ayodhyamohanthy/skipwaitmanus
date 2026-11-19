// @vitest-environment jsdom
// Released admin routes render the goal pages without a surface override.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminOverview from "../../AdminOverview";
import AdminReview from "../../AdminReview";
import "./GoalAdminOverview";
import "./GoalAdminReview";

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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("admin route retirement", () => {
  it.each([
    ["/admin", AdminOverview, "See what needs a decision."] as const,
    ["/admin-review", AdminReview, "Decide what's waiting."] as const,
  ])("%s renders the goal page without an override", async (_route, Page, goalLine) => {
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: goalLine })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='admin']")).toBeTruthy();
  });

});
