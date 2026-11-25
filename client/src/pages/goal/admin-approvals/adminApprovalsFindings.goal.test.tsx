// @vitest-environment jsdom
// D-048-R-admin-approvals review findings F1-F5 (pull request 1206, Nov 16), fixed in
// place on the release row (D-344 (2)). Each test reproduces the reviewer's
// synthetic case against the goal queue and record. Fixtures are synthetic and
// shaped like the server's real responses (server/db.ts listAdminApprovalQueue,
// server/privateReferralRoutes.ts decision route, server/adminReferralApproval.ts).
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GoalAdminApprovalQueue from "./GoalAdminApprovalQueue";
import GoalAdminApprovalRecord from "./GoalAdminApprovalRecord";
import { buildHistory, decisionFailureCopy, type ApprovalItem } from "./approvalsData";

const { authState, route } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("admin-token") }, route: { kind: "employer_application", id: "901" } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useRoute: () => [true, { ...route }],
  useLocation: () => [`/admin/approvals/${route.kind}/${route.id}`, vi.fn()],
  useSearch: () => "",
}));

// The real server shape for an employer access application (server/db.ts).
const employerItem = { kind: "employer_application", id: 901, status: "pending", companyDomain: "globex.example", createdAt: "2026-09-01T06:00:00.000Z", updatedAt: "2026-09-01T06:00:00.000Z", summary: "Globex employer access application", meta: { companyName: "Globex", billingEmail: "hiring@globex.example", duplicatePersonCount: 0, duplicateDomainCount: 2, evidenceVersion: "v3", reviewDueAt: "2026-09-02T06:00:00.000Z" } };
const employerEvent = { id: 92, action: "admin.employer_approved", outcome: "success", resourceType: "employer_application", resourceId: "901", metadata: JSON.stringify({ note: "Domain checked" }), createdAt: "2026-09-01T07:00:00.000Z", actorName: "Admin", actorEmail: null };
// An uncovered request: no verified employee can see it, so nothing was debited.
const uncoveredItem = { kind: "referral_request", id: 514, status: "pending", companyDomain: "initech.example", createdAt: "2026-09-01T05:00:00.000Z", updatedAt: "2026-09-01T05:00:00.000Z", summary: "Waiting for company coverage — no verified employee has claimed this yet", meta: { claimTime: null, waitingForCoverage: true, tokenCount: 1, creditReserved: true, seekerName: "Sam", seekerEmail: "sam@example.com" } };
const claimedItem = { kind: "referral_request", id: 501, status: "under_review", companyDomain: "acme.example", createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-01T09:05:00.000Z", summary: "Pitch", meta: { claimTime: "2026-09-01T09:05:00.000Z", waitingForCoverage: false, tokenCount: 1, creditReserved: true, seekerName: "Avery", referrerName: "Blake" } };
const enrollmentItem = { kind: "referrer_enrollment", id: 77, status: "under_review", companyDomain: "acme.example", createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", summary: "Work email verified · awaiting a first referral action", meta: { otpTime: "2026-09-01T08:00:00.000Z", referrerName: "Blake", referrerEmail: "blake@acme.example" } };
const paymentItem = { kind: "payment", id: 33, status: "requires_review", companyDomain: "", provider: "chargebee", amount: 39600, currency: "INR", createdAt: "2026-09-01T07:00:00.000Z", updatedAt: "2026-09-01T07:00:00.000Z", summary: "provider_page_mismatch", meta: { tokenCount: 4, reason: "provider_page_mismatch" } };
// The exact refusal bodies the decision route answers with 409.
const CLAIMED_REFUSAL = "A verified employee claimed this request, so only they can accept it; you can still reject it";
const PAYMENT_REFUSAL = "Chargebee shows this payment refunded in full, so its credits cannot be added. Reject it to close it. Nothing was changed.";

type Reply = { ok: boolean; status: number; url: string; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

function stub({ items = [employerItem, uncoveredItem, claimedItem, enrollmentItem, paymentItem] as unknown[], events = [] as unknown[], decision }: { items?: unknown[]; events?: unknown[]; decision?: () => Reply } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return decision ? decision() : reply({ ok: true, status: "approved" });
    if (url.startsWith("/api/admin/activity")) return reply({ events });
    if (url.startsWith("/api/admin/approval-queue")) return reply({ items });
    return reply({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const posts = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
const rowFor = (title: string) => screen.getByRole("heading", { level: 3, name: title }).closest("li")!;

beforeEach(() => { authState.isSignedIn = true; route.kind = "employer_application"; route.id = "901"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("F1: an employer access application is never shown as a payment", () => {
  it("the queue names it, gives its context and offers the oldest open record without undefined", async () => {
    stub();
    render(<GoalAdminApprovalQueue />);
    await screen.findByRole("heading", { level: 3, name: "Globex" });
    const row = rowFor("Globex");
    expect(within(row).getByText("Employer access")).toBeTruthy();
    expect(within(row).getByText(/globex\.example · submitted/)).toBeTruthy();
    expect(within(row).getByText("hiring@globex.example")).toBeTruthy();
    expect(within(row).queryByText(/token/)).toBeNull();
    expect(within(row).getByRole("link", { name: "Open record" }).getAttribute("href")).toBe("/admin/approvals/employer_application/901");
    const reason = nextStep().textContent ?? "";
    expect(reason).toMatch(/Oldest open record: Seeker request · Ref-1514/);
    expect(reason).not.toMatch(/undefined/);
    expect(screen.getByRole("option", { name: "Employer access" })).toBeTruthy();
  });

  it("the record shows the employer identity and evidence, never payment or token content", async () => {
    stub();
    render(<GoalAdminApprovalRecord />);
    expect(await screen.findByRole("heading", { level: 2, name: "Globex" })).toBeTruthy();
    expect(screen.getByText("hiring@globex.example")).toBeTruthy();
    expect(screen.getByText(/Evidence version v3/)).toBeTruthy();
    expect(screen.getByText(/2 other applications from this domain/)).toBeTruthy();
    expect(screen.queryByText(/Credit pack/)).toBeNull();
    expect(screen.queryByText(/token/)).toBeNull();
    expect(within(nextStep()).getByRole("button", { name: "Approve" })).toBeTruthy();
  });

  it("loads with a matching activity event and shows it in the history", async () => {
    stub({ events: [employerEvent] });
    render(<GoalAdminApprovalRecord />);
    expect(await screen.findByRole("heading", { level: 2, name: "Globex" })).toBeTruthy();
    const history = screen.getByRole("region", { name: "History" });
    const lines = within(history).getAllByRole("listitem").map(item => item.querySelector("p")?.textContent);
    expect(lines).toEqual(["Employer access application submitted", "Approved by admin"]);
    expect(within(history).getByText("Note: Domain checked")).toBeTruthy();
  });

  it("drops a record of a kind the page does not know instead of rendering it as a payment", async () => {
    stub({ items: [{ ...paymentItem, kind: "partner_invoice", id: 5 }, enrollmentItem] });
    render(<GoalAdminApprovalQueue />);
    await screen.findByRole("heading", { level: 3, name: "Blake" });
    expect(screen.queryByRole("heading", { level: 3, name: "Ref-PMT-1005" })).toBeNull();
  });
});

describe("F2: a 409 refusal keeps the server's explanation", () => {
  it("a claimed-request refusal says why, is not called resolved, and leaves Reject available", async () => {
    route.kind = "referral_request"; route.id = "501";
    const fetchMock = stub({ decision: () => reply({ error: CLAIMED_REFUSAL }, 409) });
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Approve" }));
    const alert = await within(nextStep()).findByRole("alert");
    expect(alert.textContent).toContain("This attempt was not recorded.");
    expect(alert.textContent).toContain(CLAIMED_REFUSAL);
    expect(alert.textContent).not.toMatch(/already resolved/);
    const reject = within(nextStep()).getByRole("button", { name: "Reject" });
    expect(reject.getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(reject);
    await waitFor(() => expect(posts(fetchMock).length).toBe(2));
  });

  it("a payment-review refusal in the queue keeps its explanation", async () => {
    stub({ decision: () => reply({ error: PAYMENT_REFUSAL }, 409) });
    render(<GoalAdminApprovalQueue />);
    await screen.findByRole("heading", { level: 3, name: "Ref-PMT-1033" });
    const row = rowFor("Ref-PMT-1033");
    fireEvent.click(within(row).getByRole("button", { name: "Approve" }));
    const alert = await within(row).findByRole("alert");
    expect(alert.textContent).toContain(PAYMENT_REFUSAL);
    expect(alert.textContent).not.toMatch(/already resolved/);
  });

  it("resolved-state wording needs the server's resolved signal", () => {
    expect(decisionFailureCopy("already_resolved", "this record")).toMatch(/already resolved/);
    expect(decisionFailureCopy("refused", "this record", CLAIMED_REFUSAL)).toBe(`This attempt was not recorded. ${CLAIMED_REFUSAL}. Reload this record to see its current state.`);
    expect(decisionFailureCopy("refused", "the queue")).toBe("This attempt was not recorded. The server refused it. Reload the queue to see its current state.");
  });
});

describe("F3: referral money guidance follows the current rules", () => {
  it("an uncovered request says nothing is charged while it waits", async () => {
    route.kind = "referral_request"; route.id = "514";
    stub();
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Ref-1514" });
    expect(screen.getByRole("heading", { level: 3, name: "Nothing charged while it waits" })).toBeTruthy();
    expect(screen.queryByText(/Reserved when the request was created/)).toBeNull();
    expect(screen.queryByText(/never consumed on decline/)).toBeNull();
    expect(screen.getByText(/Your decision here changes the request's status only\. It moves no credit\./)).toBeTruthy();
  });

  it("a picked-up request says its credit stays spent even if the employee declines", async () => {
    route.kind = "referral_request"; route.id = "501";
    stub();
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
    expect(screen.getByRole("heading", { level: 3, name: "Picked up: its credit stays spent" })).toBeTruthy();
    expect(screen.getByText(/stays spent even if they decline or pass/)).toBeTruthy();
  });

  it("the queue shows no credit line on an uncovered request", async () => {
    stub();
    render(<GoalAdminApprovalQueue />);
    await screen.findByRole("heading", { level: 3, name: "Ref-1514" });
    const row = rowFor("Ref-1514");
    expect(within(row).getByText("Nothing charged while waiting")).toBeTruthy();
    expect(within(rowFor("Ref-1501")).getByText("Credit stays spent")).toBeTruthy();
  });
});

describe("F4: history shows no reservation the ledger did not record", () => {
  it("an uncovered request's history has no credit line", async () => {
    route.kind = "referral_request"; route.id = "514";
    stub();
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Ref-1514" });
    const history = screen.getByRole("region", { name: "History" });
    const lines = within(history).getAllByRole("listitem").map(item => item.querySelector("p")?.textContent);
    expect(lines).toEqual(["Request created"]);
    expect(within(history).queryByText(/credit/i)).toBeNull();
  });

  it("buildHistory invents no reservation or monthly source for any referral", () => {
    for (const item of [uncoveredItem, claimedItem] as ApprovalItem[]) {
      const labels = buildHistory(item, []).map(event => `${event.label} ${event.actor}`);
      expect(labels.join(" | ")).not.toMatch(/monthly|reservation|reserved/i);
    }
  });
});

describe("F5: enrollment promises no referrer reward", () => {
  it("says the referrer earns nothing for accepting a referral", async () => {
    route.kind = "referrer_enrollment"; route.id = "77";
    stub();
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Blake" });
    expect(screen.queryByText(/Invite credits unlock/)).toBeNull();
    expect(screen.getByText(/accepting a referral earns the referrer nothing\. Referrers are never paid\./)).toBeTruthy();
  });
});
