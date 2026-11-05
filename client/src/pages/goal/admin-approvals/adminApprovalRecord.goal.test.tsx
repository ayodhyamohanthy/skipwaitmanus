// @vitest-environment jsdom
// Goal /admin/approvals/:kind/:id (D-048-p3-admin-approvals, D-048-admin.md
// §3-§5): "Decide this approval." with the decision as the one commit.
// Guardrail 1: the record keeps the kit page's exact reads (the queue and the
// activity log) and its exact decision call - POST
// /api/admin/approval-queue/:kind/:id/decision with { decision, note } where an
// empty note is left out. Guardrail 3: every credit line on the record and in
// its history comes from shared/moneyCopy. Fixtures are synthetic.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creditReservedPhrase } from "@shared/moneyCopy";
import { ASK_LEVEL_COST_CLIENT } from "@/lib/goalFlags";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminApprovalRecord, { GOAL_PAGE } from "./GoalAdminApprovalRecord";

// Owner-routed ruling (Nov 5, 23:42): these phrases claim server state the page
// cannot know and must not appear anywhere under pages/goal/admin-approvals.
// Assembled from parts so this file does not carry them literally.
const BANNED_CLAIMS = new RegExp(["record un" + "changed", "un" + "changed", "no noti" + "fications", "nothing has been decided or noti" + "fied"].join("|"), "i");

const { authState, route } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("admin-token") }, route: { kind: "referral_request", id: "501" } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useRoute: () => [true, { ...route }],
  useLocation: () => [`/admin/approvals/${route.kind}/${route.id}`, vi.fn()],
}));

const requestItem = { kind: "referral_request", id: 501, status: "under_review", companyDomain: "acme.example", createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-01T09:00:00.000Z", summary: "I led a measurable product design launch.", meta: { claimTime: "2026-09-01T09:05:00.000Z", seekerName: "Avery", seekerEmail: "avery@example.com", referrerName: "Blake", referrerEmail: "blake@acme.example", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.example/jobs/design", tokenCount: 1, creditReserved: true, pitch: "I led a measurable product design launch." } };
const enrollmentItem = { kind: "referrer_enrollment", id: 77, status: "pending", companyDomain: "acme.example", createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", summary: "Work email verified", meta: { otpTime: "2026-09-01T08:00:00.000Z", referrerName: "Blake", referrerEmail: "blake@acme.example" } };
const paymentItem = { kind: "payment", id: 33, status: "requires_review", companyDomain: "", provider: "chargebee", amount: 39600, currency: "INR", createdAt: "2026-09-01T07:00:00.000Z", updatedAt: "2026-09-01T07:00:00.000Z", summary: "provider_page_mismatch", meta: { tokenCount: 4, reason: "provider_page_mismatch", userEmail: "pat@example.com", role: "job_seeker" } };
const createdEvent = { id: 91, action: "company_referral.created", outcome: "success", resourceType: "referral_request", resourceId: "501", metadata: null, createdAt: "2026-09-01T09:00:00.000Z", actorName: null, actorEmail: null };

type Reply = { ok: boolean; status: number; url: string; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

function stub({ items = [requestItem, enrollmentItem, paymentItem] as unknown[], queue, activity, decision }: { items?: unknown[]; queue?: Reply | (() => Promise<Reply>); activity?: Reply; decision?: (url: string, init?: RequestInit) => Reply } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return decision ? decision(url, init) : reply({ ok: true, status: String(init.body).includes("rejected") ? "declined" : "approved" });
    if (url.startsWith("/api/admin/activity")) return activity ?? reply({ events: [createdEvent] });
    if (url.startsWith("/api/admin/approval-queue")) return typeof queue === "function" ? queue() : queue ?? reply({ items });
    return reply({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const posts = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST").map(([url, init]) => ({ url: String(url), init: init as RequestInit }));
const history = () => screen.getByRole("region", { name: "History" });

beforeEach(() => { authState.isSignedIn = true; route.kind = "referral_request"; route.id = "501"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal /admin/approvals/:kind/:id (D-048-p3-admin-approvals)", () => {
  it("opens with the goal line and the decision as the one commit", async () => {
    stub();
    const { container } = render(<GoalAdminApprovalRecord />);
    expect(await screen.findByRole("heading", { level: 2, name: "Ref-1501" })).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("Decide this approval.");
    expect(container.querySelector("[data-goal-page]")).toBeTruthy();
    const approve = within(nextStep()).getByRole("button", { name: "Approve" });
    expect(approve.hasAttribute("data-g-primary")).toBe(true);
    expect(within(nextStep()).getByRole("button", { name: "Reject" }).hasAttribute("data-g-primary")).toBe(false);
    expect(screen.getByRole("link", { name: "Back to approvals" }).getAttribute("href")).toBe("/admin/approvals");
  });

  it("reads the record with the kit page's exact two requests", async () => {
    const fetchMock = stub();
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
    const init = { headers: { Authorization: "Bearer admin-token" }, credentials: "include" };
    expect(fetchMock.mock.calls).toEqual([["/api/admin/approval-queue?limit=250", init], ["/api/admin/activity?limit=250", init]]);
  });

  it("shows the request blocks and an ordered history whose credit line comes from the shared copy", async () => {
    stub();
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
    expect(screen.getByText("Avery")).toBeTruthy();
    expect(screen.getByText("avery@example.com")).toBeTruthy();
    expect(screen.getByText("Blake")).toBeTruthy();
    expect(screen.getByText("Product Designer")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open job link" }).getAttribute("href")).toBe("https://careers.acme.example/jobs/design");
    expect(screen.getByRole("heading", { level: 3, name: creditReservedPhrase(ASK_LEVEL_COST_CLIENT) })).toBeTruthy();
    expect(screen.getByText("Reserved when the request was created. Returned on withdraw, consumed on accept, never consumed on decline.")).toBeTruthy();
    const lines = within(history()).getAllByRole("listitem").map(item => item.querySelector("p")?.textContent);
    // The kit order: the reservation line and the logged creation share a timestamp and keep push order (stable sort).
    expect(lines).toEqual([`${creditReservedPhrase(ASK_LEVEL_COST_CLIENT)} (monthly)`, "Request created", "Claimed by verified referrer"]);
    expect(within(history()).getAllByText(/System/).length).toBeGreaterThan(0);
  });

  it("records the decision with its note on the kit page's exact call and adds it to the history", async () => {
    const fetchMock = stub();
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
    fireEvent.change(screen.getByLabelText(/Decision note/), { target: { value: "Domain matches the invite code" } });
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getAllByText("Approved by admin").length).toBeGreaterThan(0));
    expect(posts(fetchMock)).toEqual([{ url: "/api/admin/approval-queue/referral_request/501/decision", init: { method: "POST", headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ decision: "approved", note: "Domain matches the invite code" }) } }]);
    expect(screen.getAllByTestId("goal-status").map(node => node.textContent)).toContain("Approved");
    expect(within(history()).getByText(/You \(administrator\)/)).toBeTruthy();
    expect(within(history()).getByText("Note: Domain matches the invite code")).toBeTruthy();
    expect(screen.getByText("Already resolved")).toBeTruthy();
  });

  it("leaves an empty note out of the body, exactly as the kit page does", async () => {
    const fetchMock = stub();
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
    fireEvent.change(screen.getByLabelText(/Decision note/), { target: { value: "   " } });
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(posts(fetchMock).length).toBe(1));
    expect(posts(fetchMock)[0].init.body).toBe(JSON.stringify({ decision: "rejected" }));
    await waitFor(() => expect(screen.getAllByText("Rejected by admin").length).toBeGreaterThan(0));
  });

  // Owner-routed ruling (Nov 5, 23:42): a 409 follows an earlier successful
  // decision (which may already have notified someone), so the page says only
  // that this attempt was not recorded and asks for a reload; no blind retry.
  it("on a 409 says this attempt was not recorded and offers a reload, never a retry", async () => {
    const fetchMock = stub({ decision: () => reply({ error: "This record was already resolved" }, 409) });
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Approve" }));
    const alert = await within(nextStep()).findByRole("alert");
    expect(alert.textContent).toMatch(/This attempt was not recorded — this record was already resolved\. Reload to see its current state\./);
    expect(alert.textContent).not.toMatch(BANNED_CLAIMS);
    expect(within(alert).queryByRole("button", { name: "Retry decision" })).toBeNull();
    const reads = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== "POST").length;
    const before = reads();
    fireEvent.click(within(alert).getByRole("button", { name: "Reload this record" }));
    await waitFor(() => expect(reads()).toBe(before + 2));
    expect(posts(fetchMock).length).toBe(1);
  });

  it.each([
    ["a 500", () => reply({ error: "We could not record this approval decision" }, 500)],
    ["no response", () => { throw new TypeError("Failed to fetch"); }],
  ] as const)("on %s says the decision may have been recorded and offers a reload, never a blind retry", async (_case, failure) => {
    const fetchMock = stub({ decision: failure as (url: string, init?: RequestInit) => Reply });
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Approve" }));
    const alert = await within(nextStep()).findByRole("alert");
    expect(alert.textContent).toMatch(/The decision may not have been recorded\. Reload this record before you retry\./);
    expect(alert.textContent).not.toMatch(BANNED_CLAIMS);
    expect(within(alert).queryByRole("button", { name: "Retry decision" })).toBeNull();
    const reads = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== "POST").length;
    const before = reads();
    fireEvent.click(within(alert).getByRole("button", { name: "Reload this record" }));
    await waitFor(() => expect(reads()).toBe(before + 2));
    expect(posts(fetchMock).length).toBe(1);
  });

  // Coordinator review finding (Nov 6, 00:29): the failure copy forbids a
  // blind retry, so while a decision failure is shown Approve and Reject are
  // held until the offered reload reconciles the record from the server.
  describe("holds the decision after a failed decision until the reload reconciles it", () => {
    const failures = [
      ["a 409", () => reply({ error: "This record was already resolved" }, 409)],
      ["a 500", () => reply({ error: "We could not record this approval decision" }, 500)],
      ["no response", () => { throw new TypeError("Failed to fetch"); }],
    ] as const;

    it.each(failures)("after %s both actions are aria-disabled and a click sends no second decision", async (_case, failure) => {
      const fetchMock = stub({ decision: failure as (url: string, init?: RequestInit) => Reply });
      render(<GoalAdminApprovalRecord />);
      await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
      fireEvent.click(within(nextStep()).getByRole("button", { name: "Approve" }));
      await within(nextStep()).findByRole("alert");
      const approve = within(nextStep()).getByRole("button", { name: "Approve" });
      const reject = within(nextStep()).getByRole("button", { name: "Reject" });
      expect(approve.getAttribute("aria-disabled")).toBe("true");
      expect(reject.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(approve);
      fireEvent.click(reject);
      expect(posts(fetchMock).length).toBe(1);
    });

    it("after a reload that finds the record resolved, shows it resolved and keeps both actions held", async () => {
      let resolvedOnServer = false;
      const fetchMock = stub({ queue: async () => reply({ items: [{ ...requestItem, status: resolvedOnServer ? "approved" : "under_review" }] }), decision: () => { resolvedOnServer = true; return reply({ error: "This record was already resolved" }, 409); } });
      render(<GoalAdminApprovalRecord />);
      await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
      fireEvent.click(within(nextStep()).getByRole("button", { name: "Approve" }));
      const alert = await within(nextStep()).findByRole("alert");
      fireEvent.click(within(alert).getByRole("button", { name: "Reload this record" }));
      await waitFor(() => expect(within(nextStep()).queryByRole("alert")).toBeNull());
      expect(screen.getByText("Already resolved")).toBeTruthy();
      expect(screen.queryByText("Under review")).toBeNull();
      const approve = within(nextStep()).getByRole("button", { name: "Approve" });
      expect(approve.getAttribute("aria-disabled")).toBe("true");
      expect(within(nextStep()).getByRole("button", { name: "Reject" }).getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(approve);
      expect(posts(fetchMock).length).toBe(1);
    });

    it("after a reload that finds the record still pending, offers the decision again", async () => {
      let attempts = 0;
      const fetchMock = stub({ decision: () => { attempts += 1; return attempts === 1 ? reply({ error: "We could not record this approval decision" }, 500) : reply({ ok: true, status: "approved" }); } });
      render(<GoalAdminApprovalRecord />);
      await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
      fireEvent.click(within(nextStep()).getByRole("button", { name: "Approve" }));
      const alert = await within(nextStep()).findByRole("alert");
      fireEvent.click(within(alert).getByRole("button", { name: "Reload this record" }));
      await waitFor(() => expect(within(nextStep()).queryByRole("alert")).toBeNull());
      const approve = within(nextStep()).getByRole("button", { name: "Approve" });
      expect(approve.getAttribute("aria-disabled")).toBeNull();
      expect(within(nextStep()).getByRole("button", { name: "Reject" }).getAttribute("aria-disabled")).toBeNull();
      fireEvent.click(approve);
      await waitFor(() => expect(posts(fetchMock).length).toBe(2));
    });
  });

  it("holds the decision on a resolved record", async () => {
    const fetchMock = stub({ items: [{ ...requestItem, status: "approved" }] });
    render(<GoalAdminApprovalRecord />);
    await screen.findByRole("heading", { level: 2, name: "Ref-1501" });
    expect(screen.getByText("Already resolved")).toBeTruthy();
    const approve = within(nextStep()).getByRole("button", { name: "Approve" });
    expect(approve.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(approve);
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Reject" }));
    expect(posts(fetchMock)).toEqual([]);
  });

  it("shows a credit-pack payment with its amount and the held tokens", async () => {
    route.kind = "payment"; route.id = "33";
    stub();
    render(<GoalAdminApprovalRecord />);
    expect(await screen.findByRole("heading", { level: 2, name: "Ref-PMT-1033" })).toBeTruthy();
    expect(screen.getByText("INR 396 for 4 tokens · provider_page_mismatch")).toBeTruthy();
    expect(screen.getByText("4 tokens are held until an administrator approves this payment.")).toBeTruthy();
    expect(within(history()).getByText("Payment requires review — provider_page_mismatch")).toBeTruthy();
  });

  it("shows a referrer enrollment with no credit movement", async () => {
    route.kind = "referrer_enrollment"; route.id = "77";
    stub();
    render(<GoalAdminApprovalRecord />);
    expect(await screen.findByRole("heading", { level: 2, name: "Blake" })).toBeTruthy();
    expect(screen.getByText(/work email verified for acme\.example/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "No credit movement yet" })).toBeTruthy();
    expect(within(history()).getByText("Work email verified")).toBeTruthy();
  });

  it("says so when the record is no longer in the queue", async () => {
    route.id = "999";
    stub();
    const { container } = render(<GoalAdminApprovalRecord />);
    expect(await screen.findByText("Record not found")).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(within(nextStep()).getByRole("link", { name: "Back to approvals" }).getAttribute("href")).toBe("/admin/approvals");
  });

  it("shows a loading state without claiming the record is missing", async () => {
    stub({ queue: () => new Promise<Reply>(() => {}) });
    const { container } = render(<GoalAdminApprovalRecord />);
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeTruthy());
    expect(screen.queryByText("Record not found")).toBeNull();
  });

  it("shows a failed history load with a retry as the one next step", async () => {
    const fetchMock = stub({ activity: reply({ error: "We could not load the record history" }, 500) });
    const { container } = render(<GoalAdminApprovalRecord />);
    expect(await screen.findByText("We could not load the record history")).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    // Load-truthful: describe this load attempt and give reload guidance only.
    expect(within(nextStep()).getByText("This record didn't load. Trying again only re-reads it.")).toBeTruthy();
    expect(container.textContent).not.toMatch(BANNED_CLAIMS);
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it("keeps the record hidden without administrator access", async () => {
    stub({ queue: reply({ error: "forbidden" }, 403) });
    const { container } = render(<GoalAdminApprovalRecord />);
    expect(await screen.findByText("Administrator access is required.")).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(within(nextStep()).getByRole("link", { name: "Sign in as administrator" }).getAttribute("href")).toMatch(/^\/sign-in\?returnTo=/);
    expect(screen.queryByText(/Avery|Ref-1501/)).toBeNull();
  });

  it("asks a signed-out visitor to sign in and loads nothing", () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    const { container } = render(<GoalAdminApprovalRecord />);
    assertGoalPage(container, GOAL_PAGE);
    expect(within(nextStep()).getByRole("button", { name: /Sign in/ })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
