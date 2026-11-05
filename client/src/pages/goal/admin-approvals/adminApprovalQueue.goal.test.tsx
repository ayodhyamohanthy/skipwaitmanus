// @vitest-environment jsdom
// Goal /admin/approvals (D-048-p3-admin-approvals, D-048-admin.md §3-§5):
// "Decide this approval." with the oldest open record as the one next step.
// Guardrail 1: the queue read and the inline decision keep the kit page's exact
// server calls - GET /api/admin/approval-queue?limit=250 and POST
// /api/admin/approval-queue/:kind/:id/decision with { decision } and nothing
// else. Guardrail 3: the credit line comes from the shared money copy, never a
// new string. Loading, empty, error and the access gate are pinned; fixtures
// are synthetic.
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creditReservedPhrase } from "@shared/moneyCopy";
import { ASK_LEVEL_COST_CLIENT } from "@/lib/goalFlags";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminApprovalQueue, { GOAL_PAGE } from "./GoalAdminApprovalQueue";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("admin-token") } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/admin/approvals", vi.fn()],
  useSearch: () => "",
}));

const requestItem = { kind: "referral_request", id: 501, status: "under_review", companyDomain: "acme.example", createdAt: "Tue 2026-09-01 2:30 PM IST (UTC+05:30)", updatedAt: "Tue 2026-09-01 2:30 PM IST (UTC+05:30)", summary: "I led a measurable product design launch.", meta: { claimTime: "Tue 2026-09-01 2:30 PM IST (UTC+05:30)", seekerName: "Avery", targetRoleUrl: "https://careers.acme.example/jobs/design", tokenCount: 1, creditReserved: true } };
const enrollmentItem = { kind: "referrer_enrollment", id: 77, status: "under_review", companyDomain: "acme.example", createdAt: "Tue 2026-09-01 1:30 PM IST (UTC+05:30)", updatedAt: "Tue 2026-09-01 1:30 PM IST (UTC+05:30)", summary: "Work email verified · awaiting a first referral action", meta: { otpTime: "Tue 2026-09-01 1:30 PM IST (UTC+05:30)", referrerName: "Blake", referrerEmail: "blake@acme.example" } };
const paymentItem = { kind: "payment", id: 33, status: "requires_review", companyDomain: "", provider: "chargebee", amount: 39600, currency: "INR", createdAt: "Tue 2026-09-01 12:30 PM IST (UTC+05:30)", updatedAt: "Tue 2026-09-01 12:30 PM IST (UTC+05:30)", summary: "provider_page_mismatch", meta: { tokenCount: 4, reason: "provider_page_mismatch" } };
const ITEMS = [requestItem, enrollmentItem, paymentItem];

type Reply = { ok: boolean; status: number; url: string; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

function stub(queue: Reply | (() => Promise<Reply>) = reply({ items: ITEMS }), decision: (url: string, init?: RequestInit) => Reply = (_url, init) => reply({ ok: true, status: String(init?.body).includes("rejected") ? "declined" : "approved" })) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return decision(url, init);
    if (url.startsWith("/api/admin/approval-queue")) return typeof queue === "function" ? queue() : queue;
    return reply({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const rowFor = (title: string) => screen.getByRole("heading", { level: 3, name: title }).closest("li")!;
const posts = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST").map(([url, init]) => ({ url: String(url), init: init as RequestInit }));

beforeEach(() => { authState.isSignedIn = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal /admin/approvals (D-048-p3-admin-approvals)", () => {
  it("opens with the goal line and the oldest open record as the one next step", async () => {
    stub();
    const { container } = render(<GoalAdminApprovalQueue />);
    expect(await screen.findByRole("heading", { level: 3, name: "Ref-1501" })).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("Decide this approval.");
    expect(container.querySelector("[data-goal-page]")).toBeTruthy();
    const link = within(nextStep()).getByRole("link", { name: "Open the oldest record" });
    expect(link.getAttribute("href")).toBe("/admin/approvals/payment/33");
    expect(within(nextStep()).getByText(/Ref-PMT-1033/)).toBeTruthy();
  });

  it("reads the queue with the kit page's exact request", async () => {
    const fetchMock = stub();
    render(<GoalAdminApprovalQueue />);
    await screen.findByRole("heading", { level: 3, name: "Ref-1501" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual(["/api/admin/approval-queue?limit=250", { headers: { Authorization: "Bearer admin-token" }, credentials: "include" }]);
  });

  it("lists all three record kinds with dot + text status, the shared credit line and the payment amount", async () => {
    stub();
    render(<GoalAdminApprovalQueue />);
    await screen.findByRole("heading", { level: 3, name: "Ref-1501" });
    const request = rowFor("Ref-1501");
    const enrollment = rowFor("Blake");
    const payment = rowFor("Ref-PMT-1033");
    expect(within(request).getByTestId("goal-status").textContent).toBe("Under review");
    expect(within(enrollment).getByText(/OTP verified/)).toBeTruthy();
    expect(within(payment).getByTestId("goal-status").textContent).toBe("Requires review");
    expect(within(request).getByText(creditReservedPhrase(ASK_LEVEL_COST_CLIENT))).toBeTruthy();
    expect(within(request).getByRole("link", { name: "Role link" }).getAttribute("href")).toBe("https://careers.acme.example/jobs/design");
    expect(within(payment).getByText(/INR 396/)).toBeTruthy();
    expect(within(payment).getAllByText(/provider_page_mismatch/).length).toBeGreaterThan(0);
    expect(within(request).getByRole("link", { name: "Open record" }).getAttribute("href")).toBe("/admin/approvals/referral_request/501");
  });

  it("records an inline decision on the kit page's exact call and updates the row without a reload", async () => {
    const fetchMock = stub();
    render(<GoalAdminApprovalQueue />);
    await screen.findByRole("heading", { level: 3, name: "Ref-PMT-1033" });
    fireEvent.click(within(rowFor("Ref-PMT-1033")).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(within(rowFor("Ref-PMT-1033")).getByTestId("goal-status").textContent).toBe("Approved"));
    expect(posts(fetchMock)).toEqual([{ url: "/api/admin/approval-queue/payment/33/decision", init: { method: "POST", headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ decision: "approved" }) } }]);
    expect(within(rowFor("Ref-PMT-1033")).getByRole("button", { name: "Approve" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("rejects with { decision: \"rejected\" } and shows the declined status", async () => {
    const fetchMock = stub();
    render(<GoalAdminApprovalQueue />);
    await screen.findByRole("heading", { level: 3, name: "Blake" });
    fireEvent.click(within(rowFor("Blake")).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(within(rowFor("Blake")).getByTestId("goal-status").textContent).toBe("Declined"));
    expect(posts(fetchMock).map(call => [call.url, call.init.body])).toEqual([["/api/admin/approval-queue/referrer_enrollment/77/decision", JSON.stringify({ decision: "rejected" })]]);
  });

  it("filters without a reload and counts what is still open", async () => {
    stub();
    render(<GoalAdminApprovalQueue />);
    await screen.findByRole("heading", { level: 3, name: "Ref-1501" });
    expect(screen.queryByText("3 open")).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "under_review" } });
    expect(screen.getByText("2 open")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "Ref-PMT-1033" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter by record type"), { target: { value: "payment" } });
    expect(screen.getByText(/No items match these filters/)).toBeTruthy();
    expect(screen.getByText(/Widen the date range or clear filters/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("heading", { level: 3, name: "Ref-PMT-1033" })).toBeTruthy();
  });

  it("keeps the record in the queue when a decision fails and retries the same decision", async () => {
    let count = 0;
    const fetchMock = stub(undefined, () => { count += 1; return count === 1 ? reply({ error: "We could not record this approval decision" }, 500) : reply({ ok: true, status: "approved" }); });
    render(<GoalAdminApprovalQueue />);
    await screen.findByRole("heading", { level: 3, name: "Ref-1501" });
    fireEvent.click(within(rowFor("Ref-1501")).getByRole("button", { name: "Approve" }));
    expect(await within(rowFor("Ref-1501")).findByText(/Decision failed to save/)).toBeTruthy();
    expect(screen.getByText(/The record is unchanged and still in the queue. No notifications were sent./)).toBeTruthy();
    fireEvent.click(within(rowFor("Ref-1501")).getByRole("button", { name: "Retry decision" }));
    await waitFor(() => expect(within(rowFor("Ref-1501")).getByTestId("goal-status").textContent).toBe("Approved"));
    expect(posts(fetchMock).map(call => call.init.body)).toEqual([JSON.stringify({ decision: "approved" }), JSON.stringify({ decision: "approved" })]);
  });

  it("says so honestly when the queue is clear", async () => {
    const { container } = (stub(reply({ items: [] })), render(<GoalAdminApprovalQueue />));
    expect(await screen.findByText("Queue clear")).toBeTruthy();
    expect(screen.getByText("No items need an administrator decision right now.")).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(within(nextStep()).getByRole("link", { name: "Open the review queue" }).getAttribute("href")).toBe("/admin-review");
  });

  it("shows a loading state without claiming an empty queue", async () => {
    stub(() => new Promise<Reply>(() => {}));
    const { container } = render(<GoalAdminApprovalQueue />);
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeTruthy());
    expect(screen.queryByText("Queue clear")).toBeNull();
  });

  it("shows a failed load with a retry as the one next step, and never a clear queue", async () => {
    const fetchMock = stub(reply({ error: "We could not load the approval queue" }, 500));
    const { container } = render(<GoalAdminApprovalQueue />);
    expect(await screen.findByText("We could not load the approval queue")).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(screen.queryByText("Queue clear")).toBeNull();
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("keeps queue contents hidden without administrator access", async () => {
    stub(reply({ error: "forbidden" }, 403));
    const { container } = render(<GoalAdminApprovalQueue />);
    expect(await screen.findByText("Administrator access is required.")).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(within(nextStep()).getByRole("link", { name: "Sign in as administrator" }).getAttribute("href")).toMatch(/^\/sign-in\?returnTo=/);
    expect(screen.queryByText(/Ref-1501|Blake|Ref-PMT-1033/)).toBeNull();
  });

  it("asks a signed-out visitor to sign in and loads nothing", () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    const { container } = render(<GoalAdminApprovalQueue />);
    assertGoalPage(container, GOAL_PAGE);
    expect(within(nextStep()).getByRole("button", { name: /Sign in/ })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("goal admin-approvals sources", () => {
  it("carry no inline hex colour (status is dot + text with tokens)", () => {
    const offenders = readdirSync(__dirname)
      .filter(name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      .filter(name => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(join(__dirname, name), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("write no credit or cost phrase of their own: the credit line comes from shared/moneyCopy", () => {
    const offenders = readdirSync(__dirname)
      .filter(name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      .filter(name => /["'`][^"'`]*\bcredits? reserved\b/i.test(readFileSync(join(__dirname, name), "utf8")));
    expect(offenders).toEqual([]);
  });
});
