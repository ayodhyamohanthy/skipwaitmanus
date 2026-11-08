// @vitest-environment jsdom
// D-048-p3-admin-money: the goal pages keep the money truthful. These pins bind
// the *behaviour*, not the new exports: loading/empty/error states, the confirm
// step before a refund or a grant, and the exact server call of every action
// (packet §4.1, §5). Mutating any of those calls must turn a test red.
// Design-review repairs (Instinct pass, 2026-11-05): one state wins between
// error and empty; the review queue renders the goal row, never the kit's
// coloured pills; catalog counts and the money wording read in plain words.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentReviewRequestBody } from "@shared/paymentReview";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminPayments, { GOAL_PAGE as PAYMENTS_PAGE } from "./GoalAdminPayments";
import GoalAdminCatalogSync, { GOAL_PAGE as CATALOG_PAGE } from "./GoalAdminCatalogSync";
import GoalAdminTokenRecovery, { GOAL_PAGE as RECOVERY_PAGE } from "./GoalAdminTokenRecovery";

const { auth, calls } = vi.hoisted(() => ({
  auth: { signedIn: true },
  calls: [] as { url: string; init?: RequestInit }[],
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: auth.signedIn, getToken: async () => "test-token", openSignIn: () => {} }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// The goal pages render the goal review row (GoalPaymentReviewRow), so no mock
// stands in for it here: these tests click the row's real decision buttons.

const reply = (payload: unknown, ok = true, status = 200) => ({ ok, status, url: "", json: async () => payload });
const HASH = "a".repeat(64);
const DRY_RUN = {
  version: 1, site: "skipwait-test", environment: "test", checkedAt: "2026-11-04T00:00:00.000Z", planHash: HASH,
  family: { id: null, action: "reuse", reason: "Family present" },
  toCreate: [], correct: [], mismatched: [], blocked: [], extras: [], excluded: [],
  counts: { desired: 0, correct: 0, mismatched: 0, blocked: 0, toCreate: 0, itemPricesToCreate: 2, extras: 0, excluded: 0 },
};
const EMPTY_PAYMENTS = { payments: [] };
const PAYMENT = { id: 7, provider: "chargebee", providerHostedPageId: "hosted-7", checkoutIntentId: null, userId: 3, role: "job_seeker", tokenCount: 3, amount: 499, currency: "INR", reconciliationReason: "Held", createdAt: "2026-11-04T00:00:00.000Z", userEmail: null, reviewKind: "awaiting_credit" };

beforeEach(() => {
  auth.signedIn = true;
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("/catalog-sync/apply")) return reply({ outcome: "applied", site: "skipwait-test", environment: "test", planHash: HASH, created: [], failed: null, notAttempted: [], stoppedReason: null });
    if (url.includes("/catalog-sync")) return reply(DRY_RUN);
    if (url.includes("token-recovery/grants")) return reply({ grant: { tokenCount: 2, newBalance: 5 } });
    if (url.includes("token-recovery/users")) return reply({ users: [{ id: 9, name: "Test Account", email: null }] });
    if (url.includes("token-recovery/adjustments")) return reply({ adjustments: [] });
    if (url.includes("revoke-credits")) return reply({});
    if (url.includes("/payments/review") && init?.method === "POST") return reply({ payment: null });
    return reply(EMPTY_PAYMENTS);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal /admin/payments", () => {
  it("shows an empty queue and an empty recent list when there is nothing to review", async () => {
    const { container } = render(<GoalAdminPayments />);
    expect(await screen.findByText("Nothing needs review right now.")).toBeTruthy();
    expect(screen.getByText("No completed payments yet.")).toBeTruthy();
    assertGoalPage(container, PAYMENTS_PAGE);
  });

  it("shows the error state with a retry when the queue cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ error: "Queue unavailable" }, false, 503)));
    const { container } = render(<GoalAdminPayments />);
    expect(await screen.findByText("Queue unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    // One state wins: while the payments are not answering, neither empty state renders.
    expect(screen.queryByText("Nothing needs review right now.")).toBeNull();
    expect(screen.queryByText("No completed payments yet.")).toBeNull();
    assertGoalPage(container, PAYMENTS_PAGE);
  });

  it("shows no empty state while the payments are still loading", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => { await gate; return reply(EMPTY_PAYMENTS); }));
    const { container } = render(<GoalAdminPayments />);
    expect(screen.queryByText("Nothing needs review right now.")).toBeNull();
    expect(screen.queryByText("No completed payments yet.")).toBeNull();
    assertGoalPage(container, PAYMENTS_PAGE);
    release();
    expect(await screen.findByText("Nothing needs review right now.")).toBeTruthy();
    expect(screen.getByText("No completed payments yet.")).toBeTruthy();
    assertGoalPage(container, PAYMENTS_PAGE);
  });

  it("keeps the goal contract on the signed-out screen", () => {
    auth.signedIn = false;
    const { container } = render(<GoalAdminPayments />);
    assertGoalPage(container, PAYMENTS_PAGE);
    // One goal button, never a button inside SignInButton's wrapper (capture 2026-11-08).
    expect(container.querySelectorAll("button button, a button, button a").length).toBe(0);
  });

  it("puts the oldest flagged payment first: the one next step reveals it", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return url.includes("scope=credited") ? reply({ payments: [] }) : reply({ payments: [PAYMENT] });
    }));
    render(<GoalAdminPayments />);
    fireEvent.click(await screen.findByRole("button", { name: "Review the oldest flagged payment" }));
    expect(document.activeElement?.getAttribute("id")).toBe(`payment-note-${PAYMENT.id}`);
  });

  it("sends one decision to the exact payment-review endpoint with the exact body", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") return reply({ payment: null });
      return url.includes("scope=credited") ? reply({ payments: [] }) : reply({ payments: [PAYMENT] });
    }));
    const { container } = render(<GoalAdminPayments />);
    fireEvent.click(await screen.findByRole("button", { name: "Add 3 credits" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/admin/payments/review/7" && call.init?.method === "POST" && call.init.body === JSON.stringify({ decision: "credited" }))).toBe(true));
    assertGoalPage(container, PAYMENTS_PAGE);
  });

  it("renders the queue row with goal controls, never the kit's coloured decision pills", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") return reply({ payment: null });
      return url.includes("scope=credited") ? reply({ payments: [] }) : reply({ payments: [PAYMENT] });
    }));
    const { container } = render(<GoalAdminPayments />);
    await screen.findByRole("button", { name: "Add 3 credits" });
    // No kit colour literals reach the rendered row, at any width.
    expect(/#(?:15803d|b91c1c|b45309)/.test(container.innerHTML)).toBe(false);
    assertGoalPage(container, PAYMENTS_PAGE);
  });

  it("requires a confirm step before keeping credits and closing, then calls the exact path", async () => {
    const keepPayment = { ...PAYMENT, reviewKind: "refunded_after_credit" };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") return reply({ payment: null });
      return url.includes("scope=credited") ? reply({ payments: [] }) : reply({ payments: [keepPayment] });
    }));
    render(<GoalAdminPayments />);
    fireEvent.click(await screen.findByRole("button", { name: "Keep credits and close" }));
    const dialog = screen.getByRole("dialog", { name: "Keep the credits and close?" });
    expect(dialog).toBeTruthy();
    // The open confirm step owns the one black commit; the page's next step steps back.
    expect(Array.from(document.querySelectorAll("[data-g-primary]")).map(node => node.textContent?.trim())).toEqual(["Confirm: keep credits and close"]);
    expect(dialog.contains(document.querySelector("[data-g-primary]"))).toBe(true);
    expect(calls.some(call => call.url === "/api/admin/payments/review/7" && call.init?.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm: keep credits and close" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/admin/payments/review/7" && call.init?.method === "POST" && call.init.body === JSON.stringify({ decision: "keep_credits" }))).toBe(true));
  });

  it("requires a confirm step before revoking credits, then calls the exact revoke path", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("revoke-credits")) return reply({});
      return url.includes("scope=credited") ? reply({ payments: [PAYMENT] }) : reply(EMPTY_PAYMENTS);
    }));
    render(<GoalAdminPayments />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke credits" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm credit revocation" });
    expect(dialog).toBeTruthy();
    expect(Array.from(document.querySelectorAll("[data-g-primary]")).map(node => node.textContent?.trim())).toEqual(["Confirm credit revocation"]);
    expect(dialog.contains(document.querySelector("[data-g-primary]"))).toBe(true);
    expect(calls.some(call => call.url.includes("revoke-credits"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm credit revocation" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/admin/payments/review/7/revoke-credits" && call.init?.method === "POST" && call.init.body === "{}")).toBe(true));
  });
});

// PR #986 review finding F1: a successful confirmed decision left its dialog
// open over the recorded result and offered a second POST once `working`
// settled. A confirmed money decision must close its dialog on every terminal
// answer, hand the page's one black commit back, and never post twice.
describe("goal /admin/payments row confirm lifecycle", () => {
  const REFUNDED = { ...PAYMENT, reviewKind: "refunded_after_credit" };
  const queueWith = (post: () => ReturnType<typeof reply>) => vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === "POST") return post();
    return url.includes("scope=credited") ? reply({ payments: [] }) : reply({ payments: [REFUNDED] });
  });
  const posts = () => calls.filter(call => call.init?.method === "POST");
  const pagePrimary = () => Array.from(document.querySelectorAll("[data-g-primary]")).map(node => node.textContent?.trim());

  it("closes the keep-and-close dialog on success, restores the page next step, and never posts twice", async () => {
    vi.stubGlobal("fetch", queueWith(() => reply({ payment: null })));
    render(<GoalAdminPayments />);
    fireEvent.click(await screen.findByRole("button", { name: "Keep credits and close" }));
    expect(screen.getByRole("dialog", { name: "Keep the credits and close?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm: keep credits and close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Saved. Reload this page to see the result.")).toBeTruthy();
    expect(screen.getByText("Recorded")).toBeTruthy();
    expect(pagePrimary()).toEqual(["Review the oldest flagged payment"]);
    expect(posts().map(call => call.init?.body)).toEqual([JSON.stringify({ decision: "keep_credits" })]);
  });

  it("closes the take-back dialog on success with exactly one revoke_unused POST", async () => {
    vi.stubGlobal("fetch", queueWith(() => reply({ payment: null })));
    render(<GoalAdminPayments />);
    fireEvent.click(await screen.findByRole("button", { name: "Take back unused credits" }));
    expect(screen.getByRole("dialog", { name: "Take back unused credits?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Take back credits" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Saved. Reload this page to see the result.")).toBeTruthy();
    expect(pagePrimary()).toEqual(["Review the oldest flagged payment"]);
    expect(posts().map(call => call.init?.body)).toEqual([JSON.stringify({ decision: "revoke_unused", credits: 3 })]);
  });

  it("keeps another row's open dialog holding the black commit when a direct decision succeeds", async () => {
    const AWAITING = { ...PAYMENT, id: 8 };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") return reply({ payment: null });
      return url.includes("scope=credited") ? reply({ payments: [] }) : reply({ payments: [REFUNDED, AWAITING] });
    }));
    render(<GoalAdminPayments />);
    fireEvent.click(await screen.findByRole("button", { name: "Keep credits and close" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 3 credits" }));
    await waitFor(() => expect(posts().some(call => call.url === "/api/admin/payments/review/8")).toBe(true));
    expect(screen.getByRole("dialog", { name: "Keep the credits and close?" })).toBeTruthy();
    expect(pagePrimary()).toEqual(["Confirm: keep credits and close"]);
  });

  it("gives the black commit back when the row holding it leaves the queue", async () => {
    // The row is decided elsewhere (409 already resolved) and a reload drops it:
    // its open dialog must not keep the page's next step ghost forever.
    let answered = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") { answered = true; return reply({ error: "This payment was already resolved." }, false, 409); }
      if (url.includes("scope=credited")) return reply({ payments: [] });
      return reply({ payments: answered ? [] : [REFUNDED] });
    }));
    render(<GoalAdminPayments />);
    fireEvent.click(await screen.findByRole("button", { name: "Keep credits and close" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm: keep credits and close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Nothing needs review right now.")).toBeTruthy();
    expect(pagePrimary()).toEqual(["Reload the queue"]);
  });

  it("closes the dialog on failure, shows the truthful error, and lets the retry send exactly one more POST", async () => {
    vi.stubGlobal("fetch", queueWith(() => reply({ error: "Chargebee did not answer" }, false, 503)));
    render(<GoalAdminPayments />);
    fireEvent.click(await screen.findByRole("button", { name: "Keep credits and close" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm: keep credits and close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Chargebee did not answer")).toBeTruthy();
    expect(screen.getByText("The payment is unchanged and still in this queue.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry decision" }));
    await waitFor(() => expect(posts().length).toBe(2));
    expect(posts().map(call => call.init?.body)).toEqual([JSON.stringify({ decision: "keep_credits" }), JSON.stringify({ decision: "keep_credits" })]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("goal /admin/catalog-sync", () => {
  it("reads the dry run and shows its site and plan", async () => {
    const { container } = render(<GoalAdminCatalogSync />);
    expect(await screen.findByRole("heading", { name: "skipwait-test" })).toBeTruthy();
    expect(screen.getByText(new RegExp(HASH.slice(0, 12)))).toBeTruthy();
    assertGoalPage(container, CATALOG_PAGE);
  });

  it("reads the dry-run counts and the check time in plain words, not raw values", async () => {
    render(<GoalAdminCatalogSync />);
    await screen.findByRole("heading", { name: "skipwait-test" });
    expect(screen.getByText("Item prices to create")).toBeTruthy();
    expect(screen.queryByText("itemPricesToCreate")).toBeNull();
    expect(screen.queryByText(/checked 2026-11-04T00:00:00/)).toBeNull();
  });

  it("shows the error state when the catalog cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ error: "Catalog unavailable" }, false, 503)));
    const { container } = render(<GoalAdminCatalogSync />);
    expect(await screen.findByText("Catalog unavailable")).toBeTruthy();
    assertGoalPage(container, CATALOG_PAGE);
  });

  it("keeps the goal contract while the dry run is still loading", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => { await gate; return reply(DRY_RUN); }));
    const { container } = render(<GoalAdminCatalogSync />);
    assertGoalPage(container, CATALOG_PAGE);
    release();
    expect(await screen.findByRole("heading", { name: "skipwait-test" })).toBeTruthy();
    assertGoalPage(container, CATALOG_PAGE);
  });

  it("keeps the goal contract on the signed-out screen", () => {
    auth.signedIn = false;
    const { container } = render(<GoalAdminCatalogSync />);
    assertGoalPage(container, CATALOG_PAGE);
    expect(container.querySelectorAll("button button, a button, button a").length).toBe(0);
  });

  it("applies only after the site is typed, with the exact plan hash and confirm site", async () => {
    render(<GoalAdminCatalogSync />);
    await screen.findByRole("heading", { name: "skipwait-test" });
    const apply = screen.getByRole("button", { name: "Apply the catalog plan" });
    expect(apply.getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: "Type the site to confirm" }), { target: { value: "skipwait-test" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply the catalog plan" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/admin/billing/catalog-sync/apply" && call.init?.body === JSON.stringify({ planHash: HASH, confirmSite: "skipwait-test" }))).toBe(true));
  });
});

describe("goal /admin/token-recovery", () => {
  it("shows the audit-history empty state", async () => {
    const { container } = render(<GoalAdminTokenRecovery />);
    expect(await screen.findByText("No recovery grants have been recorded.")).toBeTruthy();
    assertGoalPage(container, RECOVERY_PAGE);
  });

  it("keeps the goal contract when the audit history cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ error: "History unavailable" }, false, 503)));
    const { container } = render(<GoalAdminTokenRecovery />);
    expect(await screen.findByText("History unavailable")).toBeTruthy();
    assertGoalPage(container, RECOVERY_PAGE);
  });

  it("keeps the goal contract on the signed-out screen", () => {
    auth.signedIn = false;
    const { container } = render(<GoalAdminTokenRecovery />);
    assertGoalPage(container, RECOVERY_PAGE);
    expect(container.querySelectorAll("button button, a button, button a").length).toBe(0);
  });

  it("speaks of credits, not tokens, in the admin's own words", async () => {
    render(<GoalAdminTokenRecovery />);
    expect(await screen.findByText("No recovery grants have been recorded.")).toBeTruthy();
    expect(screen.getByText("Credits to add")).toBeTruthy();
    expect(screen.queryByText("Tokens to add")).toBeNull();
  });

  it("refuses a grant until the account, reference, reason and confirmation are present", async () => {
    render(<GoalAdminTokenRecovery />);
    await screen.findByText("No recovery grants have been recorded.");
    fireEvent.click(screen.getByRole("button", { name: "Record the recovery grant" }));
    expect(calls.some(call => call.url.includes("token-recovery/grants"))).toBe(false);
  });

  it("records a reasoned grant with confirmed:true and the exact body", async () => {
    render(<GoalAdminTokenRecovery />);
    await screen.findByText("No recovery grants have been recorded.");
    fireEvent.change(screen.getByRole("textbox", { name: "Find a user by name or email" }), { target: { value: "Test Account" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    fireEvent.click(await screen.findByRole("button", { name: /Test Account/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Payment or support reference" }), { target: { value: "CB-HP-123" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Duplicate charge" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Record the recovery grant" }));
    await waitFor(() => expect(calls.some(call => {
      if (!call.url.includes("token-recovery/grants")) return false;
      const body = JSON.parse(String(call.init?.body)) as Record<string, unknown>;
      return body.confirmed === true && body.recipientUserId === 9 && body.caseReference === "CB-HP-123" && body.reason === "Duplicate charge";
    })).toBe(true));
  });

  it("never renders inline colour literals in the goal money-ops sources", async () => {
    const files = ["GoalAdminPayments.tsx", "GoalAdminCatalogSync.tsx", "GoalAdminTokenRecovery.tsx", "AdminMoneyGoalFrame.tsx", "adminMoneyCopy.ts", "GoalPaymentReviewRow.tsx"];
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), "client/src/pages/goal/admin-money", file), "utf8");
      expect(/#[\da-fA-F]{3,8}\b/.test(source), `${file} has an inline hex literal`).toBe(false);
      expect(/style=\{\{/.test(source), `${file} has inline styling`).toBe(false);
    }
  });
});
