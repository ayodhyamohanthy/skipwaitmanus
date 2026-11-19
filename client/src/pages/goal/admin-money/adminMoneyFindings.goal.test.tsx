// @vitest-environment jsdom
// D-048-R-admin-money: red-first pins for the three independent Tier 1 review
// findings on PR #1204 (exact head 4992bc32). Each test reproduces the reviewer's
// synthetic fixture; no real payment, provider or catalog call is made.
//   F1 /admin/payments says "Queue clear" only after the queue loaded empty.
//   F2 /admin/catalog-sync shows every planned object, mismatch and blocked
//      reason before the typed-site apply can be used.
//   F3 /admin/token-recovery retries the history for real and never shows the
//      empty history after a failed read.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminPayments, { GOAL_PAGE as PAYMENTS_PAGE } from "./GoalAdminPayments";
import GoalAdminCatalogSync, { GOAL_PAGE as CATALOG_PAGE } from "./GoalAdminCatalogSync";
import GoalAdminTokenRecovery, { GOAL_PAGE as RECOVERY_PAGE } from "./GoalAdminTokenRecovery";

const { calls } = vi.hoisted(() => ({ calls: [] as { url: string; init?: RequestInit }[] }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => "test-token", openSignIn: () => {} }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const reply = (payload: unknown, ok = true, status = 200) => ({ ok, status, url: "", json: async () => payload });
const HASH = "b".repeat(64);

beforeEach(() => { calls.length = 0; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("F1: goal /admin/payments never calls an unverified queue clear", () => {
  it("does not say Queue clear while the queue is still loading", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => { await gate; return reply({ payments: [] }); }));
    const { container } = render(<GoalAdminPayments />);
    expect(screen.queryByText("Queue clear")).toBeNull();
    await waitFor(() => expect(screen.getByText("Checking the queue")).toBeTruthy());
    expect(screen.queryByText("Queue clear")).toBeNull();
    assertGoalPage(container, PAYMENTS_PAGE);
    release();
    // The positive case survives: a successfully loaded empty queue is clear.
    expect(await screen.findByText("Queue clear")).toBeTruthy();
  });

  it("does not say Queue clear when the queue request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ error: "Queue unavailable" }, false, 503)));
    const { container } = render(<GoalAdminPayments />);
    expect(await screen.findByText("Queue unavailable")).toBeTruthy();
    expect(screen.queryByText("Queue clear")).toBeNull();
    expect(screen.getByText("Queue not loaded")).toBeTruthy();
    assertGoalPage(container, PAYMENTS_PAGE);
  });

  it("does not say Queue clear when only the recent-payments request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("scope=credited") ? reply({ error: "Recent unavailable" }, false, 503) : reply({ payments: [] })));
    render(<GoalAdminPayments />);
    expect(await screen.findByText("Recent unavailable")).toBeTruthy();
    expect(screen.queryByText("Queue clear")).toBeNull();
  });

  it("does not keep a stale count or clear state after a reload fails", async () => {
    let fail = false;
    vi.stubGlobal("fetch", vi.fn(async () => fail ? reply({ error: "Queue unavailable" }, false, 503) : reply({ payments: [] })));
    render(<GoalAdminPayments />);
    expect(await screen.findByText("Queue clear")).toBeTruthy();
    fail = true;
    fireEvent.click(screen.getByRole("button", { name: "Reload the queue" }));
    expect(await screen.findByText("Queue unavailable")).toBeTruthy();
    expect(screen.queryByText("Queue clear")).toBeNull();
  });
});

const CREATE_PRICE = {
  kind: "item_price",
  params: { id: "plan-mid-inr-monthly", name: "plan-mid-inr-monthly", itemId: "plan-mid", itemType: "plan", pricingModel: "flat_fee", price: 89900, currencyCode: "INR", externalName: "Mid plan", period: 1, periodUnit: "month", billingCycles: null },
} as const;
const CREATE_ITEM = {
  kind: "item",
  params: { id: "plan-mid", name: "plan-mid", type: "plan", itemFamilyId: "skipwait-family", externalName: "Mid plan item", enabledInPortal: null },
} as const;
const DRY_RUN = {
  version: 1, site: "skipwait-test", environment: "test", checkedAt: "2026-11-04T00:00:00.000Z", planHash: HASH,
  family: { id: "skipwait-family", action: "reuse", reason: "Family present" },
  toCreate: [CREATE_ITEM, CREATE_PRICE],
  correct: [],
  mismatched: [{ itemPriceId: "pack-early-usd", currencyCode: "USD", price: 449, term: "one_time", diffs: [{ field: "price", expected: 449, actual: 499 }], sellableNow: true }],
  blocked: [{ itemPriceId: "pack-senior-inr", currencyCode: "INR", price: 129900, term: "one_time", reason: "Archived item price with the same id" }],
  extras: [{ kind: "item_price", id: "legacy-extra-price", status: "active", note: "Not in the sold catalog" }],
  excluded: [{ itemPriceId: "legacy-excluded-price", reason: "Excluded from the active catalog" }],
  counts: { desired: 4, correct: 0, mismatched: 1, blocked: 1, toCreate: 2, itemPricesToCreate: 1, extras: 1, excluded: 1 },
};

const PARTIAL_REPORT = {
  outcome: "partial", site: "skipwait-test", environment: "test", planHash: HASH,
  created: [{ kind: "item", id: "plan-mid", diffs: [{ field: "name", expected: "Mid plan item", actual: "Mid plan" }] }],
  failed: { kind: "item_price", id: "plan-mid-inr-monthly", httpStatus: 503, apiErrorCode: "provider_unavailable", errorCode: "timeout", message: "The provider did not confirm this price." },
  notAttempted: [{ kind: "item_price", id: "plan-senior-inr-monthly" }],
  stoppedReason: "provider_error",
};

describe("F2: goal /admin/catalog-sync shows what apply would do before it can run", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/catalog-sync/apply")) return reply({ outcome: "applied", site: "skipwait-test", environment: "test", planHash: HASH, created: [], failed: null, notAttempted: [], stoppedReason: null });
      return reply(DRY_RUN);
    }));
  });

  it("lists every object to create with its parameters", async () => {
    const { container } = render(<GoalAdminCatalogSync />);
    const created = await screen.findByRole("region", { name: "Objects to create" });
    expect(created.textContent).toContain("plan-mid-inr-monthly");
    expect(created.textContent).toContain("plan-mid");
    expect(created.textContent).toContain("INR 899");
    expect(created.textContent).toContain("Mid plan");
    assertGoalPage(container, CATALOG_PAGE);
  });

  it("shows each mismatch with its expected and actual values and whether it still sells", async () => {
    render(<GoalAdminCatalogSync />);
    const mismatched = await screen.findByRole("region", { name: "Mismatched prices" });
    expect(mismatched.textContent).toContain("pack-early-usd");
    expect(mismatched.textContent).toContain("price: expected 449, Chargebee has 499");
    expect(mismatched.textContent).toContain("Still sells");
  });

  it("shows each blocked object with its reason", async () => {
    render(<GoalAdminCatalogSync />);
    const blocked = await screen.findByRole("region", { name: "Blocked prices" });
    expect(blocked.textContent).toContain("pack-senior-inr");
    expect(blocked.textContent).toContain("Archived item price with the same id");
  });

  it("explains every extra as left alone and every excluded price as never created", async () => {
    render(<GoalAdminCatalogSync />);
    const extras = await screen.findByRole("region", { name: "Extra objects left alone" });
    expect(extras.textContent).toContain("legacy-extra-price");
    expect(extras.textContent).toContain("Item price");
    expect(extras.textContent).toContain("active");
    expect(extras.textContent).toContain("Not in the sold catalog");
    const excluded = screen.getByRole("region", { name: "Excluded prices" });
    expect(excluded.textContent).toContain("legacy-excluded-price");
    expect(excluded.textContent).toContain("Excluded from the active catalog");
  });

  it("keeps the typed-site confirmation and sends nothing before it", async () => {
    render(<GoalAdminCatalogSync />);
    await screen.findByRole("region", { name: "Objects to create" });
    const applyButton = screen.getByRole("button", { name: "Apply the catalog plan" });
    fireEvent.click(applyButton);
    expect(calls.some(call => call.url.includes("/catalog-sync/apply"))).toBe(false);
    fireEvent.change(screen.getByLabelText("Type the site to confirm"), { target: { value: "skipwait-test" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply the catalog plan" }));
    await waitFor(() => expect(calls.filter(call => call.url.includes("/catalog-sync/apply")).length).toBe(1));
  });

  it("says plainly when the plan has nothing to create, mismatch or block", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ ...DRY_RUN, toCreate: [], mismatched: [], blocked: [], counts: { ...DRY_RUN.counts, toCreate: 0, itemPricesToCreate: 0, mismatched: 0, blocked: 0 } })));
    const { container } = render(<GoalAdminCatalogSync />);
    expect(await screen.findByText("Nothing to create. Every sold price already matches the catalog.")).toBeTruthy();
    expect(screen.getByText("No existing price differs from the catalog.")).toBeTruthy();
    expect(screen.getByText("Nothing is blocked.")).toBeTruthy();
    assertGoalPage(container, CATALOG_PAGE);
  });

  it("shows all partial-apply details and requires a deliberate dry-run read before another apply", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? reply(PARTIAL_REPORT) : reply(DRY_RUN));
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalAdminCatalogSync />);
    await screen.findByRole("region", { name: "Objects to create" });
    fireEvent.change(screen.getByLabelText("Type the site to confirm"), { target: { value: "skipwait-test" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply the catalog plan" }));

    const result = await screen.findByRole("region", { name: "Apply result" });
    expect(result.textContent).toContain("Sync partial");
    expect(result.textContent).toContain("plan-mid");
    expect(result.textContent).toContain("name: expected Mid plan item, provider returned Mid plan");
    expect(result.textContent).toContain("plan-mid-inr-monthly");
    expect(result.textContent).toContain("The provider did not confirm this price.");
    expect(result.textContent).toContain("plan-senior-inr-monthly");
    expect(screen.queryByRole("button", { name: "Apply the catalog plan" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Run the dry run again" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === undefined)).toHaveLength(2));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Apply result" })).toBeNull();
    expect((screen.getByLabelText("Type the site to confirm") as HTMLInputElement).value).toBe("");
  });

  it("keeps the previous report visible when the deliberate dry-run refresh fails", async () => {
    let reads = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return reply(PARTIAL_REPORT);
      reads += 1;
      return reads === 1 ? reply(DRY_RUN) : reply({ error: "Catalog unavailable" }, false, 503);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalAdminCatalogSync />);
    await screen.findByRole("region", { name: "Objects to create" });
    fireEvent.change(screen.getByLabelText("Type the site to confirm"), { target: { value: "skipwait-test" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply the catalog plan" }));
    const result = await screen.findByRole("region", { name: "Apply result" });

    fireEvent.click(screen.getByRole("button", { name: "Run the dry run again" }));
    expect(await screen.findByText("Catalog unavailable")).toBeTruthy();
    expect(result.textContent).toContain("plan-mid-inr-monthly");
    expect(screen.queryByRole("button", { name: "Apply the catalog plan" })).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});

describe("F3: goal /admin/token-recovery history retry is real", () => {
  it("retries the history with a second GET and shows empty only after a successful read", async () => {
    let historyCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("token-recovery/adjustments")) {
        historyCalls += 1;
        return historyCalls === 1 ? reply({ error: "History unavailable" }, false, 500) : reply({ adjustments: [] });
      }
      return reply({});
    }));
    const { container } = render(<GoalAdminTokenRecovery />);
    expect(await screen.findByText("History unavailable")).toBeTruthy();
    expect(screen.queryByText("No recovery grants have been recorded.")).toBeNull();
    expect(screen.queryByText("0 recorded")).toBeNull();
    assertGoalPage(container, RECOVERY_PAGE);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(historyCalls).toBe(2));
    expect(await screen.findByText("No recovery grants have been recorded.")).toBeTruthy();
    expect(screen.queryByText("History unavailable")).toBeNull();
  });

  it("keeps the history in its error state when the retry fails too", async () => {
    let historyCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("token-recovery/adjustments")) { historyCalls += 1; return reply({ error: "History unavailable" }, false, 500); }
      return reply({});
    }));
    render(<GoalAdminTokenRecovery />);
    expect(await screen.findByText("History unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(historyCalls).toBe(2));
    expect(await screen.findByText("History unavailable")).toBeTruthy();
    expect(screen.queryByText("No recovery grants have been recorded.")).toBeNull();
  });

  it("shows no empty history while the history is still loading", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => { await gate; return reply({ adjustments: [] }); }));
    const { container } = render(<GoalAdminTokenRecovery />);
    expect(screen.queryByText("No recovery grants have been recorded.")).toBeNull();
    assertGoalPage(container, RECOVERY_PAGE);
    release();
    expect(await screen.findByText("No recovery grants have been recorded.")).toBeTruthy();
  });
});

describe("the new catalog details source stays on goal tokens", () => {
  it("has no inline colour literal or inline style", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/goal/admin-money/GoalCatalogPlanDetails.tsx"), "utf8");
    expect(/#[\da-fA-F]{3,8}\b/.test(source)).toBe(false);
    expect(/style=\{\{/.test(source)).toBe(false);
  });
});
