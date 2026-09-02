// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminPaymentsReview from "./AdminPaymentsReview";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("admin-token") }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

const queuePayment = { id: 1, provider: "chargebee", providerHostedPageId: "hp_1", checkoutIntentId: "intent_1", userId: 7, role: "job_seeker", tokenCount: 4, amount: 39600, currency: "INR", reconciliationReason: "provider_page_mismatch", createdAt: "2026-09-01T00:00:00.000Z", userEmail: "avery@example.com" };
const creditedPayment = { id: 2, provider: "chargebee", providerHostedPageId: "hp_2", checkoutIntentId: "intent_2", userId: 8, role: "job_seeker", tokenCount: 4, amount: 39600, currency: "INR", reconciliationReason: null, createdAt: "2026-08-30T00:00:00.000Z", userEmail: "blake@example.com", status: "credited" };

describe("administrator payment review refunds", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("scope=credited")) return { ok: true, json: async () => ({ payments: [creditedPayment] }) };
      if (init?.method === "POST") return { ok: true, json: async () => ({ refunded: true, paymentId: 2 }) };
      return { ok: true, json: async () => ({ payments: [queuePayment] }) };
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("shows a Refund action only on credited rows, opens a confirm dialog, and calls the refund route", async () => {
    render(<AdminPaymentsReview />);
    await waitFor(() => expect(screen.getByText("Recently completed payments")).toBeTruthy());
    const refundButton = screen.getByRole("button", { name: /^Refund$/ });
    fireEvent.click(refundButton);
    expect(screen.getByText(/Refund INR 396 to the user's credit balance\?/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Confirm refund/i }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url) === "/api/admin/payments/review/2/refund" && (init as RequestInit)?.method === "POST")).toBe(true));
    await waitFor(() => expect(screen.getByText("Refunded")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /^Refund$/ })).toBeNull();
  });
});