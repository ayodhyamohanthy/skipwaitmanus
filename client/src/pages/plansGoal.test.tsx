// @vitest-environment jsdom
// D-048-p3-plans (D-048-money.md): flag-off parity for the kit /billing page and
// the flag-on goal rebuild of the same route, from synthetic fixtures. Stubs
// mirror client/src/pages/billing.test.tsx so the two paths are tested against
// one contract. Money wording is referral-only (D-173, D-180): no rendered
// string may say "credit", "credits" or the noun "ask"/"asks".
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Billing from "./Billing";
import { assertGoalPage } from "@/test/goalPageContract";
import { GOAL_PAGE } from "./goal/plans/GoalBilling";

const { authState, surfaces } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() },
  surfaces: { on: new Set<string>() },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
}));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/billing", vi.fn()],
  useSearch: () => "",
}));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });
const slots = (plan: string, planLabel: string, cap: number) => ({ plan, planLabel, open: 1, cap, full: false, nextPlan: null });
const ledger = (creditsPerMonth: number, balance: number) => ({
  balance,
  buckets: { cycle: balance, carriedOver: 0, trial: 0, welcome: 0, purchased: 0, promo: 0 },
  creditsPerMonth,
  carryover: creditsPerMonth > 0 ? 1 : 0,
  cycle: { key: "2026-10", startsAt: null, endsAt: null, granted: creditsPerMonth, used: 0 },
  planCreditsRemaining: balance,
  nextExpiry: null,
  planCreditsExpiringSoon: null,
  welcome: { granted: false, credits: 0, remaining: 0 },
});
const freeSummary = { plan: "free", monthlyAllowance: 0, monthlyCreditsRemaining: 0, totalAvailable: 3, subscriptionStatus: null, subscriptionCurrentTermEnd: null, slots: slots("free", "Free", 3), ledger: ledger(0, 3) };
const startSummary = { plan: "start", monthlyAllowance: 10, monthlyCreditsRemaining: 7, totalAvailable: 9, subscriptionStatus: "active", subscriptionCurrentTermEnd: "2026-11-06T00:00:00.000Z", slots: slots("start", "Start", 8), ledger: ledger(10, 9) };
const outSummary = { ...freeSummary, totalAvailable: 0, ledger: ledger(0, 0) };
const settled = { id: 1, provider: "chargebee", amount: 499, currency: "USD", tokenCount: 3, status: "paid", providerInvoiceId: "INV-1001", createdAt: "2026-10-02T10:00:00.000Z" };
const refunded = { ...settled, id: 2, amount: 999, status: "refunded", providerInvoiceId: "INV-1002" };

const stubBilling = (options: { summary?: unknown; receipts?: unknown[]; summaryStatus?: number; summaryError?: string; receiptsStatus?: number; receiptsError?: string; cancel?: "ok" | "fail" } = {}) => {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    const path = String(url);
    if (path.includes("/billing/receipts")) {
      if (options.receiptsStatus) return fail(options.receiptsStatus, { error: options.receiptsError ?? "boom" });
      return ok({ receipts: options.receipts ?? [] });
    }
    if (path.includes("/credits/summary")) {
      if (options.summaryStatus) return fail(options.summaryStatus, { error: options.summaryError ?? "boom" });
      return ok({ summary: options.summary ?? freeSummary });
    }
    if (path.includes("/subscription-cancel")) {
      return options.cancel === "fail" ? fail(500, { error: "We could not schedule your cancellation" }) : ok({ currentTermEnd: "2026-11-06T00:00:00.000Z" });
    }
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const expectNoRetiredNouns = () => {
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/\bcredits?\b/i);
  expect(text).not.toMatch(/\basks?\b/i);
};

beforeEach(() => { authState.isSignedIn = true; authState.isLoaded = true; surfaces.on = new Set(["plans"]); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); authState.getToken.mockClear(); });

describe("Goal /billing flag gate", () => {
  it("renders the kit billing page untouched when the flag is off", async () => {
    surfaces.on = new Set();
    stubBilling();
    render(<Billing />);
    expect(await screen.findByRole("heading", { name: "Manage plan." })).toBeTruthy();
    expect(screen.queryByText(GOAL_PAGE.goalLine)).toBeNull();
  });
});

describe("Goal /billing page contract", () => {
  it("opens with the goal line, one next step and one black commit", async () => {
    stubBilling();
    const { container } = render(<Billing />);
    expect(await screen.findByText(GOAL_PAGE.goalLine)).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
  });

  it("states the balance and plan facts in referral-only words (D-173, D-180)", async () => {
    stubBilling();
    render(<Billing />);
    expect(await screen.findByText("Referral requests left")).toBeTruthy();
    expect(screen.getByText("Free plan")).toBeTruthy();
    expect(screen.getByText("No payments yet.")).toBeTruthy();
    expect(screen.getByText(/never sees or stores them/)).toBeTruthy();
    expectNoRetiredNouns();
    // The kit's invented-method ban carries over: no fabricated card rows.
    expect(screen.queryByText(/Visa|UPI|PayPal|4242|Make default|Add payment method/)).toBeNull();
  });

  it("never shows a failed load as a zero balance", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<Billing />);
    expect((await screen.findByRole("alert")).textContent).toContain("Check your connection");
    expect(screen.queryByText("Referral requests left")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("treats a malformed summary as a failed load, never as an empty account", async () => {
    stubBilling({ summary: { plan: "start" } });
    render(<Billing />);
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your plan");
    expect(screen.queryByText("Referral requests left")).toBeNull();
  });

  it("recovers from a failed load with the single retry commit", async () => {
    let online = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (!online) throw new TypeError("Failed to fetch");
      return String(url).includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary: freeSummary });
    }));
    render(<Billing />);
    expect((await screen.findByRole("alert")).textContent).toContain("Check your connection");
    online = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Referral requests left")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks a signed-out visitor to sign in as the only commit", async () => {
    authState.isSignedIn = false;
    render(<Billing />);
    expect(screen.getByText(GOAL_PAGE.goalLine)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(document.querySelectorAll("[data-g-primary]").length).toBe(1);
  });
});

describe("Goal /billing plan and cancel states", () => {
  it("shows an active plan's renewal date and keeps the cancel control", async () => {
    stubBilling({ summary: startSummary });
    render(<Billing />);
    expect(await screen.findByText(/Renews 6 Nov 2026/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel renewal" })).toBeTruthy();
  });

  it("confirms the cancellation on the server and only then reports the term end", async () => {
    const fetchMock = stubBilling({ summary: startSummary });
    render(<Billing />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel renewal" }));
    // Opening the confirmation makes its confirm action the page's single commit.
    expect(document.querySelectorAll("[data-g-primary]").length).toBe(1);
    expect(screen.getByText("Before you go")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel anyway" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/subscription-cancel"))).toBeTruthy());
    const call = fetchMock.mock.calls.find(entry => String(entry[0]).includes("/subscription-cancel"));
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({ role: "job_seeker" });
    expect(await screen.findByText("Renewal cancelled.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText(/Ends 6 Nov 2026/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel renewal" })).toBeNull();
  });

  it("keeps the plan renewing when the server refuses the cancellation", async () => {
    stubBilling({ summary: startSummary, cancel: "fail" });
    render(<Billing />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel renewal" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel anyway" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not schedule your cancellation");
    // A modal hides the page behind it (Radix aria-hidden), so close it to check the page state.
    fireEvent.click(screen.getByRole("button", { name: "Keep my plan" }));
    expect(await screen.findByText(/Renews 6 Nov 2026/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel renewal" })).toBeTruthy();
  });

  it("offers no renewal control on a plan that already ends", async () => {
    stubBilling({ summary: { ...startSummary, subscriptionStatus: "non_renewing" } });
    render(<Billing />);
    expect(await screen.findByText(/Ends 6 Nov 2026/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel renewal" })).toBeNull();
  });

  it("reads a stale retired plan as Free, never by its retired name", async () => {
    stubBilling({ summary: { ...startSummary, plan: "max", slots: null } });
    render(<Billing />);
    expect(await screen.findByText("Free plan")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel renewal" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bPro\b|\bMax\b/);
  });
});

describe("Goal /billing receipts", () => {
  it("lists settled payments with provider facts and a refund as dot + text", async () => {
    stubBilling({ receipts: [settled, refunded] });
    render(<Billing />);
    expect(await screen.findByText("INV-1001")).toBeTruthy();
    expect(screen.getAllByText("3 referral requests").length).toBe(2);
    expect(screen.getByText("$4.99")).toBeTruthy();
    expect(screen.getByText("$9.99")).toBeTruthy();
    expect(screen.getByText("Refunded")).toBeTruthy();
    expectNoRetiredNouns();
  });
});

describe("Goal /billing purchase affordance", () => {
  it("sends a seeker with no referral requests left to the packs on sale", async () => {
    stubBilling({ summary: outSummary });
    render(<Billing />);
    const primary = await screen.findByRole("link", { name: "Get more referral requests" });
    expect(primary.getAttribute("href")).toBe("/premium?role=job_seeker");
    expect(primary.hasAttribute("data-g-primary")).toBe(true);
  });
});

// Independent Tier 1 review findings on b535375d (Qoder · 54a1), pinned here
// first: an unloaded balance is not zero, a previous session's amounts are never
// current, and the §7 read/cancellation controls hold.
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const called = (fetchMock: ReturnType<typeof vi.fn>, fragment: string) =>
  fetchMock.mock.calls.filter(call => String(call[0]).includes(fragment)).length;

describe("Goal /billing: an unknown balance is never read as zero", () => {
  it("says it is checking while the summary is still loading", async () => {
    const pending = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    const fetchMock = vi.fn((url: string) => String(url).includes("/billing/receipts") ? Promise.resolve(ok({ receipts: [] })) : pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<Billing />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("goal-skeleton-rows")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/no referral requests left/i);
    // The single commit is the plan comparison, never a purchase, before the balance is known.
    expect(container.querySelector("[data-g-primary]")?.getAttribute("href")).toBe("/plans");
    expect(container.querySelector('a[href^="/premium"]')).toBeNull();
    pending.resolve(ok({ summary: freeSummary }));
    expect(await screen.findByText("Referral requests left")).toBeTruthy();
  });
});

describe("Goal /billing: a previous session's amounts are never shown as current", () => {
  it("drops the old balance and receipts when the next load fails", async () => {
    let failing = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (failing) throw new TypeError("Failed to fetch");
      return String(url).includes("/billing/receipts") ? ok({ receipts: [settled] }) : ok({ summary: startSummary });
    }));
    const { rerender } = render(<Billing />);
    expect(await screen.findByText("$4.99")).toBeTruthy();
    expect(screen.getByText("INV-1001")).toBeTruthy();
    // Sign out and back in on the same mounted page: a different session, same component.
    authState.isSignedIn = false;
    rerender(<Billing />);
    failing = true;
    authState.isSignedIn = true;
    rerender(<Billing />);
    expect((await screen.findByRole("alert")).textContent).toContain("Check your connection");
    expect(screen.queryByText("$4.99")).toBeNull();
    expect(screen.queryByText("INV-1001")).toBeNull();
    expect(screen.queryByText("Referral requests left")).toBeNull();
  });
});


describe("Goal /billing: the reads it makes", () => {
  it("makes no private request while signed out", async () => {
    authState.isSignedIn = false;
    const fetchMock = stubBilling();
    render(<Billing />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for the seeker role with credentials and the session token", async () => {
    const fetchMock = stubBilling();
    render(<Billing />);
    expect(await screen.findByText("Referral requests left")).toBeTruthy();
    const calls = fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init: init as RequestInit }));
    const summary = calls.find(call => call.url.includes("/credits/summary"));
    const receipts = calls.find(call => call.url.includes("/billing/receipts"));
    expect(summary?.url).toBe("/api/credits/summary?role=job_seeker");
    expect(receipts?.url).toBe("/api/billing/receipts?role=job_seeker");
    for (const call of [summary, receipts]) {
      expect(call?.init.credentials).toBe("include");
      expect((call?.init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    }
  });

  it("sends no Authorization header when there is no token", async () => {
    authState.getToken.mockResolvedValueOnce(null);
    const fetchMock = stubBilling();
    render(<Billing />);
    expect(await screen.findByText("Referral requests left")).toBeTruthy();
    const headers = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).headers as Record<string, string>);
    expect(headers.length).toBe(2);
    expect(headers.every(entry => !("Authorization" in entry))).toBe(true);
  });

  it("treats a refused summary as a failed load, not an empty account", async () => {
    stubBilling({ summaryStatus: 503 });
    render(<Billing />);
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your plan");
    expect(screen.queryByText("Referral requests left")).toBeNull();
  });

  it("treats refused receipts as a failed load, never as no payments", async () => {
    stubBilling({ receiptsStatus: 503 });
    render(<Billing />);
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your receipts");
    expect(screen.queryByText("No payments yet.")).toBeNull();
  });

  // Tier 1 review finding (Hark · e9cd, PR #819): the test that stood here passed
  // with the stale-response guard deleted, because the signed-out branch renders no
  // summary at all, so nothing could overwrite it. This one mounts a single page
  // across two sessions: the first session's two GETs stay pending, the seeker signs
  // out and back in, the second session paints its own facts, and only then does the
  // first session answer. Delete `if (!active) return;` in GoalBilling.tsx and the
  // late pair replaces the live one, so this fails.
  it("ignores a late response from the signed-out session", async () => {
    const oldSummary = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    const oldReceipts = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    let secondSession = false;
    const fetchMock = vi.fn((url: string) => {
      const path = String(url);
      if (secondSession) return Promise.resolve(path.includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary: freeSummary }));
      return path.includes("/billing/receipts") ? oldReceipts.promise : oldSummary.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<Billing />);
    await waitFor(() => expect(called(fetchMock, "/billing/receipts")).toBe(1));
    // Same mounted page, a different session: out, then back in.
    authState.isSignedIn = false;
    rerender(<Billing />);
    secondSession = true;
    authState.isSignedIn = true;
    rerender(<Billing />);
    // The live session's own facts are on screen before the old session answers.
    expect(await screen.findByText("No payments yet.")).toBeTruthy();
    await act(async () => {
      oldSummary.resolve(ok({ summary: startSummary }));
      oldReceipts.resolve(ok({ receipts: [settled] }));
    });
    // Nothing from the signed-out session may replace what the live one returned.
    expect(screen.queryByText("$4.99")).toBeNull();
    expect(screen.queryByText("INV-1001")).toBeNull();
    expect(screen.queryByText(/Renews 6 Nov 2026/)).toBeNull();
    expect(screen.getByText("No payments yet.")).toBeTruthy();
  });
});


describe("Goal /billing: cancellation commits", () => {
  it("writes nothing when the confirmation is opened and closed", async () => {
    const fetchMock = stubBilling({ summary: startSummary });
    render(<Billing />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel renewal" }));
    expect(screen.getByText("Before you go")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep my plan" }));
    expect(screen.queryByText("Before you go")).toBeNull();
    expect(called(fetchMock, "/subscription-cancel")).toBe(0);
    expect(await screen.findByText(/Renews 6 Nov 2026/)).toBeTruthy();
  });

  it("sends one cancellation when the commit is pressed twice while pending", async () => {
    const pending = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes("/subscription-cancel")) return pending.promise;
      if (path.includes("/billing/receipts")) return ok({ receipts: [] });
      return ok({ summary: startSummary });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Billing />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel renewal" }));
    const confirm = screen.getByRole("button", { name: "Cancel anyway" }) as HTMLButtonElement;
    // Two presses in one tick, before the busy state can repaint the button.
    act(() => { confirm.click(); confirm.click(); });
    await waitFor(() => expect(called(fetchMock, "/subscription-cancel")).toBe(1));
    pending.resolve(ok({ currentTermEnd: "2026-11-06T00:00:00.000Z" }));
    expect(await screen.findByText("Renewal cancelled.")).toBeTruthy();
    expect(called(fetchMock, "/subscription-cancel")).toBe(1);
  });
});

