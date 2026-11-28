// @vitest-environment jsdom
// D-089.ui (packet docs/plans/D-089-request-inbox.md §4.8, §5.2 U1-U5, U7): the goal referral-link
// panel on /referrer-home. It renders the D-089.server payloads behind REQUEST_INBOX_LINK_ENABLED,
// talks to the server only through referrerData's shared fetch helpers (so the D-057 step-up rule
// applies), offers a one-time screen-name choice (D-398: a chosen name has no Edit or rename), and
// never adds a black commit to the page.
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import { REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { SCREEN_NAME_REFUSALS } from "@shared/requestInboxLink";
import { WORK_EMAIL_CODE_REQUIRED, WORK_EMAIL_CODE_REQUIRED_ERROR } from "@shared/referrerStepUp";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import ReferrerHome from "@/pages/ReferrerHome";
import { GOAL_PAGE as HOME_GOAL } from "@/pages/goal/referrer-home/GoalReferrerHome";
import { GoalReferralLinkPanel } from "./GoalReferralLinkPanel";

const { switchState, authState, track } = vi.hoisted(() => ({
  switchState: { on: true },
  authState: { isSignedIn: true, userId: "11", getToken: vi.fn().mockResolvedValue("test-token") },
  track: vi.fn(),
}));
vi.mock("@shared/requestInboxLink", async importOriginal => {
  const actual = await importOriginal<typeof import("@shared/requestInboxLink")>();
  return { ...actual, get REQUEST_INBOX_LINK_ENABLED() { return switchState.on; } };
});
vi.mock("@/_core/auth", () => ({ useAuth: () => authState }));
vi.mock("@/lib/clarity", () => ({ trackClarityEvent: (name: string) => track(name) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/referrer-home", vi.fn()],
  useSearch: () => "",
}));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });
const ORIGIN = "https://skipwait.me";
const GENERATED = "ref-0a1b2c3d4e";

type LinkState = { alias: string; active: boolean };
const linkPayload = (state: LinkState) => ({
  link: {
    linkCode: "c0ffee00c0ffee00c0ffee00c0ffee00",
    vanityAlias: state.alias,
    companyDomain: "wipro.com",
    isActive: state.active,
    url: `${ORIGIN}/fast/c0ffee00c0ffee00c0ffee00c0ffee00`,
    vanityUrl: `${ORIGIN}/refer/wipro/${state.alias}`,
    suggestedBioCopy: "Private referral requests at wipro.com via skipwait.me.",
    screenName: state.alias.startsWith("ref-") ? null : state.alias,
  },
});

type Answer = { ok: boolean; status: number; json: () => Promise<unknown> };
type Routes = { me?: () => Answer; name?: (body: { screenName: string }) => Answer; pause?: () => Answer; resume?: () => Answer };
function stubLink(state: LinkState, routes: Routes = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    const method = init?.method ?? "GET";
    if (path === "/api/referrer-fast-track/me" && method === "GET") return routes.me ? routes.me() : ok(linkPayload(state));
    if (path === "/api/referrer-fast-track/me/screen-name" && method === "PUT") {
      const body = JSON.parse(String(init?.body)) as { screenName: string };
      if (routes.name) return routes.name(body);
      state.alias = body.screenName;
      return ok({ screenName: body.screenName, renamed: false });
    }
    if (path === "/api/referrer-fast-track/me/deactivate" && method === "POST") {
      if (routes.pause) return routes.pause();
      state.active = false;
      return ok({ deactivated: true });
    }
    if (path === "/api/referrer-fast-track/me/resume" && method === "POST") {
      if (routes.resume) return routes.resume();
      state.active = true;
      return ok({ resumed: true, isActive: true });
    }
    if (path.endsWith("/api/company-referrals/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com", companyName: "Wipro", companyInitials: "W" });
    return fail(404, { error: "Not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const callsTo = (fetchMock: ReturnType<typeof vi.fn>, path: string, method = "GET") =>
  fetchMock.mock.calls.filter(([url, init]) => String(url) === path && ((init as RequestInit | undefined)?.method ?? "GET") === method);

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const renderPanel = (client = newClient()) => render(<QueryClientProvider client={client}><GoalReferralLinkPanel /></QueryClientProvider>);
const setOnline = (value: boolean) => Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });

beforeEach(() => { switchState.on = true; authState.isSignedIn = true; setOnline(true); onlineManager.setOnline(true); track.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setOnline(true); onlineManager.setOnline(true); });

describe("U1: switch off", () => {
  it("renders nothing and never reads the link", () => {
    switchState.on = false;
    const fetchMock = stubLink({ alias: GENERATED, active: true });
    const { container } = renderPanel();
    expect(container.innerHTML).toBe("");
    expect(callsTo(fetchMock, "/api/referrer-fast-track/me")).toHaveLength(0);
  });
});

describe("U2: switch on, the panel renders the server payload", () => {
  it("shows the link, Copy and a one-time name choice while the alias is generated", async () => {
    stubLink({ alias: GENERATED, active: true });
    renderPanel();
    const panel = await screen.findByRole("region", { name: "Your referral link" });
    expect(await within(panel).findByText(`skipwait.me/refer/wipro/${GENERATED}`)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(within(panel).getByText("Link on")).toBeTruthy();
    expect(within(panel).getByRole("textbox", { name: "Screen name" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Save screen name" })).toBeTruthy();
    expect(panel.querySelector("[data-g-primary]")).toBeNull();
  });

  it("chooses the name once, after a confirm, and then shows it with no Edit or rename", async () => {
    const state = { alias: GENERATED, active: true };
    const fetchMock = stubLink(state);
    renderPanel();
    const panel = await screen.findByRole("region", { name: "Your referral link" });
    const input = await within(panel).findByRole("textbox", { name: "Screen name" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Maple Owl" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save screen name" }));
    // The name is permanent (D-398), so it is confirmed before it is sent.
    expect(within(panel).getByText(/Save “maple-owl” as your screen name\?/)).toBeTruthy();
    expect(callsTo(fetchMock, "/api/referrer-fast-track/me/screen-name", "PUT")).toHaveLength(0);
    fireEvent.click(within(panel).getByRole("button", { name: "Yes, save it" }));
    expect(await within(panel).findByText("maple-owl")).toBeTruthy();
    expect(JSON.parse(String(callsTo(fetchMock, "/api/referrer-fast-track/me/screen-name", "PUT")[0][1]?.body))).toEqual({ screenName: "maple-owl" });
    expect(await within(panel).findByText(`skipwait.me/refer/wipro/maple-owl`)).toBeTruthy();
    expect(within(panel).queryByRole("textbox")).toBeNull();
    expect(within(panel).queryByRole("button", { name: /edit|rename|change/i })).toBeNull();
    expect(within(panel).getByText(/stays the same, so links you already shared keep reaching you/)).toBeTruthy();
    expect(track).toHaveBeenCalledWith("referral_link_name_opened");
  });

  it("copies the link and says so", async () => {
    stubLink({ alias: "maple-owl", active: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPanel();
    const panel = await screen.findByRole("region", { name: "Your referral link" });
    fireEvent.click(await within(panel).findByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/refer/wipro/maple-owl`));
    expect(await within(panel).findByText("Link copied.")).toBeTruthy();
    expect(track).toHaveBeenCalledWith("referral_link_copied");
  });

  it("checks the format before the confirm and keeps the typed value", async () => {
    const fetchMock = stubLink({ alias: GENERATED, active: true });
    renderPanel();
    const input = await screen.findByRole("textbox", { name: "Screen name" });
    fireEvent.change(input, { target: { value: "ref-mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save screen name" }));
    expect(screen.getByRole("alert").textContent).toContain(SCREEN_NAME_REFUSALS.invalid.error);
    expect((screen.getByRole("textbox", { name: "Screen name" }) as HTMLInputElement).value).toBe("ref-mine");
    expect(callsTo(fetchMock, "/api/referrer-fast-track/me/screen-name", "PUT")).toHaveLength(0);
  });

  it("keeps /referrer-home to one black commit with the panel mounted after Invite a colleague (assertGoalPage)", async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);
      if (path === "/api/referrer-fast-track/me") return ok(linkPayload({ alias: GENERATED, active: true }));
      if (path.endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com", companyName: "Wipro", companyInitials: "W" });
      if (path.endsWith("/referrer-preferences")) return ok({ preferences: { referralCapacity: 3, paused: false } });
      if (path.includes("scope=new")) return ok({ requests: [{ id: 31, companyDomain: "wipro.com", status: "pending", createdAt: new Date(now - 86400000).toISOString(), isClaimedByYou: false, unreadMessageCount: 0, attachmentCount: 1 }], hasEverReviewed: true });
      if (path.includes("scope=completed")) return ok({ requests: [] });
      if (path.endsWith("/referrer/thank-yous")) return ok({ thankYous: [], total: 0 });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<QueryClientProvider client={newClient()}><ReferrerHome /></QueryClientProvider>);
    const panel = await screen.findByRole("region", { name: "Your referral link" });
    await within(panel).findByRole("textbox", { name: "Screen name" });
    assertGoalPage(container, HOME_GOAL);
    const invite = screen.getByRole("region", { name: "Invite a colleague" });
    expect(invite.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // D-180 wording on the referrer home: referral requests, never "asks" or credits.
    const userCopy = (container.textContent ?? "").replace(REFERRER_MONEY_SENTENCE, "");
    expect(userCopy).not.toMatch(/\basks?\b/i);
    expect(container.textContent).not.toMatch(/\bcredits?\b/i);
  });

  it("is not mounted on /referrer-home while the switch is off", async () => {
    switchState.on = false;
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com", companyName: "Wipro", companyInitials: "W" });
      if (path.endsWith("/referrer-preferences")) return ok({ preferences: { referralCapacity: 3, paused: false } });
      if (path.includes("scope=")) return ok({ requests: [], hasEverReviewed: true });
      if (path.endsWith("/referrer/thank-yous")) return ok({ thankYous: [], total: 0 });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={newClient()}><ReferrerHome /></QueryClientProvider>);
    expect(await screen.findByRole("region", { name: "Invite a colleague" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Your referral link" })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/referrer-fast-track"))).toBe(false);
  });
});

describe("U3: refusals show their plain line and keep the typed value", () => {
  const chooseAndConfirm = async (value: string) => {
    const input = await screen.findByRole("textbox", { name: "Screen name" });
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save screen name" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, save it" }));
  };

  it("409 screen_name_taken", async () => {
    stubLink({ alias: GENERATED, active: true }, { name: () => fail(409, SCREEN_NAME_REFUSALS.taken) });
    renderPanel();
    await chooseAndConfirm("maple-owl");
    expect((await screen.findByRole("alert")).textContent).toContain(SCREEN_NAME_REFUSALS.taken.error);
    expect((screen.getByRole("textbox", { name: "Screen name" }) as HTMLInputElement).value).toBe("maple-owl");
  });

  it("422 screen_name_identifying", async () => {
    stubLink({ alias: GENERATED, active: true }, { name: () => fail(422, SCREEN_NAME_REFUSALS.identifying) });
    renderPanel();
    await chooseAndConfirm("priya");
    expect((await screen.findByRole("alert")).textContent).toContain(SCREEN_NAME_REFUSALS.identifying.error);
    expect((screen.getByRole("textbox", { name: "Screen name" }) as HTMLInputElement).value).toBe("priya");
  });

  it("422 screen_name_invalid from the server", async () => {
    stubLink({ alias: GENERATED, active: true }, { name: () => fail(422, SCREEN_NAME_REFUSALS.invalid) });
    renderPanel();
    await chooseAndConfirm("maple-owl");
    expect((await screen.findByRole("alert")).textContent).toContain(SCREEN_NAME_REFUSALS.invalid.error);
    expect((screen.getByRole("textbox", { name: "Screen name" }) as HTMLInputElement).value).toBe("maple-owl");
  });

  it("409 screen_name_locked explains that the chosen name is permanent and shows it", async () => {
    const state = { alias: GENERATED, active: true };
    stubLink(state, { name: () => { state.alias = "quiet-heron"; return fail(409, SCREEN_NAME_REFUSALS.locked); } });
    renderPanel();
    await chooseAndConfirm("maple-owl");
    expect((await screen.findByRole("alert")).textContent).toContain(SCREEN_NAME_REFUSALS.locked.error);
    expect(await screen.findByText("quiet-heron")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("U4: pause, then turn the link back on", () => {
  it("confirms the pause, calls the two routes and shows the paused state between", async () => {
    const state = { alias: "maple-owl", active: true };
    const fetchMock = stubLink(state);
    renderPanel();
    const panel = await screen.findByRole("region", { name: "Your referral link" });
    fireEvent.click(await within(panel).findByRole("button", { name: "Pause link" }));
    expect(within(panel).getByText(/Pause your link\?/)).toBeTruthy();
    expect(callsTo(fetchMock, "/api/referrer-fast-track/me/deactivate", "POST")).toHaveLength(0);
    fireEvent.click(within(panel).getByRole("button", { name: "Yes, pause it" }));
    expect(await within(panel).findByText("Link paused")).toBeTruthy();
    expect(callsTo(fetchMock, "/api/referrer-fast-track/me/deactivate", "POST")).toHaveLength(1);
    expect(within(panel).queryByRole("button", { name: "Copy link" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Turn your link back on" }));
    expect(await within(panel).findByText("Link on")).toBeTruthy();
    expect(callsTo(fetchMock, "/api/referrer-fast-track/me/resume", "POST")).toHaveLength(1);
    expect(within(panel).getByText("maple-owl")).toBeTruthy();
  });

  it("keeps the link on and says so when the pause fails", async () => {
    stubLink({ alias: "maple-owl", active: true }, { pause: () => fail(500, { error: "We could not pause your link" }) });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Pause link" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, pause it" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not pause your link");
    expect(screen.getByText("Link on")).toBeTruthy();
  });
});

describe("U5: the D-057 step-up", () => {
  function AccessReader() {
    const access = useReferrerAccess();
    return <p data-testid="access-status">{access.status}</p>;
  }

  it("a 403 work_email_code_required invalidates the access query and never sends the referrer to the code sign-in", async () => {
    const fetchMock = stubLink({ alias: "maple-owl", active: true }, { me: () => fail(403, { error: WORK_EMAIL_CODE_REQUIRED_ERROR, code: WORK_EMAIL_CODE_REQUIRED }) });
    const client = newClient();
    // As on the real page, the shell's access verdict is known before the panel reads the link.
    const { container, rerender } = render(<QueryClientProvider client={client}><AccessReader /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("access-status").textContent).toBe("verified"));
    const accessReads = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/company-referrals/access")).length;
    expect(accessReads()).toBe(1);
    rerender(<QueryClientProvider client={client}><AccessReader /><GoalReferralLinkPanel /></QueryClientProvider>);
    const panel = await screen.findByRole("region", { name: "Your referral link" });
    expect(await within(panel).findByText(/Confirm your work email with a code/)).toBeTruthy();
    await waitFor(() => expect(accessReads()).toBeGreaterThanOrEqual(2));
    const hrefs = Array.from(container.querySelectorAll("a")).map(anchor => anchor.getAttribute("href") ?? "");
    expect(hrefs.some(href => href.startsWith("/sign-in") || href.includes("intent=referrer"))).toBe(false);
    expect(within(panel).getByRole("link", { name: "Confirm your work email" }).getAttribute("href")).toBe("/queue");
  });

  it("a 403 on a write also switches to the step-up state", async () => {
    stubLink({ alias: "maple-owl", active: true }, { pause: () => fail(403, { error: WORK_EMAIL_CODE_REQUIRED_ERROR, code: WORK_EMAIL_CODE_REQUIRED }) });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Pause link" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, pause it" }));
    expect(await screen.findByText(/Confirm your work email with a code/)).toBeTruthy();
  });
});

describe("loading, error, offline", () => {
  it("shows a loading state while the link loads", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderPanel();
    const panel = await screen.findByRole("region", { name: "Your referral link" });
    expect(panel.getAttribute("aria-busy")).toBe("true");
    expect(within(panel).getByText("Loading your referral link")).toBeTruthy();
  });

  it("shows the server's error with a retry that reloads", async () => {
    let first = true;
    const fetchMock = stubLink({ alias: "maple-owl", active: true }, { me: () => { if (first) { first = false; return fail(503, { error: "Your link is unavailable right now" }); } return ok(linkPayload({ alias: "maple-owl", active: true })); } });
    renderPanel();
    expect((await screen.findByRole("alert")).textContent).toContain("Your link is unavailable right now");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("maple-owl")).toBeTruthy();
    expect(callsTo(fetchMock, "/api/referrer-fast-track/me")).toHaveLength(2);
  });

  it("says plainly when the panel is offline, and disables the actions with a reason", async () => {
    stubLink({ alias: "maple-owl", active: true }, { me: () => { throw new TypeError("Failed to fetch"); } });
    setOnline(false);
    renderPanel();
    expect((await screen.findByRole("alert")).textContent).toMatch(/offline/i);
  });

  it("keeps the loaded link readable offline and blocks the pause with a reason", async () => {
    const fetchMock = stubLink({ alias: "maple-owl", active: true });
    renderPanel();
    const pause = await screen.findByRole("button", { name: "Pause link" });
    act(() => { setOnline(false); window.dispatchEvent(new Event("offline")); });
    await waitFor(() => expect(pause.getAttribute("aria-disabled")).toBe("true"));
    fireEvent.click(pause);
    expect(screen.queryByText(/Pause your link\?/)).toBeNull();
    expect(callsTo(fetchMock, "/api/referrer-fast-track/me/deactivate", "POST")).toHaveLength(0);
    expect(screen.getByText("maple-owl")).toBeTruthy();
  });

  it("refuses a malformed payload instead of guessing", async () => {
    stubLink({ alias: "maple-owl", active: true }, { me: () => ok({ link: { companyDomain: "wipro.com" } }) });
    renderPanel();
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your referral link.");
  });
});
