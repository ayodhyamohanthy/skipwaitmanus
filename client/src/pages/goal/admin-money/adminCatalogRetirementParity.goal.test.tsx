// @vitest-environment jsdom
// D-048-K-admin-money: preserve the catalog safety/recovery assertions before
// deleting the legacy body. Every response is synthetic; no provider is used.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { catalogSyncApplyResponseSchema, catalogSyncDryRunSchema } from "@shared/catalogSync";
import LegacyCatalog from "../../AdminCatalogSync";
import GoalCatalog from "./GoalAdminCatalogSync";
import fixture from "./retirement/catalogFixture.json";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => "fixture-token", openSignIn: vi.fn() }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const dryRun = catalogSyncDryRunSchema.parse(fixture.dryRun);
const report = catalogSyncApplyResponseSchema.parse(fixture.report);

beforeEach(() => {
  vi.stubEnv("VITE_GOAL_SURFACES", "");
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
    ok: true, status: 200, json: async () => init?.method === "POST" ? report : dryRun,
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe.each([["legacy control", LegacyCatalog], ["released goal", GoalCatalog]] as const)("catalog retirement parity: %s", (_label, Page) => {
  it("lists extra and excluded prices with their explanations", async () => {
    render(<Page />);
    await screen.findByText("To create (1)");
    expect(screen.queryByText("fixture-extra-INR")).toBeTruthy();
    expect(screen.queryByText("Fixture legacy price is left alone.")).toBeTruthy();
    expect(screen.queryByText("fixture-excluded-INR")).toBeTruthy();
    expect(screen.queryByText(/Fixture price is excluded from self-serve checkout/)).toBeTruthy();
  });

  it("shows the failed and unattempted objects and a fresh dry-run action after a partial apply", async () => {
    const { container } = render(<Page />);
    const field = await screen.findByRole("textbox", { name: /Type the site.*confirm/ });
    const apply = screen.getByRole("button", { name: /^Apply/ });
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([]);
    fireEvent.change(field, { target: { value: "fixture-test" } });
    fireEvent.click(apply);
    await waitFor(() => expect(container.querySelector('[data-testid="catalog-report"], section[role="status"]')).toBeTruthy());
    const result = container.querySelector<HTMLElement>('[data-testid="catalog-report"], section[role="status"]');
    if (!result) throw new Error("Catalog apply report is missing");
    expect(within(result).queryByText(/fixture-failed-INR was refused/)).toBeTruthy();
    expect(within(result).queryByText("Fixture billing frequency was refused.")).toBeTruthy();
    expect(within(result).queryByText(/Not attempted: fixture-unattempted-INR/)).toBeTruthy();
    const reload = within(result).getByRole("button", { name: "Run the dry run again" });
    const readsBefore = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method !== "POST").length;
    fireEvent.click(reload);
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method !== "POST").length).toBe(readsBefore + 1));
  });
});
