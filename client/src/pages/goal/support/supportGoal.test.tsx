// @vitest-environment jsdom
// Goal /help, /report and /safety (D-048-p3-support; packet docs/plans/D-048-account.md).
// Behind goalSurfaceOn('support'): each page opens with its goal line and one
// "Your next step" block holding the single black commit; every kit behaviour
// is kept (help search and categories, the live policy links, the 3-step
// report with its block toggle and urgency, the safety answers and links);
// money lines come from shared/moneyCopy.ts; a failed report or block says so
// and never shows as filed; offline, the report's commit names why it waits.
// Flag off, the kit pages render unchanged.
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_COST_SENTENCE, CREDIT_RULE, MONEY_SENTENCE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { FREE_PLAN } from "@shared/planCatalog";
import { assertGoalPage } from "@/test/goalPageContract";

const { authState, flagState, go } = vi.hoisted(() => ({
  authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") },
  flagState: { on: true },
  go: vi.fn(),
}));
vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  SignInButton: ({ children }: { children?: React.ReactNode }) => <div data-testid="sign-in-button">{children}</div>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/report", go],
}));
vi.mock("@/lib/goalSurfaces", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/goalSurfaces")>();
  return { ...actual, goalSurfaceOn: (id: string) => flagState.on && id === "support" };
});

import Help from "../../Help";
import Report from "../../Report";
import Safety from "../../Safety";

// Goal lines: /help and /report from the packet's design acceptance notes;
// /safety proposed by this row from the doctrine (no contract line existed).
const HELP_LINE = "Get help.";
const REPORT_LINE = "Report a problem.";
const SAFETY_LINE = "Stay safe on SkipWait.";

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });

function at(url: string) {
  const actual = window.location;
  Object.defineProperty(window, "location", { configurable: true, value: new URL(url) });
  return () => Object.defineProperty(window, "location", { configurable: true, value: actual });
}
function offline() {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
  return () => Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
}
const primary = (container: HTMLElement) => container.querySelector("[data-g-primary]") as HTMLElement | null;

// The page files load their goal versions lazily; warm those chunks once so a
// cold transform on a slow disk never outlasts the first findBy* timeout.
beforeAll(async () => {
  await Promise.all([import("./GoalHelp"), import("./GoalReport"), import("./GoalSafety")]);
}, 60_000);
beforeEach(() => { flagState.on = true; authState.isSignedIn = true; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal /help", () => {
  it("meets the goal page contract without any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<Help />);
    await screen.findByRole("heading", { level: 1, name: HELP_LINE });
    assertGoalPage(container, { goalLine: HELP_LINE });
    expect(container.querySelector('[data-goal-page="help"]')).toBeTruthy();
    expect(primary(container)?.textContent).toBe("Contact support");
    expect(primary(container)?.getAttribute("href")).toBe("/support");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the live policy links and the money lines from shared/moneyCopy.ts", async () => {
    render(<Help />);
    await screen.findByRole("heading", { level: 1, name: HELP_LINE });
    const policies = screen.getByRole("navigation", { name: "Rules & policies" });
    expect(within(policies).getByRole("link", { name: "Community guidelines" }).getAttribute("href")).toBe("/guidelines");
    expect(within(policies).getByRole("link", { name: "Terms of service" }).getAttribute("href")).toBe("/terms");
    expect(within(policies).getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
    expect(within(policies).getByRole("link", { name: "Safety" }).getAttribute("href")).toBe("/safety");
    // The first answer is open, as on the kit page: the D-063 sentence, then the ledger rule.
    expect(screen.getByText(`${ASK_COST_SENTENCE} ${CREDIT_RULE} ${REFERRER_MONEY_SENTENCE}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "How many asks can I have open?" }));
    expect(screen.getByText(new RegExp(`^Free: ${FREE_PLAN.openRequests} at a time\\.`))).toBeTruthy();
    expect(screen.queryByText(/paid plans/)).toBeNull();
  });

  it("searches and filters honestly: no match says so, never a silent blank list", async () => {
    render(<Help />);
    const search = await screen.findByRole("searchbox", { name: "Search help" });
    fireEvent.change(search, { target: { value: "zzz-no-such-topic" } });
    expect(screen.getByText(/No answers for “zzz-no-such-topic”/)).toBeTruthy();
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Safety", pressed: false }));
    expect(screen.getByRole("button", { name: "Safety", pressed: true })).toBeTruthy();
    const questions = within(screen.getByRole("list", { name: "Answers" })).getAllByRole("button").map(button => button.textContent);
    expect(questions).toEqual(["Someone asked me for money.", "How do I block someone?"]);
  });
});

describe("goal /safety", () => {
  it("meets the contract and keeps every kit answer and link", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<Safety />);
    await screen.findByRole("heading", { level: 1, name: SAFETY_LINE });
    assertGoalPage(container, { goalLine: SAFETY_LINE });
    expect(container.querySelector('[data-goal-page="safety"]')).toBeTruthy();
    expect(screen.getByText(`${MONEY_SENTENCE} There are no commissions and no paid priority: a referral is a voluntary introduction, not a purchase.`)).toBeTruthy();
    expect(screen.getByText("Resumes stay private until a referrer accepts a request.")).toBeTruthy();
    expect(screen.getByText(/ownership of an email address on an approved company domain/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Report" }).getAttribute("href")).toBe("/report");
    expect(primary(container)?.getAttribute("href")).toBe("/explore");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("goal /report", () => {
  it("signed out: one commit, a sign-in, and no network call", async () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<Report />);
    await screen.findByRole("heading", { level: 1, name: REPORT_LINE });
    assertGoalPage(container, { goalLine: REPORT_LINE });
    expect(within(screen.getByTestId("sign-in-button")).getByRole("button", { name: "Sign in" })).toBe(primary(container));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the 3-step shape with one commit per step and files the real reference", async () => {
    const fetchMock = vi.fn(async () => ok({ report: { id: 48, reference: "R-1048", urgent: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<Report />);
    await screen.findByRole("heading", { level: 1, name: REPORT_LINE });
    assertGoalPage(container, { goalLine: REPORT_LINE });
    expect(screen.getByRole("heading", { level: 2, name: "What's going on?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Fake job or scam/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    assertGoalPage(container, { goalLine: REPORT_LINE });
    expect(screen.getByRole("heading", { level: 2, name: "Add details" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/What happened/), { target: { value: "Suspicious fee request" } });
    fireEvent.click(screen.getByRole("button", { name: /I feel unsafe/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Thanks. We're on it." })).toBeTruthy();
    assertGoalPage(container, { goalLine: REPORT_LINE });
    expect(screen.getByText(/reference #R-1048/)).toBeTruthy();
    expect(screen.getByText("Within 4 hours")).toBeTruthy();
    expect(screen.getByText(/immediate danger, contact local emergency services first/)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body?: string; method?: string }];
    expect(url).toBe("/api/safety-reports");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ reason: "Fake job or scam", details: "Suspicious fee request", urgent: true });
  });

  it("a refused report says so in the server's words and is never shown as filed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(429, { error: "You have filed several reports in a short time. Try again in a few minutes." })));
    render(<Report />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect((await screen.findByRole("alert")).textContent).toContain("You have filed several reports in a short time.");
    expect(screen.queryByText(/We're on it/)).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Add details" })).toBeTruthy();
  });

  it("from a conversation: blocks the other person after filing, and a failed block keeps the report", async () => {
    const restore = at("https://skipwait.me/report?request=42");
    try {
      const fetchMock = vi.fn(async (url: string) => (String(url).startsWith("/api/blocks") ? fail(500, { error: "boom" }) : ok({ report: { id: 48, reference: "R-1048" } })));
      vi.stubGlobal("fetch", fetchMock);
      render(<Report />);
      expect(await screen.findByRole("button", { name: "Back to conversation" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      fireEvent.click(screen.getByRole("button", { name: /Also block this person/ }));
      fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Thanks. We're on it." })).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/block did not go through/);
      expect(screen.queryByText(/This person is blocked/)).toBeNull();
      expect(screen.getByRole("link", { name: "Manage blocked people" }).getAttribute("href")).toBe("/settings");
      const blockCall = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/blocks")) as unknown as [string, { body?: string }];
      expect(JSON.parse(String(blockCall[1].body))).toEqual({ referralRequestId: 42 });
    } finally {
      restore();
    }
  });

  it("without a conversation: no block toggle, the support route is honest and stays on the done step", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ report: { id: 49, reference: "R-1049" } })));
    render(<Report />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("button", { name: /Also block this person/ })).toBeNull();
    expect(screen.getByText(/blocking both directions is handled by our team/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect((await screen.findByRole("link", { name: "Contact support" })).getAttribute("href")).toBe("/support");
    expect(screen.queryByRole("link", { name: "Manage blocked people" })).toBeNull();
    expect(screen.getByText("Within 48 hours")).toBeTruthy();
  });

  it("offline: the submit commit names why it waits and sends nothing", async () => {
    const restore = offline();
    try {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      render(<Report />);
      fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
      const submit = screen.getByRole("button", { name: "Submit report" });
      expect(submit.getAttribute("aria-disabled")).toBe("true");
      expect(screen.getByText(/You're offline/)).toBeTruthy();
      fireEvent.click(submit);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe("flag off: the kit pages render unchanged", () => {
  it("renders the kit help, safety and report pages", () => {
    flagState.on = false;
    vi.stubGlobal("fetch", vi.fn());
    const help = render(<Help />);
    expect(screen.getByText("How can we help")).toBeTruthy();
    expect(help.container.querySelector("[data-goal-page]")).toBeNull();
    help.unmount();
    const safety = render(<Safety />);
    expect(screen.getByText(/Help & safety/)).toBeTruthy();
    expect(safety.container.querySelector("[data-goal-page]")).toBeNull();
    safety.unmount();
    const report = render(<Report />);
    expect(screen.getByRole("heading", { level: 1, name: "What's going on?" })).toBeTruthy();
    expect(report.container.querySelector("[data-goal-page]")).toBeNull();
  });
});
