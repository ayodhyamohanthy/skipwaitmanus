// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminPaymentsReview from "./AdminPaymentsReview";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("admin-token") }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

const queuePayment = { id: 1, provider: "chargebee", providerHostedPageId: "hp_1", checkoutIntentId: "intent_1", userId: 7, role: "job_seeker", tokenCount: 4, amount: 39600, currency: "INR", reconciliationReason: "provider_page_mismatch", createdAt: "2026-09-01T00:00:00.000Z", userEmail: "avery@example.com" };
const creditedPayment = { id: 2, provider: "chargebee", providerHostedPageId: "hp_2", checkoutIntentId: "intent_2", userId: 8, role: "job_seeker", tokenCount: 4, amount: 39600, currency: "INR", reconciliationReason: null, createdAt: "2026-08-30T00:00:00.000Z", userEmail: "blake@example.com", status: "credited" };

describe("administrator payment credit revocation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("scope=credited")) return { ok: true, json: async () => ({ payments: [creditedPayment] }) };
      if (init?.method === "POST") return { ok: true, json: async () => ({ refunded: true, paymentId: 2 }) };
      return { ok: true, json: async () => ({ payments: [queuePayment] }) };
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("shows a ledger-only action on credited rows, explains it is not a provider refund, and calls the revocation route", async () => {
    render(<AdminPaymentsReview />);
    await waitFor(() => expect(screen.getByText("Recently completed payments")).toBeTruthy());
    const refundButton = screen.getByRole("button", { name: /^Revoke credits$/ });
    fireEvent.click(refundButton);
    expect(screen.getByText(/This does not refund provider money/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Confirm credit revocation/i }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url) === "/api/admin/payments/review/2/revoke-credits" && (init as RequestInit)?.method === "POST")).toBe(true));
    await waitFor(() => expect(screen.getByText("Credited payment rows.")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /^Revoke credits$/ })).toBeNull();
  });
});

// P0-refund-review-double-credit: each parked payment offers only the decisions its
// reason allows. A pack refunded after its credits were added can never be credited
// again; its unused credits can be taken back, and the outcome is told in plain words.
describe("administrator payment review decisions", () => {
  const parked = (id: number, reason: string | null, reviewKind: string | undefined, patch: Record<string, unknown> = {}) => ({ id, provider: "chargebee", providerHostedPageId: `hp_${id}`, checkoutIntentId: `intent_${id}`, userId: 7, role: "job_seeker", tokenCount: 4, amount: 39600, currency: "INR", reconciliationReason: reason, creditedAt: reviewKind === "refunded_after_credit" ? "2026-09-01T00:00:00.000Z" : null, createdAt: "2026-09-01T00:00:00.000Z", userEmail: `user${id}@example.com`, reviewKind, ...patch });
  const awaiting = parked(1, "checkout_amount_mismatch", "awaiting_credit");
  const spent = parked(3, "refund_credits_spent", "refunded_after_credit");
  const partial = parked(4, "refund_partial", "refunded_after_credit");
  const refundedEarly = parked(5, "refund_of_uncredited_payment", "refunded_before_credit");
  const unknown = parked(6, "checkout_amount_mismatch", undefined);
  const partlyRefundedEarly = parked(7, "refund_not_full_before_credit", "awaiting_credit");
  const refundedAgain = parked(8, "refund_repeated", "refunded_after_credit");
  let queue: unknown[] = [];
  let post: (body: Record<string, unknown>) => { status: number; body: unknown };
  const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  beforeEach(() => {
    queue = [awaiting, spent, partial, refundedEarly, unknown];
    post = body => ({ status: 200, body: { payment: { paymentId: 3, tokenCount: 4, userId: 7, role: "job_seeker", decision: body.decision } } });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("scope=credited")) return json(200, { payments: [] });
      if (init?.method === "POST") { const reply = post(JSON.parse(String(init.body))); return json(reply.status, reply.body); }
      return json(200, { payments: queue });
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  const row = async (id: number) => { const heading = await screen.findByText(`Ref-PMT-${1000 + id}`); const item = heading.closest("li"); if (!item) throw new Error("payment row not rendered"); return within(item); };
  const posts = () => vi.mocked(fetch).mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST").map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) }));
  const queueLoads = () => vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url) === "/api/admin/payments/review" && !(init as RequestInit | undefined)?.method).length;

  it("shows the right buttons per parked reason", async () => {
    render(<AdminPaymentsReview />);
    const credit = await row(1);
    expect(credit.getByRole("button", { name: "Add 4 credits" })).toBeTruthy();
    expect(credit.getByRole("button", { name: /^Reject/ })).toBeTruthy();
    expect(credit.queryByRole("button", { name: /Take back/ })).toBeNull();
    const refunded = await row(3);
    expect(refunded.queryByRole("button", { name: /^Add/ })).toBeNull();
    expect(refunded.queryByRole("button", { name: /^Reject/ })).toBeNull();
    expect(refunded.getByRole("button", { name: "Take back unused credits" })).toBeTruthy();
    expect(refunded.getByRole("button", { name: "Keep credits and close" })).toBeTruthy();
    expect(refunded.getByText("This payment was refunded in Chargebee after some of its credits were used.")).toBeTruthy();
    expect(refunded.queryByText(/refund_credits_spent/)).toBeNull();
    const early = await row(5);
    expect(early.getAllByRole("button").map(button => button.textContent)).toEqual(["Close, nothing to add"]);
    const odd = await row(6);
    expect(odd.queryByRole("button", { name: /^Add|Take back|Keep|^Reject|Close/ })).toBeNull();
    expect(odd.getByRole("button", { name: "Reload this page" })).toBeTruthy();
    expect(screen.queryByText(/Mark a payment credited to grant its tokens/)).toBeNull();
  });

  it("a payment refunded only in part before its credit can still be credited once, and says why in plain words", async () => {
    queue = [partlyRefundedEarly, refundedEarly];
    render(<AdminPaymentsReview />);
    const partly = await row(7);
    expect(partly.getAllByRole("button").map(button => button.textContent)).toEqual(["Add 4 credits", "Reject, add nothing"]);
    expect(partly.getByText("Chargebee recorded a refund before any credits were added, but it did not cover the whole payment. Check the refunds in Chargebee, and add the credits only if the buyer still paid for the pack.")).toBeTruthy();
    expect(partly.queryByText(/refund_not_full_before_credit/)).toBeNull();
    expect((await row(5)).getByText("This payment was refunded in full in Chargebee before any credits were added.")).toBeTruthy();
  });

  it("take back posts revoke_unused and shows the outcome in plain words", async () => {
    post = () => ({ status: 200, body: { payment: { paymentId: 3, tokenCount: 4, userId: 7, role: "job_seeker", decision: "revoke_unused", requested: 4, revoked: 1, unrecovered: 3, balanceBefore: 1, balanceAfter: 0 } } });
    render(<AdminPaymentsReview />);
    fireEvent.click((await row(3)).getByRole("button", { name: "Take back unused credits" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Chargebee already returned this payment's money/)).toBeTruthy();
    expect(within(dialog).getByText(/Nothing goes below zero/)).toBeTruthy();
    expect((within(dialog).getByLabelText(/Credits to take back/) as HTMLInputElement).value).toBe("4");
    fireEvent.click(within(dialog).getByRole("button", { name: "Take back credits" }));
    await waitFor(() => expect(posts()).toEqual([{ url: "/api/admin/payments/review/3", body: { decision: "revoke_unused", credits: 4 } }]));
    expect(await (await row(3)).findByText("Took back 1 of 4 credits. 3 had already been used and cannot be taken back.")).toBeTruthy();
    expect((await row(3)).queryByRole("button", { name: "Take back unused credits" })).toBeNull();
  });

  it("asks for the credit count on a partial refund before it can take anything back", async () => {
    render(<AdminPaymentsReview />);
    fireEvent.click((await row(4)).getByRole("button", { name: "Take back unused credits" }));
    const dialog = await screen.findByRole("alertdialog");
    const field = within(dialog).getByLabelText(/Credits to take back/) as HTMLInputElement;
    const confirm = within(dialog).getByRole("button", { name: "Take back credits" }) as HTMLButtonElement;
    expect(field.value).toBe("");
    expect(confirm.disabled).toBe(true);
    for (const value of ["0", "5", "1.5"]) { fireEvent.change(field, { target: { value } }); expect(confirm.disabled, value).toBe(true); }
    fireEvent.change(field, { target: { value: "2" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(posts()).toEqual([{ url: "/api/admin/payments/review/4", body: { decision: "revoke_unused", credits: 2 } }]));
  });

  it("another refund after the review asks for the credit count and explains that earlier take-backs count", async () => {
    queue = [refundedAgain];
    render(<AdminPaymentsReview />);
    const again = await row(8);
    expect(again.getByText("Chargebee recorded another refund for this payment after its credits were added and an earlier refund was handled. Check the total refunded in Chargebee before you take back more credits.")).toBeTruthy();
    expect(again.queryByRole("button", { name: /^Add/ })).toBeNull();
    fireEvent.click(again.getByRole("button", { name: "Take back unused credits" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/More than one refund was recorded for this payment/)).toBeTruthy();
    expect(within(dialog).getByText(/Credits already taken back for this payment count toward its pack/)).toBeTruthy();
    const field = within(dialog).getByLabelText(/Credits to take back/) as HTMLInputElement;
    const confirm = within(dialog).getByRole("button", { name: "Take back credits" }) as HTMLButtonElement;
    expect(field.value).toBe("");
    expect(confirm.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "1" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(posts()).toEqual([{ url: "/api/admin/payments/review/8", body: { decision: "revoke_unused", credits: 1 } }]));
  });

  it("shows what Chargebee refunded for a held payment, and nothing it cannot read", async () => {
    queue = [
      { ...partial, refunds: { count: 1, latestAmount: 5400, latestCurrency: "INR" } },
      { ...refundedAgain, refunds: { count: 2, latestAmount: 30000, latestCurrency: "INR" } },
      { ...spent, refunds: { count: 1, latestAmount: null, latestCurrency: null } },
      { ...awaiting, refunds: { count: "two" } },
    ];
    render(<AdminPaymentsReview />);
    expect((await row(4)).getByText("Refund recorded in Chargebee: INR 54.")).toBeTruthy();
    expect((await row(8)).getByText("2 refunds recorded in Chargebee. The latest was INR 300.")).toBeTruthy();
    expect((await row(3)).getByText("Refund recorded in Chargebee. Its amount could not be read.")).toBeTruthy();
    expect((await row(1)).queryByText(/recorded in Chargebee/)).toBeNull();
  });

  it("keeps the credits only after a confirmation", async () => {
    render(<AdminPaymentsReview />);
    fireEvent.click((await row(3)).getByRole("button", { name: "Keep credits and close" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(posts()).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep credits and close" }));
    await waitFor(() => expect(posts()).toEqual([{ url: "/api/admin/payments/review/3", body: { decision: "keep_credits" } }]));
    expect(await (await row(3)).findByText("Closed. Nothing was taken back from the wallet.")).toBeTruthy();
  });

  it("a refusal keeps the row and shows the server's words", async () => {
    const refusal = "This payment's credits were already added once, so they cannot be added again. Nothing was changed.";
    post = () => ({ status: 409, body: { error: refusal } });
    render(<AdminPaymentsReview />);
    fireEvent.click((await row(1)).getByRole("button", { name: "Add 4 credits" }));
    expect(await (await row(1)).findByRole("alert")).toBeTruthy();
    expect((await row(1)).getByRole("alert").textContent).toContain(refusal);
    expect((await row(1)).queryByText("Credited")).toBeNull();
    expect(posts()).toEqual([{ url: "/api/admin/payments/review/1", body: { decision: "credited" } }]);
  });

  it("an already resolved payment reloads the queue instead of reporting a failed save", async () => {
    post = () => ({ status: 409, body: { error: "This payment was already resolved" } });
    render(<AdminPaymentsReview />);
    await row(1);
    expect(queueLoads()).toBe(1);
    queue = [spent];
    fireEvent.click((await row(1)).getByRole("button", { name: "Add 4 credits" }));
    await waitFor(() => expect(queueLoads()).toBe(2));
    await waitFor(() => expect(screen.queryByText("Ref-PMT-1001")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});