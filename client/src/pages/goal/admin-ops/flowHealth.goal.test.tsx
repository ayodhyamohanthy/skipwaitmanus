// @vitest-environment jsdom
// D-048-p3-admin-ops /admin/flow-health (D-048-admin.md §3): the ops surface is
// read-mostly, so the one next step is the re-check; the two GETs, their
// headers, every section and every figure keep the kit page's behaviour
// (guardrail 1), with waiting coverage and refunds as dot + text. An unparseable
// baseline still reads as unavailable, never estimated. Fixtures are synthetic.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminFlowHealth, { GOAL_PAGE } from "./GoalAdminFlowHealth";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() } }));

// SignInButton is deliberately absent: a page that wraps GoalButton in it nests
// one <button> inside another, which only a real browser reports.
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/admin-flow-health", vi.fn()],
  useSearch: () => "",
}));

beforeEach(() => { authState.isSignedIn = true; authState.getToken.mockResolvedValue("test-token"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Reply = { ok: boolean; status: number; url: string; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

const HEALTH = {
  funnel: { requestsCreated: 128, requestsClaimed: 74, decisionsRecorded: 61, waitingForCoverage: 17 },
  coverageGaps: [{ companyDomain: "acme.example", waitingRequests: 11, verifiedCoverage: 1 }, { companyDomain: "wipro.example", waitingRequests: 6, verifiedCoverage: 0 }],
  instrumentation: { uploadedDocuments: 340, recordedFailures: 9 },
};
const BASELINE = {
  windowDays: 28,
  generatedAt: "2026-09-02T06:15:00.000Z",
  weeks: [{ weekStart: "2026-08-24", asks: 40, accepted: 12, passed: 9, expired: 5, declined: 0, withdrawn: 2, waiting: 12, uncovered: 4, referredWithin7Days: 6 }],
  expiries: { total: 21, last7Days: 5 },
  decisionLatency: { sampleSize: 18, medianHours: 6, p90Hours: 100 },
  coverage: [{ companyDomain: "acme.example", verifiedReferrers: 4, availableReferrers: 3, pausedOrFull: 1, waitingAsks: 11 }],
  demand: [{ companyDomain: "acme.example", waitingAsks: 11, oldestWaitingDays: 3, verifiedReferrers: 4 }],
  externalReferrers: { activeLast7Days: 7, activeInWindow: 14, excludedOperatorDomains: ["skipwait.me"] },
  subscribers: { paid: 3, trialing: 0, byPlan: [{ plan: "momentum", count: 2 }] },
  referredWithin7DaysPct: 15,
  dataQuality: [{ id: "orphan_ledger", label: "Ledger rows with no ask", count: 2, hint: "Reconcile key." }],
};
const REVENUE = {
  byProvider: [{ provider: "chargebee", currency: "INR", totalAmount: 229000, count: 12 }, { provider: "stripe", currency: "USD", totalAmount: 44900, count: 5 }],
  totalsByCurrency: [{ currency: "INR", totalAmount: 229000, count: 12 }, { currency: "USD", totalAmount: 44900, count: 5 }],
  refundedTotalByCurrency: [{ currency: "USD", totalAmount: 4490, count: 1 }],
  recordedAt: "2026-09-02T06:00:00.000Z",
};

type Key = "health" | "revenue";
function stub(overrides: Partial<Record<Key, Reply | (() => Promise<Reply>)>> = {}) {
  const pick = (key: Key, fallback: Reply): Promise<Reply> | Reply => {
    const value = overrides[key];
    return typeof value === "function" ? value() : value ?? fallback;
  };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    void init;
    if (url.includes("flow-health")) return pick("health", reply({ health: HEALTH, baseline: BASELINE })) as Promise<Reply> | Reply;
    if (url.includes("revenue")) return pick("revenue", reply({ revenue: REVENUE })) as Promise<Reply> | Reply;
    return reply({ error: "unexpected" }, 404) as Reply;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })}>{ui}</QueryClientProvider>);
const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const calls = (fetchMock: ReturnType<typeof stub>, part: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(part));

describe("goal /admin/flow-health (D-048-p3-admin-ops)", () => {
  it("opens with the goal line and the re-check as the one next step", async () => {
    stub();
    const { container } = renderPage(<GoalAdminFlowHealth />);
    expect(await screen.findByText("Requests created")).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("See where the referral flow needs work.");
    expect(within(nextStep()).getByRole("button", { name: "Re-check the flow" })).toBeTruthy();
    expect(Array.from(container.querySelectorAll("[data-g-primary]")).map(node => node.textContent?.trim())).toEqual(["Re-check the flow"]);
  });

  it("keeps the kit requests: both GETs, bearer header and cookies", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminFlowHealth />);
    await screen.findByText("Requests created");
    expect(calls(fetchMock, "flow-health").map(call => call[0])).toEqual(["/api/admin/flow-health"]);
    expect(calls(fetchMock, "revenue").map(call => call[0])).toEqual(["/api/admin/revenue"]);
    const init = calls(fetchMock, "flow-health")[0][1] as RequestInit;
    expect(init.headers).toEqual({ Authorization: "Bearer test-token" });
    expect(init.credentials).toBe("include");
  });

  it("shows every kit section with its own figures", async () => {
    stub();
    renderPage(<GoalAdminFlowHealth />);
    expect(await screen.findByText("Requests created")).toBeTruthy();
    expect(screen.getByText("128")).toBeTruthy();
    expect(screen.getByText("17")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Baseline" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Credit-pack payments" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Company coverage gaps" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Instrumentation health" })).toBeTruthy();
    // The same corridor repeats across the coverage and demand tables; the
    // point is that every kit table renders it, not that it is unique.
    expect(screen.getAllByText("acme.example").length).toBe(3);
    expect(screen.getByText("wipro.example")).toBeTruthy();
    expect(screen.getAllByText("₹2290")).toHaveLength(2);
  });

  it("states coverage pressure as dot + text, and refunds the same way", async () => {
    stub();
    const { container } = renderPage(<GoalAdminFlowHealth />);
    expect(await screen.findByText("17 waiting for coverage")).toBeTruthy();
    expect(screen.getByText(/^Refunded \$44\.90 · 1 payment$/)).toBeTruthy();
    const marks = Array.from(container.querySelectorAll("[data-testid='goal-status']"));
    expect(marks.length).toBeGreaterThan(1);
    for (const mark of marks) expect(mark.querySelector("span[aria-hidden='true']")).toBeTruthy();
  });

  it("says there is no coverage pressure when the server reports none", async () => {
    stub({ health: reply({ health: { ...HEALTH, funnel: { ...HEALTH.funnel, waitingForCoverage: 0 } }, baseline: BASELINE }) });
    renderPage(<GoalAdminFlowHealth />);
    expect(await screen.findByText("No request waiting for coverage")).toBeTruthy();
  });

  it("keeps an unparseable baseline unavailable rather than estimated", async () => {
    stub({ health: reply({ health: HEALTH, baseline: { windowDays: 1 } }) });
    renderPage(<GoalAdminFlowHealth />);
    expect(await screen.findByText(/The baseline is unavailable in this session/)).toBeTruthy();
  });

  it("re-checks with the same two requests", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminFlowHealth />);
    await screen.findByText("Requests created");
    const before = fetchMock.mock.calls.length;
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Re-check the flow" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(before + 2));
    expect(calls(fetchMock, "flow-health")).toHaveLength(2);
    expect(calls(fetchMock, "revenue")).toHaveLength(2);
  });

  it("shows a loading state without claiming zero figures", async () => {
    stub({ health: () => new Promise<Reply>(() => {}), revenue: () => new Promise<Reply>(() => {}) });
    const { container } = renderPage(<GoalAdminFlowHealth />);
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeTruthy());
    expect(screen.queryByText("Requests created")).toBeNull();
    expect(screen.queryByText("No revenue recorded yet")).toBeNull();
  });

  it("shows a failed load with a retry instead of an all-zero dashboard", async () => {
    const fetchMock = stub({ health: reply({ error: "We could not load referral flow health" }, 500) });
    renderPage(<GoalAdminFlowHealth />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText("Requests created")).toBeNull();
    const before = fetchMock.mock.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    expect(screen.getByRole("alert").textContent).toContain("We could not load referral flow health");
  });

  it("shows the denied wording without any metrics", async () => {
    stub({ health: reply({ error: "Administrator access is required" }, 403), revenue: reply({ error: "Administrator access is required" }, 403) });
    renderPage(<GoalAdminFlowHealth />);
    expect(await screen.findByText("Administrator access is required")).toBeTruthy();
    expect(screen.queryByText("Requests created")).toBeNull();
  });

  it("shows the honest empties: no revenue, no uncovered corridor", async () => {
    stub({
      health: reply({ health: { ...HEALTH, coverageGaps: [] }, baseline: { ...BASELINE, weeks: [] } }),
      revenue: reply({ revenue: { ...REVENUE, byProvider: [], totalsByCurrency: [], refundedTotalByCurrency: [] } }),
    });
    renderPage(<GoalAdminFlowHealth />);
    expect(await screen.findByText("No revenue recorded yet")).toBeTruthy();
    expect(screen.getByText(/No uncovered pending company corridors/)).toBeTruthy();
    expect(screen.getByText(/No asks were recorded in this window yet/)).toBeTruthy();
  });

  it("asks a signed-out visitor to sign in and loads nothing", () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    const { container } = renderPage(<GoalAdminFlowHealth />);
    const signIn = screen.getByRole("button", { name: /Sign in/ });
    expect(signIn).toBeTruthy();
    expect(signIn.closest("button")).toBe(signIn);
    expect(container.querySelector("button button")).toBeNull();
    authState.openSignIn.mockClear();
    fireEvent.click(signIn);
    expect(authState.openSignIn).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
