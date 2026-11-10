// @vitest-environment jsdom
// D-048-p3-admin goal pages (D-048-admin.md §3-§5): /admin opens "See what
// needs a decision." with the oldest open case as the one next step;
// /admin-review opens "Decide what's waiting." with the selected case's
// decision as the one commit. The decision keeps its server call, body and
// required reviewer note exactly (guardrail 1); loading, empty, error and the
// access gate are pinned; fixtures are synthetic.
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminOverview, { GOAL_PAGE as OVERVIEW_PAGE } from "./GoalAdminOverview";
import GoalAdminReview, { GOAL_PAGE as REVIEW_PAGE } from "./GoalAdminReview";

const { authState, search } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, search: { value: "" } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/admin", vi.fn()],
  useSearch: () => search.value,
}));

beforeEach(() => { authState.isSignedIn = true; search.value = ""; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Reply = { ok: boolean; status: number; url: string; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

const HEALTH = { health: { funnel: { requestsCreated: 12, requestsClaimed: 5, decisionsRecorded: 4, waitingForCoverage: 3 }, coverageGaps: [], instrumentation: { uploadedDocuments: 0, recordedFailures: 0 } } };
const REPORTS = [
  { id: 48, reason: "Spam or repeated asks", details: "Same note 14 times", referralRequestId: 12, reportedUserId: null, urgent: true, status: "open", createdAt: "2026-09-02T08:00:00.000Z" },
  { id: 2, reason: "Something else", details: null, referralRequestId: null, reportedUserId: null, urgent: false, status: "resolved", createdAt: "2026-08-01T08:00:00.000Z", updatedAt: "2026-08-02T08:00:00.000Z" },
];
const SUGGESTIONS = [{ id: 5, companyName: "Acme Corp", website: "https://acme.example", jobFunction: "Design", votes: 3, role: "seeker", status: "open", createdAt: "2026-09-01T08:00:00.000Z" }];
const QUEUE = [
  { kind: "referrer_enrollment", id: 31, status: "pending", companyDomain: "wipro.example", createdAt: "2026-09-02T06:00:00.000Z", updatedAt: "2026-09-02T06:00:00.000Z", summary: "", meta: {} },
];

type Key = "health" | "reports" | "suggestions" | "queue" | "companies";
function stub(overrides: Partial<Record<Key, Reply | (() => Promise<Reply>)>> = {}, decision: (url: string, init?: RequestInit) => Reply = () => reply({ ok: true })) {
  const pick = (key: Key, fallback: Reply) => { const value = overrides[key]; return typeof value === "function" ? value() : value ?? fallback; };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("decision")) return decision(url, init);
    if (url.includes("flow-health")) return pick("health", reply(HEALTH));
    if (url.includes("safety-reports")) return pick("reports", reply({ reports: REPORTS }));
    if (url.includes("company-suggestions")) return pick("suggestions", reply({ suggestions: SUGGESTIONS }));
    if (url.includes("approval-queue")) return pick("queue", reply({ items: QUEUE }));
    if (url.includes("/api/admin/companies")) return pick("companies", reply({ companies: [] }));
    return reply({ error: "unexpected" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const decisionCall = (fetchMock: ReturnType<typeof stub>) => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/decision"));
  return call ? { url: String(call[0]), method: (call[1] as RequestInit | undefined)?.method, body: JSON.parse(String((call[1] as RequestInit | undefined)?.body)) } : null;
};

describe("goal /admin (D-048-p3-admin)", () => {
  it("opens with the goal line and the oldest open case as the one next step", async () => {
    stub();
    const { container } = renderPage(<GoalAdminOverview />);
    expect(await screen.findByText(/Acme Corp/)).toBeTruthy();
    assertGoalPage(container, OVERVIEW_PAGE);
    expect(OVERVIEW_PAGE.goalLine).toBe("See what needs a decision.");
    const link = within(nextStep()).getByRole("link", { name: "Open the oldest case" });
    expect(link.getAttribute("href")).toBe("/admin-review?tab=companies");
    expect(container.querySelector("[data-goal-page='admin']")).toBeTruthy();
  });

  it("shows what is waiting as dot + text counts, never fabricated", async () => {
    stub();
    renderPage(<GoalAdminOverview />);
    expect(await screen.findByText("1 enrollment waiting")).toBeTruthy();
    expect(screen.getByText("1 open report · 1 urgent")).toBeTruthy();
    expect(screen.getByText("1 company suggestion waiting")).toBeTruthy();
  });

  it("says so honestly when nothing needs a decision", async () => {
    stub({ reports: reply({ reports: [REPORTS[1]] }), suggestions: reply({ suggestions: [] }), queue: reply({ items: [] }) });
    renderPage(<GoalAdminOverview />);
    expect(await screen.findByText("Nothing needs a decision right now.")).toBeTruthy();
    expect(within(nextStep()).getByRole("link", { name: "Open the review queue" }).getAttribute("href")).toBe("/admin-review");
  });

  it("shows a loading state without claiming an empty queue", async () => {
    stub({ reports: () => new Promise<Reply>(() => {}), suggestions: () => new Promise<Reply>(() => {}), queue: () => new Promise<Reply>(() => {}), health: () => new Promise<Reply>(() => {}) });
    const { container } = renderPage(<GoalAdminOverview />);
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeTruthy());
    expect(screen.queryByText("Nothing needs a decision right now.")).toBeNull();
  });

  it("shows a failed load with a retry that runs the request again", async () => {
    const fetchMock = stub({ reports: reply({ error: "boom" }, 500) });
    renderPage(<GoalAdminOverview />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    const before = fetchMock.mock.calls.filter(([url]) => String(url).includes("safety-reports")).length;
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("safety-reports")).length).toBeGreaterThan(before));
    expect(screen.queryByText("Nothing needs a decision right now.")).toBeNull();
  });

  it("keeps operations data hidden without administrator access", async () => {
    stub({ reports: reply({ error: "forbidden" }, 403), queue: reply({ error: "forbidden" }, 403), suggestions: reply({ error: "forbidden" }, 403), health: reply({ error: "forbidden" }, 403) });
    renderPage(<GoalAdminOverview />);
    expect(await screen.findByText("Administrator access is required.")).toBeTruthy();
    expect(screen.queryByText(/Acme Corp|Spam or repeated asks/)).toBeNull();
  });

  it("asks a signed-out visitor to sign in and loads nothing", () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    renderPage(<GoalAdminOverview />);
    expect(screen.getByRole("button", { name: /Sign in/ })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("goal /admin-review (D-048-p3-admin)", () => {
  it("opens with the goal line and records the decision only with a reviewer note, on the same server call", async () => {
    const fetchMock = stub({}, (url, init) => {
      expect(url).toBe("/api/admin/safety-reports/48/decision");
      expect(JSON.parse(String(init?.body))).toEqual({ status: "resolved", note: "Confirmed spam pattern." });
      return reply({ id: 48, status: "resolved" });
    });
    search.value = "tab=reports";
    const { container } = renderPage(<GoalAdminReview />);
    expect(await screen.findByRole("heading", { level: 2, name: "Spam or repeated asks" })).toBeTruthy();
    assertGoalPage(container, REVIEW_PAGE);
    expect(REVIEW_PAGE.goalLine).toBe("Decide what's waiting.");
    const record = within(nextStep()).getByRole("button", { name: "Record decision" });
    expect(record.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: /Resolve with action/ }));
    expect(record.getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByLabelText(/Reviewer note/), { target: { value: "Confirmed spam pattern." } });
    expect(record.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(record);
    await waitFor(() => expect(decisionCall(fetchMock)).toEqual({ url: "/api/admin/safety-reports/48/decision", method: "POST", body: { status: "resolved", note: "Confirmed spam pattern." } }));
  });

  it("keeps \"Record decision\" the only filled control: kind tabs are goal filter chips and the decision radio uses the goal ink accent", async () => {
    stub();
    search.value = "tab=reports";
    const { container } = renderPage(<GoalAdminReview />);
    expect(await screen.findByRole("heading", { level: 2, name: "Spam or repeated asks" })).toBeTruthy();
    const kinds = screen.getByRole("group", { name: "Review kinds" });
    const chips = within(kinds).getAllByTestId("goal-filter-chip");
    expect(chips.map(chip => chip.textContent?.replace(/\d+$/, "").trim())).toEqual(["All", "Reports", "Verifications", "Companies"]);
    expect(chips.map(chip => chip.getAttribute("aria-pressed"))).toEqual(["false", "true", "false", "false"]);
    for (const chip of chips) expect(chip.className).not.toMatch(/bg-g-primary/);
    fireEvent.click(within(kinds).getByRole("button", { name: /^Verifications/ }));
    expect(within(kinds).getByRole("button", { name: /^Verifications/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(kinds).getByRole("button", { name: /^Reports/ }).getAttribute("aria-pressed")).toBe("false");
    const radio = await screen.findByRole("radio", { name: /^Approve/ });
    expect(radio.className).toMatch(/\baccent-g-ink\b/);
    expect(Array.from(container.querySelectorAll("[data-g-primary]")).map(node => node.textContent?.trim())).toEqual(["Record decision"]);
    for (const node of Array.from(container.querySelectorAll("[class*='bg-g-primary']"))) expect(node.closest("[data-g-primary]")).not.toBeNull();
  });

  it("records a verification decision through the approval queue with its own body", async () => {
    const fetchMock = stub({}, (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ decision: "approved", note: "Domain belongs to the company." });
      return reply({ ok: true, status: "approved" });
    });
    search.value = "tab=verifications";
    renderPage(<GoalAdminReview />);
    expect(await screen.findByRole("heading", { level: 2, name: "Work-email enrollment @wipro.example" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^Approve/ }));
    fireEvent.change(screen.getByLabelText(/Reviewer note/), { target: { value: "Domain belongs to the company." } });
    fireEvent.click(screen.getByRole("button", { name: "Record decision" }));
    await waitFor(() => expect(decisionCall(fetchMock)).toEqual({ url: "/api/admin/approval-queue/referrer_enrollment/31/decision", method: "POST", body: { decision: "approved", note: "Domain belongs to the company." } }));
  });

  it("shows a closed case's recorded decision and audit trail instead of decision controls", async () => {
    stub({ reports: reply({ reports: [REPORTS[1]] }), suggestions: reply({ suggestions: [] }), queue: reply({ items: [] }) });
    renderPage(<GoalAdminReview />);
    expect(await screen.findByText("Decision: Resolved")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Audit trail" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record decision" })).toBeNull();
  });

  it("shows an honest empty queue", async () => {
    stub({ reports: reply({ reports: [] }), suggestions: reply({ suggestions: [] }), queue: reply({ items: [] }) });
    renderPage(<GoalAdminReview />);
    expect(await screen.findByText("Nothing to review right now.")).toBeTruthy();
  });

  it("shows a loading state without claiming an empty queue", async () => {
    stub({ reports: () => new Promise<Reply>(() => {}), suggestions: () => new Promise<Reply>(() => {}), queue: () => new Promise<Reply>(() => {}) });
    const { container } = renderPage(<GoalAdminReview />);
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeTruthy());
    expect(screen.queryByText("Nothing to review right now.")).toBeNull();
  });

  it("shows a failed load with a retry while other cases stay reviewable", async () => {
    const fetchMock = stub({ suggestions: reply({ error: "boom" }, 500) });
    renderPage(<GoalAdminReview />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getAllByText(/Spam or repeated asks/).length).toBeGreaterThan(0);
    const before = fetchMock.mock.calls.filter(([url]) => String(url).includes("company-suggestions")).length;
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("company-suggestions")).length).toBeGreaterThan(before));
  });

  it("keeps queue contents hidden without administrator access", async () => {
    stub({ reports: reply({ error: "forbidden" }, 403), suggestions: reply({ error: "forbidden" }, 403), queue: reply({ error: "forbidden" }, 403) });
    renderPage(<GoalAdminReview />);
    expect(await screen.findByText("Administrator access is required.")).toBeTruthy();
    expect(screen.queryByText(/Acme Corp|Spam or repeated asks/)).toBeNull();
  });

  it("surfaces a rejected decision and keeps the note for another try", async () => {
    stub({}, () => reply({ error: "Decision conflict" }, 409));
    search.value = "tab=reports";
    renderPage(<GoalAdminReview />);
    await screen.findByRole("heading", { level: 2, name: "Spam or repeated asks" });
    fireEvent.click(screen.getByRole("radio", { name: /Resolve with action/ }));
    fireEvent.change(screen.getByLabelText(/Reviewer note/), { target: { value: "Confirmed spam pattern." } });
    fireEvent.click(screen.getByRole("button", { name: "Record decision" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText(/Reviewer note/) as HTMLTextAreaElement).value).toBe("Confirmed spam pattern.");
  });
});

describe("goal admin sources", () => {
  it("carry no inline hex colour (status is dot + text with tokens)", () => {
    const dir = __dirname;
    const offenders = readdirSync(dir).filter(name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)).filter(name => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(join(dir, name), "utf8")));
    expect(offenders).toEqual([]);
  });
});
