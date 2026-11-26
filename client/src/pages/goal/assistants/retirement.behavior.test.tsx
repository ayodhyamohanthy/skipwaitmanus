// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createdLabel } from "@/components/assistants/format";
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

const reply = (body: object, status = 200) => ({ ok: status < 400, status, json: async () => body });
const initialLocation = window.location.href;
const originalOnline = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", initialLocation);
  if (originalOnline) Object.defineProperty(window.navigator, "onLine", originalOnline);
  else Reflect.deleteProperty(window.navigator, "onLine");
});

describe("released goal assistants", () => {
  it.each([true, false])("records reviewed connection scopes with send allowed=%s", async allowSend => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/assistants/access")) return reply({ hasAccess: true });
      if (url.includes("/api/assistants/connections") && init?.method === "POST") return reply({ connection: { id: 7 } }, 201);
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalConnectAssistant />);
    expect(await screen.findByText("Connect ChatGPT to skipwait.me")).toBeTruthy();
    expect(screen.getByText("fictional@example.invalid")).toBeTruthy();
    const boxes = screen.getAllByRole<HTMLInputElement>("checkbox");
    expect(boxes.filter(box => box.disabled)).toHaveLength(2);
    expect(boxes.every(box => box.checked)).toBe(true);
    expect(screen.getByText("It can never")).toBeTruthy();
    expect(screen.queryByText(/Sent with/)).toBeNull();
    expect(screen.getByText("Send a referral — only after you approve each one")).toBeTruthy();
    if (!allowSend) fireEvent.click(screen.getByRole("checkbox", { name: "Send a referral — only after you approve each one" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith("/api/assistants/connections") && init?.method === "POST")).toBe(true));
    const call = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/api/assistants/connections") && init?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ provider: "chatgpt", appName: "ChatGPT", scopes: allowSend ? ["read", "draft", "send", "credits"] : ["read", "draft", "credits"] });
    expect(await screen.findByText("ChatGPT is connected")).toBeTruthy();
    expect(screen.queryByText(/Taking you back/)).toBeNull();
    expect(screen.getByRole("link", { name: "Manage assistants" }).getAttribute("href")).toBe("/assistants");
  });

  it("approves a paid tool only after showing the live balance and exact amount", async () => {
    const { cost: _askCost, ...approvalBase } = approval;
    const spend = { ...approvalBase, kind: "credit_spend", companyDomain: null, slotCount: null, creditCount: 3 };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/credits/summary?role=job_seeker") return reply({ summary: { totalAvailable: 112 } });
      if (url === "/api/assistants/approvals") return reply({ approvals: [spend] });
      if (url.endsWith("/decision") && init?.method === "POST") return reply({ approval: { id: 5, status: "approved" } });
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalApprove />);
    expect(await screen.findByRole("heading", { name: "Review this paid tool" })).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "112 available · 109 after this")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use 3 referrals" }));
    expect(await screen.findByText("Decision recorded")).toBeTruthy();
    const decision = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/decision") && init?.method === "POST");
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ decision: "approved", kind: "credit_spend" });
  });

  it("never trusts an unverified OAuth client: limits scopes and carries state only through the server decision", async () => {
    search.value = "response_type=code&client_id=swc_fixture_client&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcallback&code_challenge=challenge123&code_challenge_method=S256&state=opaque-state";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/oauth/client")) return reply({ clientName: "ChatGPT" });
      if (url === "/api/assistants/access") return reply({ hasAccess: true });
      if (url === "/api/oauth/authorize" && init?.method === "POST") return reply({ redirectTo: "#connected" });
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalConnectAssistant />);
    expect(await screen.findByText("“ChatGPT” isn't verified by skipwait.me")).toBeTruthy();
    expect(screen.getByText("Callback: chatgpt.com")).toBeTruthy();
    expect(screen.getByText(/It can only read and draft until it's verified/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue, read & draft only" }));
    expect(await screen.findByText("Taking you back to ChatGPT…")).toBeTruthy();
    expect(window.location.hash).toBe("#connected");
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/oauth/authorize");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      client_id: "swc_fixture_client", redirect_uri: "https://chatgpt.com/callback", code_challenge: "challenge123",
      code_challenge_method: "S256", state: "opaque-state", decision: "approve",
      // D-178.screen (D-290 R1): the consent page's default grant length rides with the approval.
      expires_in_days: 7,
    });
  });

  it("shows a closed access gate instead of token controls or an upgrade path", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ plan: "land_focus", hasAccess: false })));
    render(<GoalAssistants />);
    expect(await screen.findByText("Assistants are not available on your plan")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "API tokens" }));
    expect(screen.getByText("Assistants are not available on your plan")).toBeTruthy();
    expect(screen.queryByText("Your tokens")).toBeNull();
    expect(screen.queryByText("You stay in control")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create token" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Upgrade/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Find a referral yourself" }).getAttribute("href")).toBe("/explore");
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
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/assistants/access")).toHaveLength(2);
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
    const row = screen.getByTitle("Starts sw_fixture…");
    expect(row.textContent).toContain("Fictional tracker");
    expect(row.textContent).toContain(`Created ${createdLabel(saved.createdAt)} · Not used yet`);
    expect(await screen.findByText("fixture-secret-once", { exact: true })).toBeTruthy();
    expect(screen.getByText("You will not see it again. Keep it private.")).toBeTruthy();
    expect(screen.getAllByText("fixture-secret-once", { exact: true })).toHaveLength(1);
    expect(row.textContent).not.toContain("fixture-secret-once");
    expect(fetchMock).toHaveBeenCalledWith("/api/assistants/tokens", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: saved.name }) }));
  });

  it("disconnects a connection only on the explicit action and reports the updated empty state", async () => {
    const connection = { id: 9, provider: "chatgpt", appName: "ChatGPT", scopes: ["read", "draft"], status: "connected", connectedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), lastUsedAt: null };
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
    expect(screen.getByRole("list", { name: "Connected assistants" }).textContent).toContain("Read · Draft");
    expect(screen.getByText("Connected 2 hours ago")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.getByText("No assistants connected.")).toBeTruthy());
    expect(screen.getByText("Always ask before a referral is sent.")).toBeTruthy();
    expect(screen.getByText("Always ask before referrals are spent.")).toBeTruthy();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.getByText("skipwait.me/api/mcp")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith("/api/assistants/connections/9") && init?.method === "DELETE")).toBe(true);
  });

  it("lists the server's recorded tool activity and blocked calls", async () => {
    const event = { resourceType: "assistant_token", createdAt: new Date().toISOString() };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/assistants/access") return reply({ hasAccess: true });
      if (url === "/api/assistants/activity") return reply({ activity: [
        { ...event, action: "assistant.mcp.tool", outcome: "success", metadata: { tool: "list_my_requests" } },
        { ...event, action: "assistant.mcp.denied", outcome: "denied", metadata: {} },
      ] });
      return reply({});
    }));
    render(<GoalAssistants />);
    fireEvent.click(await screen.findByRole("tab", { name: "Activity" }));
    expect(screen.getByText("Read your open requests")).toBeTruthy();
    expect(screen.getByText("Blocked: your plan does not include assistants")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review waiting approvals" }).getAttribute("href")).toBe("/approve");
  });

  it("records the exact approved ask cost, and an edited note before the send", async () => {
    const editedNote = "Updated note";
    let note = approval.note;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/credits/summary?role=job_seeker") return reply({ summary: { totalAvailable: 12 } });
      if (url === "/api/assistants/approvals") return reply({ approvals: [{ ...approval, note }] });
      if (url === "/api/assistants/approvals/5" && init?.method === "PATCH") {
        note = editedNote;
        return reply({ approval: { ...approval, note } });
      }
      if (url === "/api/assistants/approvals/5/decision" && init?.method === "POST") return reply({ approval: { id: 5, status: "approved" } });
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalApprove />);
    expect(await screen.findByText("Review your referral to fictional.invalid")).toBeTruthy();
    expect(screen.getByText("5 referrals")).toBeTruthy();
    expect(screen.getByText(approval.role ?? "")).toBeTruthy();
    expect(screen.getByText(approval.note ?? "")).toBeTruthy();
    expect(screen.getByText("Unanswered approvals expire after 24 hours.")).toBeTruthy();
    expect(screen.queryByText(/Quality check passed|Sent with|push notification|h left/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByLabelText("Referral note"), { target: { value: editedNote } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByText(editedNote)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/assistants/approvals/5", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ note: editedNote }) }));
    fireEvent.click(screen.getByRole("button", { name: "Send referral" }));
    expect(await screen.findByText("Decision recorded")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open requests" }).getAttribute("href")).toBe("/requests");
    const decision = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/api/assistants/approvals/5/decision") && init?.method === "POST");
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ decision: "approved", kind: "ask_send", expectedCost: { level: 5, cost: 5 } });
  });

  it("shows the actual balance before approving a known-cost paid tool", async () => {
    const { cost: _listedCost, ...entry } = approval;
    const spend = { ...entry, kind: "credit_spend", creditCount: 3 };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/credits/summary?role=job_seeker") return reply({ summary: { totalAvailable: 112 } });
      if (url === "/api/assistants/approvals") return reply({ approvals: [spend] });
      if (url === "/api/assistants/approvals/5/decision" && init?.method === "POST") return reply({ approval: { id: 5, status: "approved" } });
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalApprove />);
    expect(await screen.findByRole("heading", { name: "Review this paid tool" })).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "112 available · 109 after this")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use 3 referrals" }));
    expect(await screen.findByText("Decision recorded")).toBeTruthy();
    const decision = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/decision") && init?.method === "POST");
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ decision: "approved", kind: "credit_spend" });
  });

  it("ignores a malformed listed cost and keeps a full-slot request as a draft without sending", async () => {
    let items = [{ ...approval, slotCount: 0, note: null, cost: { level: 5, cost: "5" } }];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/credits/summary?role=job_seeker") return reply({ summary: { totalAvailable: 12 } });
      if (url === "/api/assistants/approvals/5/decision" && init?.method === "POST") { items = []; return reply({ approval: { id: 5, status: "declined" } }); }
      if (url === "/api/assistants/approvals") return reply({ approvals: items });
      return reply({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalApprove />);
    expect(await screen.findByText(/All your slots are in use/)).toBeTruthy();
    expect(screen.getByText("1 referral", { exact: true })).toBeTruthy();
    expect(screen.queryByText("5 referrals", { exact: true })).toBeNull();
    expect(screen.getByText("No note yet. Edit before sending.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send referral" })).toBeNull();
    expect(screen.getByRole("link", { name: "Manage requests" }).getAttribute("href")).toBe("/requests");
    fireEvent.click(screen.getByRole("button", { name: "Keep as draft" }));
    expect(await screen.findByText("Declined")).toBeTruthy();
    const decision = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/decision") && init?.method === "POST");
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ decision: "declined", kind: "ask_send" });
    fireEvent.click(screen.getByRole("button", { name: "Back to approvals" }));
    expect(await screen.findByText("Nothing waiting for you")).toBeTruthy();
  });

  it("records a referral decision without inventing a price when no quote is listed", async () => {
    const { cost: _listedCost, ...entry } = approval;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/assistants/approvals/5/decision" && init?.method === "POST") return reply({ approval: { id: 5, status: "approved" } });
      if (url === "/api/assistants/approvals") return reply({ approvals: [{ ...entry, creditCount: null }] });
      return reply({ summary: { totalAvailable: 12 } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalApprove />);
    fireEvent.click(await screen.findByRole("button", { name: "Send referral" }));
    expect(await screen.findByText("Decision recorded")).toBeTruthy();
    const decision = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/decision") && init?.method === "POST");
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ decision: "approved", kind: "ask_send" });
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
    expect((await screen.findByRole("alert")).textContent).toBe("Could not load approvals");
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
    expect(screen.queryByRole("link", { name: /Upgrade/ })).toBeNull();
    expect(document.querySelector("a[href='/plans']")).toBeNull();
    expect(screen.getByRole("link", { name: "Find a referral yourself" }).getAttribute("href")).toBe("/explore");
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
    else await screen.findByText("Assistant access is not available");
    await act(async () => { releaseSlow(); await slow; });
    expect(screen.getByText("Assistant access is not available")).toBeTruthy();
    expect(screen.queryByText("“Fictional helper” isn't verified by skipwait.me")).toBeNull();
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
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => url === "/api/assistants/access" ? reply({ hasAccess: true }) : reply({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel connection" }));
    expect(await screen.findByText("Connection cancelled")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
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
