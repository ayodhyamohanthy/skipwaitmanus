// @vitest-environment jsdom
// Goal /developers and /developer-console (D-048-p3-dev; packet
// docs/plans/D-048-admin.md). Tier 1 until the no-secret proof: whatever extra
// field the server might send with an app (a secret, a token, a signing key),
// the goal console renders only the fields it names, and the client secret
// line stays "Not issued yet". Same calls as the kit console; loading, empty
// and error states are honest; flag off, both kit pages render unchanged.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { DOCUMENTED_MCP_TOOLS, MCP_ENDPOINT } from "@/components/developers/mcpTools";

const { authState, flagState } = vi.hoisted(() => ({
  authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") },
  flagState: { on: true },
}));
vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  useUser: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, user: authState.isSignedIn ? { primaryEmailAddress: { emailAddress: "dev@example.test" } } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <div data-testid="sign-in-button">{children}</div>,
}));
vi.mock("@/lib/goalSurfaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goalSurfaces")>();
  return { ...actual, goalSurfaceOn: (id: string) => flagState.on && id === "developers" };
});

import Developers from "../../Developers";
import DeveloperConsole from "../../DeveloperConsole";

// Synthetic values only. The SECRET_* strings stand for anything the server
// might ever add to an app record; none may reach the screen.
const SECRET_VALUES = ["sk_live_SYNTHETIC_SECRET_1", "whsec_SYNTHETIC_SECRET_2", "tok_SYNTHETIC_SECRET_3", "SYNTHETIC_PRIVATE_KEY_4"];
const leaky = { clientSecret: SECRET_VALUES[0], webhookSecret: SECRET_VALUES[1], accessToken: SECRET_VALUES[2], signingKey: SECRET_VALUES[3] };
const app = (id: number, name: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, name, kind: "agent_mcp", description: "Helps job seekers track asks", website: "https://example.test", redirectUrls: ["https://example.test/cb"],
  scopes: ["companies:read", "asks:draft"], status, rejectReasons: [] as string[], webhookUrl: null, clientId: `sw_app_test${id}`, createdAt: "2026-10-01T00:00:00.000Z", ...extra,
});

type Reply = { status: number; body: unknown } | "network";
const server = {
  apps: [] as unknown[],
  listReplies: [] as Reply[],
  writeReply: null as Reply | null,
  calls: [] as { url: string; method: string; body: unknown }[],
};
function respond(reply: Reply) {
  if (reply === "network") throw new TypeError("Failed to fetch");
  return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body } as Response;
}
beforeEach(() => {
  flagState.on = true; authState.isSignedIn = true;
  server.apps = [app(1, "Trackwise", "test")]; server.listReplies = []; server.writeReply = null; server.calls = [];
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    server.calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "GET" && url === "/api/developer-apps") return respond(server.listReplies.shift() ?? { status: 200, body: { apps: server.apps } });
    if (server.writeReply) return respond(server.writeReply);
    if (method === "POST" && url === "/api/developer-apps") return respond({ status: 201, body: { app: { ...app(7, "Newapp", "test"), ...leaky } } });
    if (method === "PUT") return respond({ status: 200, body: { webhookUrl: (JSON.parse(String(init?.body)) as { webhookUrl: string }).webhookUrl } });
    return respond({ status: 200, body: {} });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
// Warm the lazily loaded goal chunks so a cold transform on a busy runner never outlasts findBy's timeout.
// (A glob, so the test file still loads before the goal pages exist.)
beforeAll(async () => {
  await Promise.all(Object.values(import.meta.glob("./Goal*.tsx")).map(load => load()));
}, 60_000);

function renderConsole(url = "/developer-console") {
  const location = memoryLocation({ path: url, record: true });
  render(<Router hook={location.hook} searchHook={location.searchHook}><DeveloperConsole /></Router>);
  return location;
}
const primaries = () => document.querySelectorAll("[data-g-primary]");
const goalPage = (id: string) => document.querySelector(`[data-goal-page="${id}"]`);
const noSecretOnScreen = () => { for (const value of SECRET_VALUES) expect(document.body.textContent ?? "").not.toContain(value); for (const value of SECRET_VALUES) expect(document.body.innerHTML).not.toContain(value); };

describe("goal /developers", () => {
  it("flag off keeps the kit page", () => {
    flagState.on = false;
    render(<Router><Developers /></Router>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Use skipwait.me from ChatGPT, Claude, or your own code");
    expect(goalPage("developers")).toBeNull();
  });

  it("opens on the goal with one black commit to connect an assistant, and fetches nothing", async () => {
    render(<Router><Developers /></Router>);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Connect your assistant or build your app.");
    expect(goalPage("developers")).toBeTruthy();
    expect(primaries()).toHaveLength(1);
    expect((primaries()[0] as HTMLElement).textContent).toContain("Connect an assistant");
    expect(primaries()[0].getAttribute("href")).toBe("/connect-assistant");
    expect(screen.getByRole("link", { name: "Build an app" }).getAttribute("href")).toBe("/developer-console");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("documents exactly the live MCP tools, the endpoint and the approval rule", async () => {
    render(<Router><Developers /></Router>);
    const table = await screen.findByRole("table", { name: "Tools" });
    for (const [tool] of DOCUMENTED_MCP_TOOLS) expect(within(table).getByText(tool)).toBeTruthy();
    expect(within(table).getAllByRole("row")).toHaveLength(DOCUMENTED_MCP_TOOLS.length + 1);
    expect(document.body.textContent).toContain(MCP_ENDPOINT);
    expect(document.body.textContent).toContain("You approve every ask before it is sent");
    expect(screen.getByRole("link", { name: "Connected assistants" }).getAttribute("href")).toBe("/assistants");
  });
});

describe("goal /developer-console: list", () => {
  it("flag off keeps the kit page", async () => {
    flagState.on = false;
    renderConsole();
    expect(await screen.findByText("AI agent · Test mode")).toBeTruthy();
    expect(goalPage("developer-console")).toBeNull();
  });

  it("signed out: one next step to sign in, nothing fetched", async () => {
    authState.isSignedIn = false;
    renderConsole();
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Register your app.");
    expect(screen.getByTestId("sign-in-button").textContent).toContain("Sign in");
    expect(primaries()).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows loading while the apps are on their way", async () => {
    server.listReplies = [];
    let release: () => void = () => undefined;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(respond({ status: 200, body: { apps: [] } })); }));
    renderConsole();
    expect(await screen.findByRole("status", { name: "Loading your apps…" })).toBeTruthy();
    release();
    expect(await screen.findByText("No apps yet.")).toBeTruthy();
  });

  it("an empty console makes registering the one black commit", async () => {
    server.apps = [];
    const location = renderConsole();
    expect(await screen.findByText("No apps yet.")).toBeTruthy();
    expect(primaries()).toHaveLength(1);
    fireEvent.click(primaries()[0]);
    await waitFor(() => expect(location.history?.at(-1)).toBe("/developer-console?new=1"));
    expect(await screen.findByRole("heading", { level: 1, name: "Register an app" })).toBeTruthy();
  });

  it("a failed load renders the server's words and a retry, never the empty state", async () => {
    server.listReplies = [{ status: 500, body: { error: "Apps are unavailable right now" } }];
    renderConsole();
    expect((await screen.findByRole("alert")).textContent).toContain("Apps are unavailable right now");
    expect(screen.queryByText("No apps yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(within(await screen.findByRole("list", { name: "Your apps" })).getByRole("button", { name: /Trackwise/ })).toBeTruthy();
  });

  it("an unreachable server says so in plain words", async () => {
    server.listReplies = ["network"];
    renderConsole();
    expect((await screen.findByRole("alert")).textContent).toContain("We could not reach skipwait.me");
  });

  it("lists apps with dot+text status, the app that needs you first as the next step", async () => {
    server.apps = [app(1, "Trackwise", "live"), app(2, "Pathfinder", "rejected", { rejectReasons: ["Explain what is sent"] }), app(3, "Draftly", "test")];
    renderConsole();
    const list = await screen.findByRole("list", { name: "Your apps" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("AI agent · Live · verified")).toBeTruthy();
    expect(within(list).getByText("Rejected")).toBeTruthy();
    expect(primaries()).toHaveLength(1);
    expect((primaries()[0] as HTMLElement).textContent).toContain("Pathfinder");
    expect(screen.getByRole("button", { name: "New app" })).toBeTruthy();
  });
});

describe("goal /developer-console: app", () => {
  it("shows the client id and an unissued client secret, and saves the webhook", async () => {
    renderConsole("/developer-console?app=1&details=1");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toContain("Trackwise");
    expect(screen.getByText("sw_app_test1")).toBeTruthy();
    expect(screen.getByTestId("goal-client-secret").textContent).toBe("Not issued yet");
    fireEvent.change(screen.getByLabelText("Webhook URL"), { target: { value: " https://example.test/hooks " } });
    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
    await waitFor(() => expect(server.calls.find(call => call.method === "PUT")).toEqual({ url: "/api/developer-apps/1/webhook", method: "PUT", body: { webhookUrl: "https://example.test/hooks" } }));
  });

  it("no-secret proof: extra secret fields in the server's app never render, in any view", async () => {
    server.apps = [app(1, "Trackwise", "test", leaky), app(2, "Pathfinder", "rejected", leaky), app(3, "Draftly", "in_review", leaky)];
    for (const url of ["/developer-console", "/developer-console?app=1", "/developer-console?app=1&details=1", "/developer-console?app=2", "/developer-console?app=3", "/developer-console?app=3&details=1", "/developer-console?new=1&from=2"]) {
      renderConsole(url);
      await waitFor(() => expect(server.calls.length).toBeGreaterThan(0));
      await screen.findByRole("heading", { level: 1 });
      await waitFor(() => expect(screen.queryByRole("status", { name: "Loading your apps…" })).toBeNull());
      noSecretOnScreen();
      cleanup(); server.calls = [];
    }
  });

  it("no-secret proof: a newly registered app lands on its details without any secret", async () => {
    server.apps = [];
    const location = renderConsole("/developer-console?new=1");
    fireEvent.change(await screen.findByLabelText("App name"), { target: { value: "Newapp" } });
    fireEvent.change(screen.getByLabelText("What does your app do for job seekers?"), { target: { value: "Tracks referral asks" } });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    await waitFor(() => expect(location.history?.at(-1)).toBe("/developer-console?app=7"));
    expect(await screen.findByText("sw_app_test7")).toBeTruthy();
    expect(screen.getByTestId("goal-client-secret").textContent).toBe("Not issued yet");
    noSecretOnScreen();
    const post = server.calls.find(call => call.method === "POST");
    expect(post?.body).toEqual({ name: "Newapp", kind: "web_app", description: "Tracks referral asks", redirectUrls: [], scopes: ["companies:read", "requests:read", "asks:draft"], agreeToTerms: true });
  });

  it("does not register an app without a name and what it does", async () => {
    renderConsole("/developer-console?new=1");
    fireEvent.click(await screen.findByRole("button", { name: "Create app" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Add the app name and what your app does for job seekers.");
    expect(server.calls.some(call => call.method === "POST")).toBe(false);
  });

  it("submits a test app for review as the page's one commit", async () => {
    renderConsole("/developer-console?app=1");
    await screen.findByRole("heading", { level: 1 });
    expect(primaries()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(server.calls.some(call => call.method === "POST" && call.url === "/api/developer-apps/1/submit")).toBe(true));
    expect(await screen.findByRole("heading", { level: 1, name: /Trackwise is in review/ })).toBeTruthy();
  });

  it("a refused write shows the server's words on that screen", async () => {
    server.writeReply = { status: 400, body: { error: "Add a privacy policy link first" } };
    renderConsole("/developer-console?app=1");
    fireEvent.click(await screen.findByRole("button", { name: "Submit for review" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Add a privacy policy link first");
  });

  it("an in-review app opens on its status with test credentials one tap away", async () => {
    server.apps = [app(1, "Trackwise", "in_review")];
    const location = renderConsole("/developer-console?app=1");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toContain("Trackwise is in review");
    fireEvent.click(screen.getByRole("button", { name: "Open test credentials" }));
    await waitFor(() => expect(location.history?.at(-1)).toBe("/developer-console?app=1&details=1"));
    expect(await screen.findByText("sw_app_test1")).toBeTruthy();
  });

  it("a rejected app shows the review reasons and resubmits from the edit form", async () => {
    server.apps = [app(1, "Trackwise", "rejected", { rejectReasons: ["Explain what is sent"] })];
    const location = renderConsole("/developer-console?app=1");
    expect(await screen.findByText("Explain what is sent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit and resubmit" }));
    await waitFor(() => expect(location.history?.at(-1)).toBe("/developer-console?new=1&from=1"));
    expect((await screen.findByLabelText("App name") as HTMLInputElement).value).toBe("Trackwise");
  });

  it("a suspended app points at the safety team", async () => {
    server.apps = [app(1, "Trackwise", "suspended")];
    renderConsole("/developer-console?app=1");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toContain("App suspended");
    expect(screen.getByRole("link", { name: "Contact safety team" }).getAttribute("href")).toBe("/help");
  });

  it("an app URL that is not yours is an honest miss", async () => {
    renderConsole("/developer-console?app=99");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("App not found");
    expect(screen.getByRole("link", { name: "Your apps" }).getAttribute("href")).toBe("/developer-console");
  });
});
