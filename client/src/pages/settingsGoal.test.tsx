// @vitest-environment jsdom
// D-048-p3-settings: the goal rebuild of /settings. Section order, every
// privacy control and every destructive confirm stay exactly as the kit page
// has them (packet docs/plans/D-048-account.md). The kit page stays byte
// identical and is rendered here with the surface flag off to prove the switch.
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";
import { GOAL_PAGE } from "./goal/settings/GoalSettings";
import { assertGoalPage } from "@/test/goalPageContract";
import { setDisplayPrefs } from "@/lib/displayPrefs";
import { browserPaymentRoute } from "@/lib/paymentRoute";

const { authState, surfaces, consent } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") },
  surfaces: { on: new Set<string>() },
  consent: { state: { data: undefined as unknown, isLoading: false } as Record<string, unknown>, grant: vi.fn(), revoke: vi.fn() },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    talentConsent: {
      state: { useQuery: () => consent.state },
      grant: { useMutation: () => ({ mutate: consent.grant, isPending: false }) },
      revoke: { useMutation: () => ({ mutate: consent.revoke, isPending: false }) },
    },
    useUtils: () => ({ talentConsent: { state: { invalidate: vi.fn() } } }),
  },
}));

type Reply = { status: number; body: unknown };
const ok = (body: unknown): Reply => ({ status: 200, body });
const reply = (status: number, body: unknown): Reply => ({ status, body });
const asResponse = ({ status, body }: Reply) => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) });

const VERIFIED = ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com", companyName: "Wipro", companyInitials: "W" });
const SESSIONS = (rows: unknown[]) => ok({ sessions: rows, currentKnown: true });
const PREFS = ok({ preferences: { notifyNewAsk: true } });

const DEFAULTS: Record<string, Reply> = {
  "GET /api/company-referrals/access": VERIFIED,
  "GET /api/blocks/mine": ok({ blocks: [] }),
  "DELETE /api/blocks/:id": ok({}),
  "GET /api/privacy/requests": ok({ requests: [] }),
  "GET /api/privacy/export-requests/latest": ok({ export: null }),
  "POST /api/privacy/export-requests": ok({ id: 3 }),
  "GET /api/privacy/export-requests/:id/download": ok({}),
  "POST /api/privacy/requests/erasure": ok({ request: { alreadyRequested: false } }),
  "GET /api/referrer-preferences": PREFS,
  "PUT /api/referrer-preferences": PREFS,
  "GET /api/referrer/slack-webhook": ok({ connected: false, active: false }),
  "PUT /api/referrer/slack-webhook": ok({ connected: true, active: true }),
  "DELETE /api/referrer/slack-webhook": ok({ connected: false, active: false }),
  "PUT /api/account/preferences": ok({ preferences: { notifyNewAsk: true } }),
  "GET /api/account/sessions": SESSIONS([]),
  "DELETE /api/account/sessions/:id": ok({}),
  "POST /api/account/sessions/revoke-others": ok({}),
};

/** Routes `${METHOD} ${path}` to a queue of replies (the last reply repeats) and records the calls. */
function stubApi(overrides: Record<string, Reply[]> = {}) {
  const calls: { method: string; path: string; body: string | null }[] = [];
  const queues: Record<string, Reply[]> = {};
  for (const key of Array.from(new Set([...Object.keys(DEFAULTS), ...Object.keys(overrides)]))) queues[key] = [...(overrides[key] ?? [DEFAULTS[key] ?? ok({})])];
  const next = (key: string) => { const queue = queues[key] ?? [ok({})]; return queue.length > 1 ? queue.shift()! : queue[0]; };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const path = String(url);
    calls.push({ method, path, body: init?.body == null ? null : String(init.body) });
    const exact = `${method} ${path}`;
    if (queues[exact]) return asResponse(next(exact));
    if (path.startsWith("/api/blocks/")) return asResponse(next("DELETE /api/blocks/:id"));
    if (path.startsWith("/api/account/sessions/")) return asResponse(next(`${method} ${path.startsWith("/api/account/sessions/revoke-others") ? "/api/account/sessions/revoke-others" : "/api/account/sessions/:id"}`));
    if (path.startsWith("/api/privacy/export-requests/")) return asResponse(next("GET /api/privacy/export-requests/:id/download"));
    throw new Error(`unexpected ${method} ${path}`);
  }));
  return calls;
}

const renderAt = (search = "") => {
  window.history.replaceState({}, "", `/settings${search}`);
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Settings /></QueryClientProvider>);
};

const primary = (container: HTMLElement) => container.querySelectorAll("[data-g-primary]");
const nextStep = (container: HTMLElement) => container.querySelector("section[aria-labelledby='goal-next-step-heading']");

beforeEach(() => {
  authState.isLoaded = true;
  authState.isSignedIn = true;
  surfaces.on = new Set(["settings"]);
  consent.state = { data: { active: false, policyVersion: "2026-10-01", audience: "Approved employers on skipwait.me", retentionDays: 90, unlockCreditCost: 5, unlockDays: 30 }, isLoading: false };
  consent.grant.mockReset();
  consent.revoke.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  surfaces.on = new Set<string>();
  setDisplayPrefs({ timeZone: null, dateFormat: null }, false);
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("Goal /settings switch", () => {
  it("keeps the kit page when the surface flag is off", () => {
    surfaces.on = new Set();
    stubApi();
    renderAt();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Settings.");
    expect(screen.queryByText(GOAL_PAGE.goalLine)).toBeNull();
  });

  it("renders the goal page with the sections in their existing order", async () => {
    stubApi();
    const { container } = renderAt();
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(GOAL_PAGE.goalLine);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getAllByRole("button").map(button => button.textContent)).toEqual(["Region", "Notifications", "App", "Privacy", "Account"]);
    expect(within(nav).getByRole("button", { name: "Region" }).getAttribute("aria-current")).toBe("page");
    assertGoalPage(container, GOAL_PAGE);
    expect(primary(container)).toHaveLength(1);
    expect(within(nextStep(container) as HTMLElement).getByRole("link", { name: `See plans in ${browserPaymentRoute()}` })).toBeTruthy();
  });
});

describe("Goal /settings: signed-out account sections", () => {
  it("hands a signed-out visitor to the shared sign-in with a same-origin return target", async () => {
    authState.isSignedIn = false;
    const calls = stubApi();
    const view = renderAt("?section=privacy");
    const link = await screen.findByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe("/sign-in?returnTo=%2Fsettings%3Fsection%3Dprivacy");
    assertGoalPage(view.container, GOAL_PAGE);
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect((await screen.findByRole("link", { name: "Sign in" })).getAttribute("href")).toBe("/sign-in?returnTo=%2Fsettings%3Fsection%3Daccount");
    assertGoalPage(view.container, GOAL_PAGE);
  });

  it("keeps Region and App usable signed out", async () => {
    authState.isSignedIn = false;
    stubApi();
    const view = renderAt();
    expect(await screen.findByRole("heading", { name: "Language & region" })).toBeTruthy();
    assertGoalPage(view.container, GOAL_PAGE);
    fireEvent.click(screen.getByRole("button", { name: "App" }));
    expect(await screen.findByRole("heading", { name: "skipwait.me app" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Preview install screens" }).getAttribute("href")).toBe("/app-states");
    assertGoalPage(view.container, GOAL_PAGE);
  });
});

describe("Goal /settings: section content", () => {
  it("saves a time zone and rolls back with the server refusing it", async () => {
    const calls = stubApi({ "PUT /api/account/preferences": [reply(500, { error: "down" })] });
    const view = renderAt();
    const select = await screen.findByLabelText("Time zone");
    fireEvent.change(select, { target: { value: "Asia/Tokyo" } });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "We could not save that. Your previous setting is still in use.");
    const put = calls.find(call => call.method === "PUT" && call.path === "/api/account/preferences");
    expect(put?.body).toBe(JSON.stringify({ timeZone: "Asia/Tokyo" }));
    expect((screen.getByLabelText("Time zone") as HTMLSelectElement).value).toBe("");
    assertGoalPage(view.container, GOAL_PAGE);
  });

  it("shows a verified referrer's notification channels and saves the email choice", async () => {
    const calls = stubApi();
    renderAt("?section=notifications");
    expect(await screen.findByRole("heading", { name: "How we reach you" })).toBeTruthy();
    expect(screen.getByText("Always on")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Alerts" }).getAttribute("href")).toBe("/alerts");
    const toggle = await screen.findByRole("switch", { name: "Email when a new referral request arrives" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(calls.some(call => call.method === "PUT" && call.path === "/api/referrer-preferences")).toBe(true));
    expect(calls.find(call => call.path === "/api/referrer-preferences" && call.method === "PUT")?.body).toBe(JSON.stringify({ notifyNewAsk: false }));
  });

  it("connects and disconnects Slack review alerts with the webhook validation kept", async () => {
    const calls = stubApi({ "PUT /api/referrer/slack-webhook": [ok({ connected: true, active: true })] });
    renderAt("?section=notifications");
    const input = await screen.findByLabelText("Slack incoming-webhook URL");
    fireEvent.change(input, { target: { value: "https://example.com/hook" } });
    expect(screen.getByText("Slack incoming webhooks start with https://hooks.slack.com/")).toBeTruthy();
    fireEvent.change(input, { target: { value: "https://hooks.slack.com/services/T/B/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect Slack" }));
    expect(await screen.findByText("Slack review alerts connected")).toBeTruthy();
    expect(calls.find(call => call.path === "/api/referrer/slack-webhook" && call.method === "PUT")?.body).toBe(JSON.stringify({ webhookUrl: "https://hooks.slack.com/services/T/B/x" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Slack" }));
    expect(await screen.findByText("Your Slack triage channel is disconnected.")).toBeTruthy();
  });

  it("keeps blocked people, talent consent, cookies and the export honest", async () => {
    const calls = stubApi({
      "GET /api/blocks/mine": [ok({ blocks: [{ id: 7, blockedUserId: 42, reason: "spam", createdAt: "2026-10-02T09:00:00.000Z" }, { id: 8, blockedUserId: 43, reason: null, createdAt: null }] })],
      "GET /api/privacy/export-requests/latest": [ok({ export: null }), ok({ export: { id: 3, status: "requested", byteSize: 0 } })],
      "POST /api/privacy/export-requests": [ok({ id: 3 })],
    });
    const view = renderAt("?section=privacy");
    expect(await screen.findByText("Member · blocked Oct 2 · spam")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Unblock" })[0]);
    await waitFor(() => expect(screen.queryByText("Member · blocked Oct 2 · spam")).toBeNull());
    expect(calls.some(call => call.method === "DELETE" && call.path === "/api/blocks/7")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "I reviewed this preview - opt in" }));
    expect(consent.grant).toHaveBeenCalledWith({ policyVersion: "2026-10-01", disclosedFields: ["headline", "location", "skills", "experience"], source: "settings_preview" });

    const analytics = screen.getByRole("switch", { name: "Product analytics" });
    expect(analytics.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(analytics);
    expect(analytics.getAttribute("aria-checked")).toBe("true");
    expect(window.localStorage.getItem("skipwait:cookie-consent")).toBe("all");

    expect(screen.getByRole("link", { name: "Manage assistants" }).getAttribute("href")).toBe("/assistants");
    fireEvent.click(screen.getByRole("button", { name: "Request my data" }));
    expect(await screen.findByText("Preparing your export. We will keep it here once it is ready.")).toBeTruthy();
    expect(calls.some(call => call.method === "POST" && call.path === "/api/privacy/export-requests")).toBe(true);
    assertGoalPage(view.container, GOAL_PAGE);
  });

  it("reports a failed panel load instead of rendering it empty", async () => {
    stubApi({ "GET /api/blocks/mine": [reply(500, { error: "The blocked list is unavailable right now" })], "GET /api/account/sessions": [reply(500, { error: "down" })], "GET /api/privacy/export-requests/latest": [reply(500, { error: "down" })] });
    const view = renderAt("?section=privacy");
    const blocksError = await screen.findByTestId("goal-error-state");
    expect(blocksError.textContent).toContain("We could not load your blocked list.");
    expect(screen.queryByText("You haven't blocked anyone.")).toBeNull();
    expect(await screen.findByText("We could not check your latest export. Nothing was requested.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Request my data" })).toBeNull();
    assertGoalPage(view.container, GOAL_PAGE);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(await screen.findByText("We could not load your sessions.")).toBeTruthy();
    expect(screen.queryByText("You are signed in on this device.")).toBeNull();
  });

  it("keeps the account deletion confirm step in front of the request", async () => {
    const calls = stubApi({
      "GET /api/account/sessions": [SESSIONS([{ id: "a", device: "MacBook", lastActive: "2026-10-08T09:00:00.000Z", current: true }, { id: "b", device: "iPhone", lastActive: "2026-10-07T09:00:00.000Z", current: false }])],
      "GET /api/privacy/requests": [ok({ requests: [] }), ok({ requests: [{ id: 1, kind: "erasure", status: "requested" }] })],
      "POST /api/privacy/requests/erasure": [ok({ request: { alreadyRequested: false } })],
    });
    const view = renderAt("?section=account");
    expect((await screen.findByTestId("goal-verified-mark")).textContent).toBe("Verified · wipro.com");
    expect(screen.getByRole("link", { name: "Switch to Job Referrer mode" }).getAttribute("href")).toBe("/referrer");
    expect(screen.getByText(/MacBook · This device/)).toBeTruthy();
    expect(screen.getByText("iPhone")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(calls.some(call => call.method === "DELETE" && call.path === "/api/account/sessions/b")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere else" }));
    await waitFor(() => expect(calls.some(call => call.method === "POST" && call.path === "/api/account/sessions/revoke-others")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Request account deletion" }));
    expect(await screen.findByText("Request account deletion review?")).toBeTruthy();
    expect(calls.some(call => call.method === "POST" && call.path === "/api/privacy/requests/erasure")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Request review" }));
    expect(await screen.findByText("Your account deletion request is now awaiting review.")).toBeTruthy();
    expect(calls.filter(call => call.method === "POST" && call.path === "/api/privacy/requests/erasure")).toHaveLength(1);
    expect(await screen.findByText(/Deletion request · requested/)).toBeTruthy();
    assertGoalPage(view.container, GOAL_PAGE);
  });
});

describe("Goal /settings: truthfulness", () => {
  it("renders the loading state without inventing a next step", () => {
    authState.isLoaded = false;
    stubApi();
    const { container } = renderAt("?section=privacy");
    expect(screen.getByText("Checking your sign-in…")).toBeTruthy();
    expect(nextStep(container)).toBeNull();
    expect(primary(container)).toHaveLength(0);
  });

  it("names no credits in any section's next step (D-180)", async () => {
    stubApi();
    const view = renderAt();
    await screen.findByLabelText("Time zone");
    expect(nextStep(view.container)?.textContent ?? "").not.toMatch(/credit/i);
    for (const section of ["Notifications", "App", "Privacy", "Account"]) {
      fireEvent.click(screen.getByRole("button", { name: section }));
      await waitFor(() => expect(nextStep(view.container)).toBeTruthy(), { timeout: 5000 });
      expect(nextStep(view.container)?.textContent ?? "").not.toMatch(/credit/i);
    }
  });

  it("states no unlock cost or retention period before the consent state answers", async () => {
    stubApi();
    consent.state = { data: undefined, isLoading: true };
    const view = renderAt("?section=privacy");
    await screen.findByRole("button", { name: "Request my data" });
    const panel = view.container.querySelector("[data-skipwait-screen='talent-consent']") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.textContent).not.toMatch(/to unlock the exact approved snapshot/);
    expect(panel.textContent).not.toMatch(/retained for \d+ days/);
  });

  it("states the server's unlock cost and retention once the consent state answers", async () => {
    stubApi();
    consent.state = { data: { active: false, policyVersion: "2026-10-01", audience: "Approved employers on skipwait.me", retentionDays: 45, unlockCreditCost: 7, unlockDays: 14 }, isLoading: false };
    const view = renderAt("?section=privacy");
    await screen.findByRole("button", { name: "Request my data" });
    const text = (view.container.querySelector("[data-skipwait-screen='talent-consent']") as HTMLElement).textContent ?? "";
    expect(text).toMatch(/\b7\b[^.]*to unlock the exact approved snapshot for\s*14\s*days/);
    expect(text).toMatch(/retained for 45 days/);
  });

  it("disables network actions offline and says why", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    stubApi();
    renderAt("?section=privacy");
    expect(await screen.findByText("You're offline. Changes can't be saved until you reconnect.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request my data" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("passes the goal contract in every section that has a next step", async () => {
    stubApi();
    const view = renderAt();
    await screen.findByLabelText("Time zone");
    assertGoalPage(view.container, GOAL_PAGE);
    for (const section of ["Notifications", "App", "Privacy", "Account"]) {
      fireEvent.click(screen.getByRole("button", { name: section }));
      await waitFor(() => {
        expect(nextStep(view.container)).toBeTruthy();
        expect(primary(view.container)).toHaveLength(1);
      }, { timeout: 5000 });
      assertGoalPage(view.container, GOAL_PAGE);
    }
  });

  it("opens no kit or AuthKit path from any goal settings file", () => {
    const dir = join(__dirname, "goal", "settings");
    const offenders = readdirSync(dir)
      .filter(name => name.endsWith(".tsx") || name.endsWith(".ts"))
      .filter(name => /SignInButton|openSignIn|auth\/workos|components\/kit|styles\/kit\.css/.test(readFileSync(join(dir, name), "utf8")));
    expect(offenders).toEqual([]);
  });
});
