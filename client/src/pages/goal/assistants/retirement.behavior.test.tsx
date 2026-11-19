// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantApproval } from "@/components/assistants/format";
import GoalAssistants from "./GoalAssistants";
import GoalApprove from "./GoalApprove";
import GoalConnectAssistant from "./GoalConnectAssistant";
import GoalSeekerAgents from "./GoalSeekerAgents";

const { auth, search, user } = vi.hoisted(() => ({
  auth: { isSignedIn: true, isLoaded: true, getToken: vi.fn().mockResolvedValue("fixture-token"), openSignIn: vi.fn(), signOut: vi.fn().mockResolvedValue(undefined) },
  search: { value: "" },
  user: { value: { primaryEmailAddress: { emailAddress: "fictional@example.invalid" } } as { primaryEmailAddress: { emailAddress: string } | null } | null },
}));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth, useUser: () => ({ user: user.value }) }));
vi.mock("wouter", () => ({
  useSearch: () => search.value,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/goal", async importOriginal => {
  const components = (await importOriginal()) as object;
  return { ...components, GoalAppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

const reply = (body: object, status = 200) => ({ ok: status < 400, status, json: async () => body });
const approval: AssistantApproval & { cost: { level: number; cost: number } } = {
  id: 5,
  kind: "ask_send",
  status: "pending",
  provider: "ChatGPT",
  companyDomain: "fictional.invalid",
  role: "Product designer",
  note: "Confirmed skill and interest.",
  creditCount: 1,
  slotCount: 2,
  cost: { level: 5, cost: 5 },
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};

beforeEach(() => {
  auth.isSignedIn = true;
  auth.isLoaded = true;
  auth.getToken.mockClear();
  auth.openSignIn.mockClear();
  auth.signOut.mockClear();
  user.value = { primaryEmailAddress: { emailAddress: "fictional@example.invalid" } };
  search.value = "";
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("released goal assistants", () => {
  it("connects only after the member reviews locked scopes and records the selected permissions", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/assistants/access")) return reply({ hasAccess: true });
      if (url.includes("/api/assistants/connections") && init?.method === "POST") return reply({ connection: { id: 7 } }, 201);
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalConnectAssistant />);
    expect(await screen.findByText("Connect ChatGPT to skipwait.me")).toBeTruthy();
    expect(screen.getByText("fictional@example.invalid")).toBeTruthy();
    const readScopes = screen.getAllByRole("checkbox").filter(box => (box as HTMLInputElement).disabled);
    expect(readScopes.length).toBeGreaterThan(0);
    expect(screen.getByText("Send a referral — only after you approve each one")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Send a referral — only after you approve each one" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith("/api/assistants/connections") && init?.method === "POST")).toBe(true));
    const call = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/api/assistants/connections") && init?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ provider: "chatgpt", appName: "ChatGPT", scopes: ["read", "draft", "credits"] });
    expect(await screen.findByText("ChatGPT is connected")).toBeTruthy();
  });

  it("never trusts an unverified OAuth client: limits scopes and carries state only through the server decision", async () => {
    search.value = "response_type=code&client_id=swc_fixture_client&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcallback&code_challenge=challenge123&code_challenge_method=S256&state=opaque-state";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/oauth/client")) return reply({ clientName: "ChatGPT" });
      if (url === "/api/assistants/access") return reply({ hasAccess: true });
      if (url === "/api/oauth/authorize" && init?.method === "POST") return reply({ redirectTo: "https://chatgpt.com/callback?code=fixture" });
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalConnectAssistant />);
    expect(await screen.findByText("“ChatGPT” isn't verified by skipwait.me")).toBeTruthy();
    expect(screen.getByText("Callback: chatgpt.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue, read & draft only" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/oauth/authorize")).toBe(true));
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/oauth/authorize");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ client_id: "swc_fixture_client", code_challenge: "challenge123", state: "opaque-state", decision: "approve" });
  });

  it("shows a closed access gate instead of token controls or an upgrade path", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ hasAccess: false })));
    render(<GoalAssistants />);
    expect(await screen.findByText("Assistants are not available on your plan")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create token" })).toBeNull();
    expect(document.querySelector("a[href='/plans']")).toBeNull();
  });

  it("retries a failed assistant-settings load and keeps the server access gate authoritative", async () => {
    let fail = true;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/assistants/access") return fail ? reply({ error: "Access service unavailable" }, 500) : reply({ hasAccess: true });
      if (url === "/api/assistants/connections") return reply({ connections: [] });
      if (url === "/api/assistants/tokens") return reply({ tokens: [] });
      return reply({ activity: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalAssistants />);
    expect(await screen.findByText("We could not load your assistant settings.")).toBeTruthy();
    expect(screen.getByText(/Nothing was changed/)).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No assistants connected.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/assistants/access")).toBe(true);
  });

  it("keeps a newly-created token visible once and never adds its secret to the saved token list", async () => {
    const saved = { id: 2, name: "Fictional tracker", prefix: "sw_fixture", createdAt: new Date().toISOString(), lastUsedAt: null };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistants/access") return reply({ hasAccess: true });
      if (url === "/api/assistants/tokens" && init?.method === "POST") return reply({ token: { ...saved, token: "fixture-secret-once" } }, 201);
      if (url === "/api/assistants/tokens") return reply({ tokens: [saved] });
      if (url === "/api/assistants/connections") return reply({ connections: [] });
      if (url === "/api/assistants/activity") return reply({ activity: [] });
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalAssistants />);
    fireEvent.click(await screen.findByRole("tab", { name: "API tokens" }));
    fireEvent.change(screen.getByLabelText("Name this API token"), { target: { value: "Fictional tracker" } });
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    expect(await screen.findByText("fixture-secret-once", { exact: true })).toBeTruthy();
    expect(screen.getByText("You will not see it again. Keep it private.")).toBeTruthy();
    expect(screen.getAllByText("fixture-secret-once", { exact: true })).toHaveLength(1);
  });

  it("disconnects a connection only on the explicit action and reports the updated empty state", async () => {
    const connection = { id: 9, provider: "chatgpt", appName: "ChatGPT", scopes: ["read", "draft"], status: "connected", connectedAt: new Date().toISOString(), lastUsedAt: null };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistants/access") return reply({ hasAccess: true });
      if (url === "/api/assistants/connections/9" && init?.method === "DELETE") return reply({ revoked: true, id: 9 });
      if (url === "/api/assistants/connections") return reply({ connections: [connection] });
      if (url === "/api/assistants/tokens") return reply({ tokens: [] });
      if (url === "/api/assistants/activity") return reply({ activity: [] });
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalAssistants />);
    expect(await screen.findByText("ChatGPT")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.getByText("No assistants connected.")).toBeTruthy());
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith("/api/assistants/connections/9") && init?.method === "DELETE")).toBe(true);
  });

  it("records the exact approved ask cost, and an edited note before the send", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/credits/summary?role=job_seeker") return reply({ summary: { totalAvailable: 12 } });
      if (url === "/api/assistants/approvals") return reply({ approvals: [approval] });
      if (url === "/api/assistants/approvals/5" && init?.method === "PATCH") return reply({ approval: { id: 5, note: "Updated note" } });
      if (url === "/api/assistants/approvals/5/decision" && init?.method === "POST") return reply({ approval: { id: 5, status: "approved" } });
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalApprove />);
    expect(await screen.findByText("Review your referral to fictional.invalid")).toBeTruthy();
    expect(screen.getByText("5 referrals")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByLabelText("Referral note"), { target: { value: "Updated note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith("/api/assistants/approvals/5") && init?.method === "PATCH")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Send referral" }));
    expect(await screen.findByText("Decision recorded")).toBeTruthy();
    const decision = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/api/assistants/approvals/5/decision") && init?.method === "POST");
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ decision: "approved", kind: "ask_send", expectedCost: { level: 5, cost: 5 } });
  });

  it("declines an ask without a cost payload and shows the honest empty queue", async () => {
    let items = [approval];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/credits/summary?role=job_seeker") return reply({ summary: { totalAvailable: 12 } });
      if (url === "/api/assistants/approvals/5/decision" && init?.method === "POST") { items = []; return reply({ approval: { id: 5, status: "declined" } }); }
      if (url === "/api/assistants/approvals") return reply({ approvals: items });
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalApprove />);
    await screen.findByText("Review your referral to fictional.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByText("Declined")).toBeTruthy();
    const decision = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/decision") && init?.method === "POST");
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ decision: "declined", kind: "ask_send" });
    fireEvent.click(screen.getByRole("button", { name: "Back to approvals" }));
    expect(await screen.findByText("Nothing waiting for you")).toBeTruthy();
  });

  it("retries a failed approval list and keeps the referral unchanged", async () => {
    let fail = true;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/credits/summary?role=job_seeker") return reply({ summary: { totalAvailable: 12 } });
      if (url === "/api/assistants/approvals") return fail ? reply({ error: "Could not load approvals" }, 500) : reply({ approvals: [approval] });
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalApprove />);
    expect(await screen.findByText("Approvals didn't load")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Review your referral to fictional.invalid")).toBeTruthy();
  });

  it("switches accounts without dropping the OAuth return query", async () => {
    search.value = "client=ChatGPT&state=opaque";
    vi.stubGlobal("fetch", vi.fn(async () => reply({ hasAccess: true })));
    window.history.replaceState(null, "", "/connect-assistant?client=ChatGPT&state=opaque");
    render(<GoalConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch account" }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ returnTo: "/connect-assistant?client=ChatGPT&state=opaque" }));
    window.history.replaceState(null, "", "/");
  });

  it("does not trust a client-supplied state flag or a fake trusted OAuth app", async () => {
    search.value = "response_type=code&client_id=swc_fixture&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&code_challenge=challenge&code_challenge_method=S256&state=expired&unverified=0";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.startsWith("/api/oauth/client") ? reply({ clientName: "Fictional helper" }) : reply({ hasAccess: true })));
    render(<GoalConnectAssistant />);
    expect(await screen.findByText("“Fictional helper” isn't verified by skipwait.me")).toBeTruthy();
    expect(screen.getByText("Callback: client.example")).toBeTruthy();
    expect(screen.queryByText("This link has expired")).toBeNull();
  });
  it("expires an OAuth link when the server cannot resolve its client", async () => {
    search.value = "response_type=code&client_id=swc_fixture&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&code_challenge=challenge&code_challenge_method=S256&state=opaque";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.startsWith("/api/oauth/client") ? reply({ error: "Unknown client" }, 404) : reply({ hasAccess: true })));
    render(<GoalConnectAssistant />);
    expect(await screen.findByText("This link has expired")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("lets a server plan refusal replace consent without leaving a commit action", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistants/access") return reply({ hasAccess: true });
      if (url === "/api/assistants/connections" && init?.method === "POST") return reply({ error: "Assistant access is not available" }, 402);
      return reply({});
    }));
    render(<GoalConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Assistant access is not available")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it.each(["access answers first", "client answers first"])("keeps server access authoritative when OAuth checks race (%s)", async order => {
    search.value = "response_type=code&client_id=swc_fixture&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&code_challenge=challenge&code_challenge_method=S256&state=opaque";
    const { promise: slow, resolve: releaseSlow } = Promise.withResolvers<void>();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const isAccess = url === "/api/assistants/access";
      const isClient = url.startsWith("/api/oauth/client");
      if ((order === "access answers first" && isClient) || (order === "client answers first" && isAccess)) await slow;
      if (isAccess) return reply({ hasAccess: false });
      if (isClient) return reply({ clientName: "Fictional helper" });
      return reply({});
    }));
    render(<GoalConnectAssistant />);
    if (order === "client answers first") await screen.findByText("“Fictional helper” isn't verified by skipwait.me");
    releaseSlow();
    expect(await screen.findByText("Assistant access is not available")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue, read & draft only" })).toBeNull();
  });

  it("keeps the consent decision visible with the API's failure reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistants/access") return reply({ hasAccess: true });
      if (url === "/api/assistants/connections" && init?.method === "POST") return reply({ error: "Connection service unavailable" }, 500);
      return reply({});
    }));
    render(<GoalConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Connection service unavailable");
    expect(screen.getByText("Connect ChatGPT to skipwait.me")).toBeTruthy();
  });

  it("cancels an ordinary connector consent without posting approval", async () => {
    const fetchMock = vi.fn(async (url: string) => url === "/api/assistants/access" ? reply({ hasAccess: true }) : reply({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel connection" }));
    expect(await screen.findByText("Connection cancelled")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/oauth/authorize")).toBe(false);
  });


  it("grants only the selected lookup/draft limits and reveals the returned agent key once", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/seeker/agents" && init?.method === "POST") return reply({ key: "fixture-agent-key" });
      return reply({ agents: [], paused: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalSeekerAgents />);
    await screen.findByLabelText("Agent name");
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Fixture draft helper" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent key" }));
    expect((await screen.findByTestId("agent-key")).textContent).toContain("fixture-agent-key");
    const create = fetchMock.mock.calls.find(([url, init]) => url === "/api/seeker/agents" && init?.method === "POST");
    expect(JSON.parse(String(create?.[1]?.body))).toEqual({ name: "Fixture draft helper", scopes: ["lookup", "draft"], limits: { creditsPerAsk: 10, creditsPerDay: 20, creditsPerWeek: 50, asksPerDay: 3 }, expiresInDays: 7 });
    fireEvent.click(screen.getByRole("button", { name: "I saved it" }));
    expect(screen.queryByTestId("agent-key")).toBeNull();
  });

  it("keeps 404 agent access closed and retries read-only after a temporary failure", async () => {
    let reads = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ++reads === 1 ? reply({ error: "not ready" }, 404) : reply({ agents: [], paused: false }));
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalSeekerAgents />);
    expect(await screen.findByText("Agent access is not turned on yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create agent key" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check access again" }));
    expect(await screen.findByText("No agents yet. Create a key above when you are ready.")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, init]) => Boolean(init?.method === "POST"))).toHaveLength(0);
  });

  it("retains recoverable granted-agent drafts, activity and pause controls", async () => {
    const agent = { id: 7, name: "Fictional draft helper", keyPrefix: "sw_fixture", scopes: ["lookup", "draft"], limits: { creditsPerAsk: 10, creditsPerDay: 20, creditsPerWeek: 50, asksPerDay: 3 }, status: "active", expiresAt: new Date(Date.now() + 86400000).toISOString(), lastUsedAt: null, createdAt: new Date().toISOString() };
    let paused = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/pause-all")) { paused = true; return reply({ paused: true }); }
      if (url.includes("/drafts")) return reply({ drafts: [{ id: 3, companySlug: "fictional", targetRoleUrl: "https://jobs.example/role", note: "Fixture note", jobLevel: 1, creditCost: 1, status: "draft", createdAt: new Date().toISOString() }] });
      if (url.includes("/events")) return reply({ events: [{ id: 8, agentName: agent.name, action: "agent.draft", outcome: "success", detail: null, createdAt: new Date().toISOString() }] });
      return reply({ agents: [agent], paused });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<GoalSeekerAgents />);
    await screen.findByText(agent.name);
    expect(screen.getByLabelText("Look up companies and prices")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(await screen.findByText("Fixture note")).toBeTruthy();
    expect(container.textContent).toContain("agent.draft");
    fireEvent.click(screen.getByRole("button", { name: "Hide activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause all agents" }));
    await waitFor(() => expect(screen.getByText("All agents paused")).toBeTruthy());
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith("/pause-all") && init?.method === "POST")).toBe(true);
  });
});
