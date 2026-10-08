// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeveloperConsole from "./DeveloperConsole";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/developer-console", go],
}));

const APPS = [
  { id: 1, name: "Instinct", kind: "agent_mcp", description: "AI agent for job seekers", website: "https://instinct.app", redirectUrls: ["https://instinct.app/cb"], scopes: ["companies:read", "asks:send"], status: "test", rejectReasons: [], webhookUrl: null, clientId: "sw_app_7f3k29ab", createdAt: "2026-10-01T00:00:00.000Z" },
];

function stubFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; json: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init)));
}

beforeEach(() => { authState.isSignedIn = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Developer console", () => {
  it("lists registered apps with their status", async () => {
    stubFetch(url => (String(url).includes("/api/developer-apps") ? { ok: true, json: async () => ({ apps: APPS }) } : { ok: true, json: async () => ({}) }));
    render(<DeveloperConsole />);
    expect(await screen.findByText("Your apps")).toBeTruthy();
    expect(await screen.findByText("Instinct")).toBeTruthy();
    expect(screen.getByText("AI agent or MCP client · Test")).toBeTruthy();
  });

  it("shows app details with the client id and webhook", async () => {
    stubFetch(url => (String(url).includes("/api/developer-apps") ? { ok: true, json: async () => ({ apps: APPS }) } : { ok: true, json: async () => ({}) }));
    render(<DeveloperConsole />);
    fireEvent.click(await screen.findByText("Instinct"));
    expect(await screen.findByText("Credentials")).toBeTruthy();
    expect(screen.getByText("sw_app_7f3k29ab")).toBeTruthy();
    expect(screen.getByLabelText("Webhook URL")).toBeTruthy();
  });

  it("submits a test app for review", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/developer-apps") && !init?.method) return { ok: true, json: async () => ({ apps: APPS }) };
      if (String(url).includes("/submit") && init?.method === "POST") return { ok: true, json: async () => ({ app: { status: "in_review" } }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DeveloperConsole />);
    fireEvent.click(await screen.findByText("Instinct"));
    fireEvent.click(await screen.findByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/developer-apps/1/submit", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Instinct is in review")).toBeTruthy();
  });

  it("registers an app and lands on its details", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/developer-apps") && !init?.method) return { ok: true, json: async () => ({ apps: [] }) };
      if (String(url).includes("/api/developer-apps") && init?.method === "POST") {
        return { ok: true, json: async () => ({ app: { ...APPS[0], id: 2, name: "New app" } }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DeveloperConsole />);
    fireEvent.click(await screen.findByRole("button", { name: /New app/ }));
    fireEvent.change(await screen.findByPlaceholderText("Instinct"), { target: { value: "New app" } });
    fireEvent.change(screen.getByPlaceholderText("Shown to users on the approval screen"), { target: { value: "Helps job seekers apply" } });
    fireEvent.click(screen.getByRole("button", { name: "Create app" }));
    expect(await screen.findByText("New app")).toBeTruthy();
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => String(url).includes("/api/developer-apps") && init?.method === "POST")?.[1]?.body ?? "{}"));
    expect(body.agreeToTerms).toBe(true);
    expect(body.scopes).toContain("companies:read");
  });

  it("saves the webhook url", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/developer-apps") && !init?.method) return { ok: true, json: async () => ({ apps: APPS }) };
      if (String(url).includes("/webhook") && init?.method === "PUT") return { ok: true, json: async () => ({ webhookUrl: "https://instinct.app/hooks" }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DeveloperConsole />);
    fireEvent.click(await screen.findByText("Instinct"));
    fireEvent.change(screen.getByLabelText("Webhook URL"), { target: { value: "https://instinct.app/hooks" } });
    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/developer-apps/1/webhook", expect.objectContaining({ method: "PUT" })));
  });

  it("renders rejected apps with the review reasons", async () => {
    const rejected = [{ ...APPS[0], status: "rejected", rejectReasons: ["Your app sends asks without showing the user the final note first."] }];
    stubFetch(url => (String(url).includes("/api/developer-apps") ? { ok: true, json: async () => ({ apps: rejected }) } : { ok: true, json: async () => ({}) }));
    render(<DeveloperConsole />);
    fireEvent.click(await screen.findByText("Instinct"));
    expect(await screen.findByText("Changes needed")).toBeTruthy();
    expect(screen.getByText("Your app sends asks without showing the user the final note first.")).toBeTruthy();
  });

  it("asks signed-out visitors to sign in", () => {
    authState.isSignedIn = false;
    render(<DeveloperConsole />);
    expect(screen.getByText("Sign in to the developer console")).toBeTruthy();
  });
});
