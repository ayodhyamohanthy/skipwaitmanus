// @vitest-environment jsdom
// D-048-p3-admin-ops /admin/activity (D-048-admin.md §3): the goal page opens
// with the operator's goal line and makes the search the one next step; the
// event list keeps the kit page's server call, params, headers, empty, error
// and access wording exactly (guardrail 1), with outcome as dot + text.
// Fixtures are synthetic.
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminActivity, { GOAL_PAGE } from "./GoalAdminActivity";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() } }));

// SignInButton is deliberately absent: a page that wraps GoalButton in it nests
// one <button> inside another, which only a real browser reports.
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/admin-activity", vi.fn()],
  useSearch: () => "",
}));

beforeEach(() => { authState.isSignedIn = true; authState.getToken.mockResolvedValue("test-token"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Reply = { ok: boolean; status: number; url: string; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });

const CREATED_AT = "2026-09-02T08:00:00.000Z";
const EVENTS = [
  { id: 7, action: "admin.referral_ledger_exported", outcome: "success", resourceType: "referral_ledger", resourceId: null, companyDomain: "acme.example", metadata: '{"rowCount":14}', createdAt: CREATED_AT, actorName: "Ada Operator", actorEmail: "ada@example.com" },
  { id: 6, action: "document.upload", outcome: "denied", resourceType: "document", resourceId: "doc-9", companyDomain: null, metadata: null, createdAt: "2026-09-01T08:00:00.000Z", actorName: null, actorEmail: null },
  { id: 5, action: "otp.send", outcome: "failure", resourceType: "otp", resourceId: null, companyDomain: "wipro.example", metadata: "rate_limited", createdAt: "2026-08-31T08:00:00.000Z", actorName: "Sam Seeker", actorEmail: "sam@example.com" },
];

function stub(overrides: { events?: Reply | (() => Promise<Reply>) } = {}) {
  const value = overrides.events;
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => (typeof value === "function" ? await value() : value ?? reply({ events: EVENTS })) as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const nextStep = () => screen.getByRole("region", { name: "Your next step" });
const activityCall = (fetchMock: ReturnType<typeof stub>, index = 0) => {
  const call = fetchMock.mock.calls[index];
  return { url: String(call?.[0]), init: call?.[1] as RequestInit | undefined };
};

describe("goal /admin/activity (D-048-p3-admin-ops)", () => {
  it("opens with the goal line and the search as the one next step", async () => {
    stub();
    const { container } = renderPage(<GoalAdminActivity />);
    expect(await screen.findByText("admin.referral_ledger_exported")).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(GOAL_PAGE.goalLine).toBe("Diagnose the referral journey.");
    expect(within(nextStep()).getByRole("button", { name: "Search" })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='admin']")).toBeTruthy();
  });

  it("keeps the kit request: same path, params, bearer header and cookies", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminActivity />);
    await screen.findByText("admin.referral_ledger_exported");
    const { url, init } = activityCall(fetchMock);
    expect(url).toBe("/api/admin/activity?limit=250");
    expect(init?.headers).toEqual({ Authorization: "Bearer test-token" });
    expect(init?.credentials).toBe("include");
  });

  it("sends the searched actor and the chosen outcome on submit", async () => {
    const fetchMock = stub();
    renderPage(<GoalAdminActivity />);
    await screen.findByText("admin.referral_ledger_exported");
    fireEvent.change(screen.getByLabelText(/Search activity/), { target: { value: "avery" } });
    fireEvent.change(screen.getByLabelText(/^Outcome$/), { target: { value: "denied" } });
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Search" }));
    await waitFor(() => expect(activityCall(fetchMock, 1).url).toBe("/api/admin/activity?limit=250&query=avery&outcome=denied"));
  });

  it("shows every outcome as dot + text, never a colour chip", async () => {
    stub();
    const { container } = renderPage(<GoalAdminActivity />);
    await screen.findByText("admin.referral_ledger_exported");
    expect(screen.getAllByTestId("goal-status").map(node => node.textContent)).toEqual(["Success", "Denied", "Failure"]);
    for (const node of Array.from(container.querySelectorAll("[data-testid='goal-status']"))) expect(node.querySelector("span[aria-hidden='true']")).toBeTruthy();
  });

  it("reads the row fields the kit table showed, including the system actor", async () => {
    stub();
    renderPage(<GoalAdminActivity />);
    const row = await screen.findByRole("row", { name: /document.upload/ });
    expect(within(row).getByText("System")).toBeTruthy();
    expect(within(row).getByText("document · doc-9")).toBeTruthy();
    expect(within(row).getByText(new Date("2026-09-01T08:00:00.000Z").toLocaleString())).toBeTruthy();
  });

  it("shows a loading state without claiming an empty log", async () => {
    stub({ events: () => new Promise<Reply>(() => {}) });
    const { container } = renderPage(<GoalAdminActivity />);
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeTruthy());
    expect(screen.queryByText("No matching operational activity yet.")).toBeNull();
  });

  it("says so honestly when the log holds nothing", async () => {
    stub({ events: reply({ events: [] }) });
    renderPage(<GoalAdminActivity />);
    expect(await screen.findByText("No matching operational activity yet.")).toBeTruthy();
  });

  it("shows a failed load with a retry that runs the request again", async () => {
    const fetchMock = stub({ events: reply({ error: "We could not load operational activity" }, 500) });
    renderPage(<GoalAdminActivity />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    const before = fetchMock.mock.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    expect(screen.getByRole("alert").textContent).toContain("We could not load operational activity");
  });

  it("shows the denied wording without any events", async () => {
    stub({ events: reply({ error: "Administrator access is required" }, 403) });
    renderPage(<GoalAdminActivity />);
    expect(await screen.findByText("Administrator access is required")).toBeTruthy();
    expect(screen.queryByText(/admin\.referral_ledger_exported|otp\.send/)).toBeNull();
  });

  it("asks a signed-out visitor to sign in and loads nothing", () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    const { container } = renderPage(<GoalAdminActivity />);
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

describe("goal admin-ops sources", () => {
  it("carry no inline hex colour (status is dot + text with tokens)", () => {
    const offenders = readdirSync(__dirname)
      .filter(name => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      .filter(name => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(join(__dirname, name), "utf8")));
    expect(offenders).toEqual([]);
  });
});

// ADMIN-activity-log (D-393): filters, older pages, following one person and their request history. Synthetic data.
describe("goal /admin/activity: following a person (ADMIN-activity-log)", () => {
  const SIGN_IN_FAILURE = { id: 30, action: "auth.password_sign_in", outcome: "failure", resourceType: "auth", resourceId: null, companyDomain: null, metadata: '{"reason":"wrong_password","method":"password","maskedEmail":"n***@gmail.com","ip":"203.0.113.0/24","country":"IN","browser":"Chrome","os":"macOS","device":"desktop"}', createdAt: CREATED_AT, actorUserId: null, actorName: null, actorEmail: null };
  const SIGN_IN = { id: 29, action: "auth.social_sign_in", outcome: "success", resourceType: "auth", resourceId: null, companyDomain: null, metadata: '{"method":"google"}', createdAt: CREATED_AT, actorUserId: 41, actorName: "Asha Rao", actorEmail: "asha@example.com" };
  const TRANSITION = { id: 3, referralRequestId: 88, action: "lapse", fromStatus: "claimed", resultingStatus: "pending", actorUserId: 41, role: "seeker", createdAt: CREATED_AT };
  function routed(pages: Array<{ events: unknown[]; nextBefore: number | null }> = [{ events: [SIGN_IN_FAILURE, SIGN_IN], nextBefore: 29 }, { events: [EVENTS[0]], nextBefore: null }]) {
    let page = 0;
    const fetchMock = vi.fn(async (url: string) => (url.startsWith("/api/admin/activity/requests") ? reply({ transitions: [TRANSITION] }) : reply(pages[Math.min(page++, pages.length - 1)])) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const urls = (fetchMock: ReturnType<typeof routed>) => fetchMock.mock.calls.map(call => String(call[0]));

  it("reads a sign-in row as one line and shows the masked email of an attempt with no account", async () => {
    routed();
    renderPage(<GoalAdminActivity />);
    const row = await screen.findByRole("row", { name: /auth.password_sign_in/ });
    expect(within(row).getByText("No account")).toBeTruthy();
    expect(within(row).getByText("n***@gmail.com")).toBeTruthy();
    expect(within(row).getByText("wrong password · password · 203.0.113.0/24 IN · Chrome · macOS · desktop")).toBeTruthy();
  });

  it("sends the person, kind and dates, and loads older events with the cursor", async () => {
    const first = { events: [SIGN_IN_FAILURE, SIGN_IN], nextBefore: 29 };
    const fetchMock = routed([first, first, { events: [EVENTS[0]], nextBefore: null }]);
    renderPage(<GoalAdminActivity />);
    await screen.findByRole("row", { name: /auth.social_sign_in/ });
    fireEvent.change(screen.getByLabelText(/^Person$/), { target: { value: "asha@example.com" } });
    fireEvent.change(screen.getByLabelText(/^Kind$/), { target: { value: "auth" } });
    fireEvent.change(screen.getByLabelText(/^From$/), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText(/^To$/), { target: { value: "2026-09-30" } });
    fireEvent.click(within(nextStep()).getByRole("button", { name: "Search" }));
    await waitFor(() => expect(urls(fetchMock)).toContain("/api/admin/activity?limit=250&person=asha%40example.com&family=auth&from=2026-09-01&to=2026-09-30"));
    fireEvent.click(await screen.findByRole("button", { name: "Load older events" }));
    await waitFor(() => expect(urls(fetchMock).some(url => url.includes("&before=29"))).toBe(true));
    expect(await screen.findByText("admin.referral_ledger_exported")).toBeTruthy();
  });

  it("follows a person from a row and shows their referral request history", async () => {
    const fetchMock = routed([{ events: [SIGN_IN], nextBefore: null }]);
    renderPage(<GoalAdminActivity />);
    fireEvent.click(await screen.findByRole("button", { name: "Follow this person" }));
    await waitFor(() => expect(urls(fetchMock)).toContain("/api/admin/activity?limit=250&person=41"));
    const history = await screen.findByRole("region", { name: "Referral request history" });
    expect(await within(history).findByText("#88")).toBeTruthy();
    expect(within(history).getByText("claimed → pending")).toBeTruthy();
    expect(urls(fetchMock)).toContain("/api/admin/activity/requests?person=41");
  });
});
