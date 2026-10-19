// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminCatalogSync from "./AdminCatalogSync";

const auth = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: auth.signedIn, getToken: async () => "admin-token" }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

const HASH = "a".repeat(64);
const packSpec = { id: "skipwait_pack_2-INR", name: "skipwait_pack_2-INR", itemId: "skipwait_pack_2", itemType: "charge", pricingModel: "per_unit", price: 9900, currencyCode: "INR", externalName: "2 credits", period: null, periodUnit: null, billingCycles: null };

const dryRun = () => ({
  version: 1,
  site: "skipwait",
  environment: "live",
  checkedAt: "2026-10-19T10:00:00.000Z",
  planHash: HASH,
  family: { id: "skipwait", action: "create", reason: "No SkipWait product family exists yet, so one is created." },
  toCreate: [
    { kind: "item_family", params: { id: "skipwait", name: "SkipWait" } },
    { kind: "item_price", params: packSpec },
  ],
  correct: [{ itemPriceId: "skipwait_pack_5-USD", currencyCode: "USD", price: 500, term: "one_time" }],
  mismatched: [{
    itemPriceId: "skipwait_pack_25-INR",
    currencyCode: "INR",
    price: 119900,
    term: "one_time",
    diffs: [{ field: "price", expected: 119900, actual: 119000 }],
    sellableNow: false,
  }],
  blocked: [{ itemPriceId: "skipwait_start_30d-INR", currencyCode: "INR", price: 29900, term: "30d", reason: "SkipWait item skipwait_start is archived in Chargebee; restore it before syncing." }],
  extras: [{ kind: "item_price", id: "skipwait_token_1-INR", status: "active", note: "Legacy SkipWait item price (D-036/D-067); left alone." }],
  excluded: [{ itemPriceId: "skipwait_land_concierge_30d-INR", reason: "Land Concierge is sold by application, never from self-serve checkout." }],
  counts: { desired: 26, correct: 1, mismatched: 1, blocked: 1, toCreate: 2, itemPricesToCreate: 1, extras: 1, excluded: 1 },
});

const report = () => ({
  outcome: "partial",
  site: "skipwait",
  environment: "live",
  planHash: HASH,
  created: [{ kind: "item", id: "skipwait_pack_2", diffs: [] }],
  failed: { kind: "item_price", id: "skipwait_pack_2-INR", httpStatus: 400, apiErrorCode: "invalid_request", errorCode: "param_wrong_value", message: "Billing frequency is not configured" },
  notAttempted: [{ kind: "item_price", id: "skipwait_pack_5-USD" }],
  stoppedReason: "provider_error",
});

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("admin catalog sync page", () => {
  beforeEach(() => { auth.signedIn = true; });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("asks a signed-out visitor to sign in and reads nothing", () => {
    auth.signedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminCatalogSync />);
    expect(screen.getByText("Chargebee catalog sync")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Secure sign in" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the environment, the site and every list from the dry run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, dryRun())));
    render(<AdminCatalogSync />);

    await waitFor(() => expect(screen.getByTestId("catalog-environment")).toBeTruthy());
    expect(screen.getByTestId("catalog-environment").textContent).toBe("LIVE");
    expect(screen.getByTestId("catalog-site").textContent).toBe("Site skipwait");
    expect(screen.getByText("To create (2)")).toBeTruthy();
    expect(screen.getByText("Mismatched — fix these in Chargebee (1)")).toBeTruthy();
    expect(screen.getByText(/Does not sell/)).toBeTruthy();
    expect(screen.getByText(/price: expected 119900 → Chargebee has 119000/)).toBeTruthy();
    expect(screen.getByText(/archived in Chargebee/)).toBeTruthy();
    expect(screen.getByText(/Legacy SkipWait item price/)).toBeTruthy();
    expect(screen.getByText(/sold by application/)).toBeTruthy();
  });

  it("keeps Apply disabled until the site name is typed exactly, then shows the report", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return json(200, report());
      return json(200, dryRun());
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminCatalogSync />);

    const button = await screen.findByTestId("catalog-apply");
    expect((button as HTMLButtonElement).disabled).toBe(true);

    const input = screen.getByTestId("catalog-confirm");
    fireEvent.change(input, { target: { value: "skipwait-test" } });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "skipwait" } });
    expect((button as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(button);
    const modal = await screen.findByTestId("catalog-report");
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ planHash: HASH, confirmSite: "skipwait" });
    expect(within(modal).getByText(/Stopped partway/)).toBeTruthy();
    expect(within(modal).getByText(/skipwait_pack_2-INR was refused/)).toBeTruthy();
    expect(within(modal).getByText(/Not attempted: skipwait_pack_5-USD/)).toBeTruthy();
    expect(within(modal).getByRole("button", { name: /Run the dry run again/ })).toBeTruthy();
  });

  it("says in plain words when the provider cannot be read, and retries", async () => {
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      reads += 1;
      if (reads === 1) return json(502, { error: "Chargebee could not be read. Nothing was changed.", code: "provider_unreadable" });
      return json(200, dryRun());
    }));
    render(<AdminCatalogSync />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Chargebee could not be read. Nothing was changed.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("catalog-environment")).toBeTruthy());
    expect(reads).toBe(2);
  });
});
