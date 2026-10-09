// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Assistants from "./Assistants";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/assistants", go],
}));

const now = Date.now();
const CONNECTIONS = [
  { id: 1, provider: "chatgpt", appName: "ChatGPT", scopes: ["read", "draft"], status: "connected", lastUsedAt: null, connectedAt: new Date(now - 7200000).toISOString() },
];
const TOKENS = [{ id: 2, name: "Notion tracker", prefix: "sw_AbCdEfGhIj", lastUsedAt: null, createdAt: new Date(now - 86400000).toISOString() }];
const ACTIVITY = [{ action: "assistant.connected", outcome: "success", resourceType: "assistant_connection", metadata: { provider: "chatgpt" }, createdAt: new Date(now - 7200000).toISOString() }];

function stubFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; json: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init)));
}

beforeEach(() => { authState.isSignedIn = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Assistants page", () => {
  it("lists connections, tokens and activity on max", async () => {
    stubFetch(url => {
      if (url.includes("/api/assistants/access")) return { ok: true, json: async () => ({ plan: "max" }) };
      if (url.includes("/api/assistants/connections")) return { ok: true, json: async () => ({ connections: CONNECTIONS }) };
      if (url.includes("/api/assistants/tokens")) return { ok: true, json: async () => ({ tokens: TOKENS }) };
      if (url.includes("/api/assistants/activity")) return { ok: true, json: async () => ({ activity: ACTIVITY }) };
      return { ok: true, json: async () => ({}) };
    });
    render(<Assistants />);
    expect(await screen.findByText("Connected assistants")).toBeTruthy();
    expect(await screen.findByText("ChatGPT")).toBeTruthy();
    expect(screen.getByText("Read · Draft")).toBeTruthy();
    expect(screen.getByText("Connected 2 hours ago")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "API tokens" }));
    expect(await screen.findByText(/Notion tracker · created/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
    expect(await screen.findByText("Connected ChatGPT")).toBeTruthy();
  });

  it("shows the Max upgrade gate for lower plans", async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ plan: "free" }) }));
    render(<Assistants />);
    expect(await screen.findByText(/Assistants and API tokens come with Max/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Upgrade to Max" }).getAttribute("href")).toBe("/plans");
    fireEvent.click(screen.getByRole("tab", { name: "API tokens" }));
    expect(screen.getByText(/Assistants and API tokens come with Max/)).toBeTruthy();
    expect(screen.queryByText("Your tokens")).toBeNull();
  });

  it("shows the always-on safety rules as fixed, not as switches a visitor can flip", async () => {
    stubFetch(url => {
      if (url.includes("/api/assistants/access")) return { ok: true, json: async () => ({ plan: "max" }) };
      if (url.includes("/api/assistants/connections")) return { ok: true, json: async () => ({ connections: [] }) };
      if (url.includes("/api/assistants/tokens")) return { ok: true, json: async () => ({ tokens: [] }) };
      return { ok: true, json: async () => ({ activity: [] }) };
    });
    render(<Assistants />);
    expect(await screen.findByText("No assistants connected")).toBeTruthy();
    expect(screen.getByText("Ask me before any ask is sent")).toBeTruthy();
    expect(screen.getByText("Ask me before credits are spent")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText("skipwait.me/api/mcp")).toBeTruthy();
  });

  it("describes real MCP activity and blocked calls honestly", async () => {
    stubFetch(url => {
      if (url.includes("/api/assistants/access")) return { ok: true, json: async () => ({ plan: "max" }) };
      if (url.includes("/api/assistants/connections")) return { ok: true, json: async () => ({ connections: [] }) };
      if (url.includes("/api/assistants/tokens")) return { ok: true, json: async () => ({ tokens: [] }) };
      return { ok: true, json: async () => ({ activity: [
        { action: "assistant.mcp.tool", outcome: "success", resourceType: "assistant_token", metadata: { tool: "list_my_requests" }, createdAt: new Date(now - 60000).toISOString() },
        { action: "assistant.mcp.denied", outcome: "denied", resourceType: "assistant_token", metadata: {}, createdAt: new Date(now - 120000).toISOString() },
      ] }) };
    });
    render(<Assistants />);
    fireEvent.click(await screen.findByRole("tab", { name: "Activity" }));
    expect(await screen.findByText("Read your open requests")).toBeTruthy();
    expect(screen.getByText("Blocked: your plan does not include assistants")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review waiting approval" }).getAttribute("href")).toBe("/approve");
  });

  it("keeps the token list visible when a revoke fails", async () => {
    stubFetch((url, init) => {
      if (url.includes("/api/assistants/tokens/2") && init?.method === "DELETE") return { ok: false, json: async () => ({ error: "We could not revoke this token" }) };
      if (url.includes("/api/assistants/access")) return { ok: true, json: async () => ({ plan: "max" }) };
      if (url.includes("/api/assistants/connections")) return { ok: true, json: async () => ({ connections: [] }) };
      if (url.includes("/api/assistants/tokens")) return { ok: true, json: async () => ({ tokens: TOKENS }) };
      return { ok: true, json: async () => ({ activity: [] }) };
    });
    render(<Assistants />);
    fireEvent.click(await screen.findByRole("tab", { name: "API tokens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(await screen.findByText("We could not revoke this token")).toBeTruthy();
    expect(screen.getByText(/Notion tracker/)).toBeTruthy();
  });

  it("creates a token and shows it exactly once", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/assistants/tokens") && init?.method === "POST") {
        return { ok: true, json: async () => ({ token: { id: 9, name: "Script", prefix: "sw_XyZ", token: "sw_full-once-value" } }) };
      }
      if (String(url).includes("/api/assistants/access")) return { ok: true, json: async () => ({ plan: "max" }) };
      if (String(url).includes("/api/assistants/connections")) return { ok: true, json: async () => ({ connections: [] }) };
      if (String(url).includes("/api/assistants/tokens")) return { ok: true, json: async () => ({ tokens: [] }) };
      return { ok: true, json: async () => ({ activity: [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Assistants />);
    fireEvent.click(await screen.findByRole("tab", { name: "API tokens" }));
    fireEvent.change(screen.getByPlaceholderText("Name, e.g. Notion tracker"), { target: { value: "Script" } });
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    expect(await screen.findByText("sw_full-once-value")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/assistants/tokens", expect.objectContaining({ method: "POST" }));
  });

  it("disconnects an assistant", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/assistants/connections/1") && init?.method === "DELETE") return { ok: true, json: async () => ({ revoked: true, id: 1 }) };
      if (String(url).includes("/api/assistants/access")) return { ok: true, json: async () => ({ plan: "max" }) };
      if (String(url).includes("/api/assistants/connections")) return { ok: true, json: async () => ({ connections: CONNECTIONS }) };
      if (String(url).includes("/api/assistants/tokens")) return { ok: true, json: async () => ({ tokens: [] }) };
      return { ok: true, json: async () => ({ activity: [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Assistants />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/assistants/connections/1", expect.objectContaining({ method: "DELETE" })));
  });

  it("asks signed-out visitors to sign in", () => {
    authState.isSignedIn = false;
    render(<Assistants />);
    expect(screen.getByText("Sign in to manage assistants")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "API tokens" })).toBeNull();
  });

  it("surfaces load failures with a retry", async () => {
    stubFetch(() => ({ ok: false, json: async () => ({ error: "We could not load assistant access" }) }));
    render(<Assistants />);
    expect(await screen.findByText(/We could not load assistant access/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
