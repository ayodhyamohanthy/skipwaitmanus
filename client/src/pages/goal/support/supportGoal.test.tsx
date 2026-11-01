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
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_COST_SENTENCE, CREDIT_RULE, MONEY_SENTENCE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { FREE_PLAN } from "@shared/planCatalog";
import { assertGoalPage } from "@/test/goalPageContract";
import { HELP_ANSWERS, REPORT_REASONS, SAFETY_ANSWERS } from "./supportContent";

const { authState, flagState, go } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() },
  flagState: { on: true },
  go: vi.fn(),
}));
vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  // Mirrors client/src/_core/auth.tsx: a child that is not a plain <button> is
  // wrapped in SignInButton's own <button>, so a GoalButton child nests.
  SignInButton: ({ children }: { children?: React.ReactNode }) => <button type="button" data-testid="sign-in-button" onClick={() => authState.openSignIn()}>{children}</button>,
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

const DAILY_CAP = "You have filed several reports today. Contact support directly for anything urgent.";
// Fixed plain lines (review 6562676959): never the browser's raw "Failed to fetch".
const REPORT_FAILED = "We could not file this report. Try again in a moment, or contact support.";
const REPORT_NETWORK = "We couldn't reach SkipWait, so your report was not sent. Check your connection and submit again.";
const BLOCK_FAILED = "Your report was filed, but the block did not go through. Try blocking again, or contact support.";
const BLOCK_NETWORK = "Your report was filed, but we couldn't reach SkipWait to block this person. Check your connection and try blocking again.";
const OFFLINE_VISIBLE = "Nothing is sent while you're offline; reconnect to send your report.";
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
beforeEach(() => { flagState.on = true; authState.isLoaded = true; authState.isSignedIn = true; authState.openSignIn.mockReset(); go.mockReset(); });
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
    fireEvent.click(screen.getByRole("button", { name: "How many referral requests can I have open?" }));
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
    expect(screen.getByRole("button", { name: "Sign in" })).toBe(primary(container));
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

  it("a refused report (the server's daily cap: HTTP 400) says so in the server's words and is never shown as filed", async () => {
    // server/db.ts createSafetyReport: the 20-a-day cap throws this line; the route answers 400.
    vi.stubGlobal("fetch", vi.fn(async () => fail(400, { error: DAILY_CAP })));
    render(<Report />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect((await screen.findByRole("alert")).textContent).toBe(DAILY_CAP);
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

// Corrections for review comment 6562676959 on PR #954 (red first).
function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
  act(() => { window.dispatchEvent(new Event(value ? "online" : "offline")); });
}
const callsTo = (mock: ReturnType<typeof vi.fn>, path: string) => mock.mock.calls.filter(([url]) => String(url).startsWith(path)).length;
async function fileWithBlock(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  render(<Report />);
  fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: /Also block this person/ }));
  fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
  expect(await screen.findByRole("heading", { level: 2, name: "Thanks. We're on it." })).toBeTruthy();
}

describe("review 6562676959: failed block recovery (finding 1)", () => {
  it("offers a block-only retry and support, never a Settings block, a second report or a false 'blocked'", async () => {
    const restore = at("https://skipwait.me/report?request=42");
    try {
      let blockAttempts = 0;
      const fetchMock = vi.fn(async (url: string) => {
        if (String(url).startsWith("/api/blocks")) { blockAttempts += 1; return blockAttempts === 1 ? fail(500, { error: "boom" }) : ok({ ok: true }); }
        return ok({ report: { id: 48, reference: "R-1048" } });
      });
      await fileWithBlock(fetchMock);
      expect(screen.getByRole("alert").textContent).toBe(BLOCK_FAILED);
      expect(screen.queryByText(/block from Settings/)).toBeNull();
      expect(screen.queryByText(/This person is blocked/)).toBeNull();
      expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/support");
      fireEvent.click(screen.getByRole("button", { name: "Try blocking again" }));
      expect(await screen.findByText(/This person is blocked\./)).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText(/reference #R-1048/)).toBeTruthy();
      expect(callsTo(fetchMock, "/api/safety-reports")).toBe(1);
      expect(callsTo(fetchMock, "/api/blocks")).toBe(2);
      const retry = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/blocks"))[1] as unknown as [string, { body?: string; method?: string }];
      expect(retry[1].method).toBe("POST");
      expect(JSON.parse(String(retry[1].body))).toEqual({ referralRequestId: 42 });
    } finally {
      restore();
    }
  });

  it("a retry that fails again keeps the filed report and the recovery, and files nothing twice", async () => {
    const restore = at("https://skipwait.me/report?request=42");
    try {
      const fetchMock = vi.fn(async (url: string) => (String(url).startsWith("/api/blocks") ? fail(500, {}) : ok({ report: { id: 48, reference: "R-1048" } })));
      await fileWithBlock(fetchMock);
      fireEvent.click(screen.getByRole("button", { name: "Try blocking again" }));
      await vi.waitFor(() => expect(callsTo(fetchMock, "/api/blocks")).toBe(2));
      expect((await screen.findByRole("alert")).textContent).toBe(BLOCK_FAILED);
      expect(screen.getByRole("button", { name: "Try blocking again" })).toBeTruthy();
      expect(screen.queryByText(/This person is blocked/)).toBeNull();
      expect(screen.getByText(/reference #R-1048/)).toBeTruthy();
      expect(callsTo(fetchMock, "/api/safety-reports")).toBe(1);
    } finally {
      restore();
    }
  });
});

describe("review 6562676959: rejected fetch while navigator.onLine is true (finding 2)", () => {
  it("report: a fixed plain line with a next step, never 'Failed to fetch', and not filed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<Report />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect((await screen.findByRole("alert")).textContent).toBe(REPORT_NETWORK);
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(screen.queryByText(/We're on it/)).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Add details" })).toBeTruthy();
  });

  it("block: the report stays filed, a fixed plain line with a next step, never 'Failed to fetch'", async () => {
    const restore = at("https://skipwait.me/report?request=42");
    try {
      const fetchMock = vi.fn(async (url: string) => {
        if (String(url).startsWith("/api/blocks")) throw new TypeError("Failed to fetch");
        return ok({ report: { id: 48, reference: "R-1048" } });
      });
      await fileWithBlock(fetchMock);
      expect(screen.getByRole("alert").textContent).toBe(BLOCK_NETWORK);
      expect(screen.queryByText(/Failed to fetch/)).toBeNull();
      expect(screen.getByText(/reference #R-1048/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Try blocking again" })).toBeTruthy();
      expect(callsTo(fetchMock, "/api/safety-reports")).toBe(1);
    } finally {
      restore();
    }
  });
});

describe("review 6562676959: help wording matches the support action's position (finding 3)", () => {
  it("the no-match line points up to Contact support, which sits above the answers", async () => {
    render(<Help />);
    const search = await screen.findByRole("searchbox", { name: "Search help" });
    fireEvent.change(search, { target: { value: "zzz-no-such-topic" } });
    expect(screen.getByText("Try another word, or contact support above.")).toBeTruthy();
    const contact = screen.getByRole("link", { name: "Contact support" });
    const answers = screen.getByRole("list", { name: "Answers" });
    expect(contact.compareDocumentPosition(answers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("review 6562676959: the visible offline line and its transitions (finding 4)", () => {
  afterEach(() => { Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true }); });

  it("offline on arrival: the visible line is on screen, not only the screen-reader reason", async () => {
    setOnline(false);
    vi.stubGlobal("fetch", vi.fn());
    render(<Report />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    const line = screen.getByText(OFFLINE_VISIBLE);
    expect(line.closest(".sr-only")).toBeNull();
    expect(line.tagName).toBe("P");
  });

  it("online -> offline -> online: the line and the waiting commit follow the connection", async () => {
    const fetchMock = vi.fn(async () => ok({ report: { id: 50, reference: "R-1050" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Report />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.queryByText(OFFLINE_VISIBLE)).toBeNull();
    expect(screen.getByRole("button", { name: "Submit report" }).getAttribute("aria-disabled")).not.toBe("true");
    setOnline(false);
    expect(screen.getByText(OFFLINE_VISIBLE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit report" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(fetchMock).not.toHaveBeenCalled();
    setOnline(true);
    expect(screen.queryByText(OFFLINE_VISIBLE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Thanks. We're on it." })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("review 6562676959: generic refusal stays separate from the daily cap (finding 5)", () => {
  it("a failure with no server words shows the fixed line with a next step and is never filed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(500, {})));
    render(<Report />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect((await screen.findByRole("alert")).textContent).toBe(REPORT_FAILED);
    expect(screen.queryByText(/We're on it/)).toBeNull();
  });
});

describe("review 6562676959: referral vocabulary, D-180 (finding 6)", () => {
  it("shows 'Spam or repeated requests' but submits the stored value byte for byte", async () => {
    const fetchMock = vi.fn(async () => ok({ report: { id: 51, reference: "R-1051" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Report />);
    expect(screen.queryByRole("radio", { name: /repeated asks/ })).toBeNull();
    fireEvent.click(await screen.findByRole("radio", { name: "Spam or repeated requests" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByRole("heading", { level: 2, name: "Thanks. We're on it." });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body?: string }];
    expect(JSON.parse(String(init.body)).reason).toBe("Spam or repeated asks");
  });

  it("no goal-owned copy uses the noun ask/asks; imported money lines are left as they are", () => {
    const moneyLines = [ASK_COST_SENTENCE, CREDIT_RULE, REFERRER_MONEY_SENTENCE, MONEY_SENTENCE];
    const strip = (text: string) => moneyLines.reduce((rest, line) => rest.split(line).join(""), text);
    const owned = [
      ...HELP_ANSWERS.flatMap(({ question, answer }) => [question, strip(answer)]),
      ...SAFETY_ANSWERS.flatMap(([question, answer]) => [question, strip(answer)]),
      ...REPORT_REASONS.map(([label]) => label),
    ];
    expect(owned.filter(text => /\basks?\b/i.test(text))).toEqual([]);
  });
});

describe("review 6562676959: additional items that reproduce in the owned files", () => {
  it("auth still loading: no sign-in flash, no network call", async () => {
    authState.isLoaded = false;
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Report />);
    await screen.findByRole("heading", { level: 1, name: REPORT_LINE });
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signed out: the Sign in commit is one button, not nested in another, and opens sign-in", async () => {
    authState.isSignedIn = false;
    vi.stubGlobal("fetch", vi.fn());
    const { container } = render(<Report />);
    const signIn = await screen.findByRole("button", { name: "Sign in" });
    expect(signIn).toBe(primary(container));
    expect(signIn.parentElement?.closest("button")).toBeNull();
    expect(container.querySelectorAll("button button")).toHaveLength(0);
    fireEvent.click(signIn);
    expect(authState.openSignIn).toHaveBeenCalledTimes(1);
  });

  it("an error does not linger after Back and Continue", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(400, { error: DAILY_CAP })));
    render(<Report />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
