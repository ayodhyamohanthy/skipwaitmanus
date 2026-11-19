// @vitest-environment jsdom
// D-048-K-admin-money red-first: the released goal pages render without a legacy fallback
// or a surface switch. The page exports remain stable for App.tsx.
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminPaymentsReview from "../../AdminPaymentsReview";
import AdminCatalogSync from "../../AdminCatalogSync";
import AdminTokenRecovery from "../../AdminTokenRecovery";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: async () => null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("admin-money retirement (D-048-K-admin-money)", () => {
  it.each([
    ["/admin/payments", AdminPaymentsReview, "Keep the money truthful."] as const,
    ["/admin/catalog-sync", AdminCatalogSync, "Keep the money truthful."] as const,
    ["/admin/token-recovery", AdminTokenRecovery, "Keep the money truthful."] as const,
  ])("%s renders the goal page by default", async (_route, Page, goalLine) => {
    const { container } = renderPage(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: goalLine })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='admin-money']")).toBeTruthy();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("keeps the stable default exports as unconditional lazy goal adapters", () => {
    const files = ["AdminPaymentsReview.tsx", "AdminCatalogSync.tsx", "AdminTokenRecovery.tsx"];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), "client/src/pages", file), "utf8");
      expect(source, file).toContain("export default function");
      expect(source, file).toContain("lazy(() => import(");
      expect(source, file).toContain("<Suspense");
      expect(source, file).not.toContain("goalSurfaceOn");
      expect(source, file).not.toContain("@/components/admin/");
      expect(source, file).not.toContain("@/_core/auth");
    }
  });
});
