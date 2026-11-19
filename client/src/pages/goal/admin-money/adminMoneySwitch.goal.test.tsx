// @vitest-environment jsdom
// D-048-p3-admin-money switch (D-048-admin.md §3, §4.1): /admin/payments,
// /admin/catalog-sync and /admin/token-recovery render the goal page only when
// goalSurfaceOn("admin-money") is true. With the flag off the kit pages stay
// byte-identical in behaviour - the switch is the only edit in those files.
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminPaymentsReview from "../../AdminPaymentsReview";
import AdminCatalogSync from "../../AdminCatalogSync";
import AdminTokenRecovery from "../../AdminTokenRecovery";

const { flag } = vi.hoisted(() => ({ flag: { on: false, asked: [] as string[] } }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => { flag.asked.push(id); return flag.on; } }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: async () => null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = false; flag.asked = []; });

describe("admin-money switch (D-048-p3-admin-money)", () => {
  it.each([
    ["/admin/payments", AdminPaymentsReview, "Keep the money truthful."] as const,
    ["/admin/catalog-sync", AdminCatalogSync, "Keep the money truthful."] as const,
    ["/admin/token-recovery", AdminTokenRecovery, "Keep the money truthful."] as const,
  ])("%s renders the goal page when the goal flag is on", async (_route, Page, goalLine) => {
    flag.on = true;
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: goalLine })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='admin-money']")).toBeTruthy();
    expect(flag.asked).toContain("admin-money");
  });

  it.each([
    ["/admin/payments", AdminPaymentsReview] as const,
    ["/admin/catalog-sync", AdminCatalogSync] as const,
    ["/admin/token-recovery", AdminTokenRecovery] as const,
  ])("%s keeps the kit page when the goal flag is off", async (_route, Page) => {
    const { container } = renderPage(<Page />);
    await waitFor(() => expect(container.querySelector("[data-skipwait-screen], h1")).toBeTruthy());
    expect(container.querySelector("[data-goal-page]")).toBeNull();
    expect(flag.asked).toContain("admin-money");
  });

  it("asks only for the admin-money flag, never another surface", () => {
    renderPage(<AdminPaymentsReview />);
    expect(flag.asked.length).toBeGreaterThan(0);
    expect(flag.asked.every(id => id === "admin-money")).toBe(true);
  });
});
