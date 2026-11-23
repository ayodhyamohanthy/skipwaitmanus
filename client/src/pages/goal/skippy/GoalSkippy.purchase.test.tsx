// @vitest-environment jsdom
// SKIPPY-3: the money card in the chat. These pins bind the behaviour the packet
// names: the card shows the server's exact total, the client sends only the card
// id on approve, the hosted page opens, and a cancelled return says nothing was charged.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GoalSkippy from "./GoalSkippy";

const { auth, calls, opened } = vi.hoisted(() => ({
  auth: { signedIn: true },
  calls: [] as { url: string; init?: RequestInit }[],
  opened: [] as string[],
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: auth.signedIn, getToken: async () => "test-token", openSignIn: () => {} }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/chargebeeCheckout", () => ({
  openChargebeeCheckout: (url: string) => { opened.push(url); },
}));

const reply = (payload: unknown, ok = true, status = 200) => ({ ok, status, url: "", json: async () => payload });

const QUOTE_SESSION = {
  step: "quote",
  targetRoleUrl: "https://acme.com/jobs/1",
  attachmentId: 11,
  note: "I built Node.js services at Acme and would like a referral for this role.",
  quote: { level: 5, cost: 1, totalAvailable: 0, shortfall: 1 },
};

const CARD = {
  id: "card-1",
  level: 5,
  levelName: "Senior",
  quantity: 1,
  currency: "INR",
  unitAmount: 39900,
  subtotal: 39900,
  discountPct: 0,
  discount: 0,
  total: 39900,
  expiresAt: "2026-11-24T00:10:00.000Z",
};

beforeEach(() => {
  auth.signedIn = true;
  calls.length = 0;
  opened.length = 0;
  window.history.replaceState({}, "", "/skippy");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === "/api/skippie/state") return reply({ session: QUOTE_SESSION, resumes: [], dailyCap: 20 });
    if (url === "/api/skippie/turn") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { kind?: string; outcome?: string };
      if (body.kind === "buy_referrals") return reply({ replies: ["1 Senior referral for ₹399. Payment happens on Chargebee's secure page.", "Refunds follow the refund policy: skipwait.me/refunds"], session: { ...QUOTE_SESSION, moneyCard: CARD } });
      if (body.kind === "confirm_referrals" && body.outcome === "cancelled") return reply({ replies: ["Payment didn't go through. Nothing was charged."], session: QUOTE_SESSION });
      return reply({ replies: ["ok"], session: QUOTE_SESSION });
    }
    if (url === "/api/skippie/cards/card-1/approve") return reply({ checkoutUrl: "https://acme-test.chargebee.com/hosted/1", hostedPageId: "hp-1" });
    return reply({ error: "unexpected" }, false, 500);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Skippy money card in the chat", () => {
  it("offers to buy the shortfall, then shows the server's exact total", async () => {
    render(<GoalSkippy />);
    const buy = await screen.findByRole("button", { name: /Buy 1 referral here/i });
    fireEvent.click(buy);
    await waitFor(() => expect(calls.some(call => call.url === "/api/skippie/turn" && String(call.init?.body).includes("buy_referrals"))).toBe(true));
    expect((await screen.findAllByText(/1 Senior referral for ₹399/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/refund policy/i).length).toBeGreaterThan(0);
  });

  it("sends only the card id on approve and opens the hosted page", async () => {
    render(<GoalSkippy />);
    fireEvent.click(await screen.findByRole("button", { name: /Buy 1 referral here/i }));
    const approve = await screen.findByRole("button", { name: /Approve and pay ₹399/i });
    fireEvent.click(approve);
    await waitFor(() => expect(opened).toEqual(["https://acme-test.chargebee.com/hosted/1"]));
    const call = calls.find(entry => entry.url === "/api/skippie/cards/card-1/approve");
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call?.init?.body ?? "{}"))).toEqual({});
  });

  it("says nothing was charged when the payment is cancelled", async () => {
    window.history.replaceState({}, "", "/skippy?payment=cancelled");
    render(<GoalSkippy />);
    expect(await screen.findByText("Payment didn't go through. Nothing was charged.")).toBeTruthy();
    const call = calls.find(entry => entry.url === "/api/skippie/turn");
    expect(String(call?.init?.body)).toContain('"outcome":"cancelled"');
  });
});
