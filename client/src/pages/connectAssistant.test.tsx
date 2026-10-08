// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConnectAssistant from "./ConnectAssistant";

const { authState, go, location } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn(), location: { value: "/connect-assistant" } }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => [location.value, go],
}));

function stubFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; status?: number; json: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init)));
}

beforeEach(() => { authState.isSignedIn = true; location.value = "/connect-assistant"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ConnectAssistant", () => {
  it("renders the consent screen with locked read scopes", async () => {
    stubFetch(url => (url.includes("/api/assistants/access") ? { ok: true, json: async () => ({ plan: "max" }) } : { ok: true, json: async () => ({}) }));
    render(<ConnectAssistant />);
    expect(await screen.findByText("Connect ChatGPT to SkipWait")).toBeTruthy();
    const locked = screen.getAllByRole("checkbox").filter(box => (box as HTMLInputElement).disabled);
    expect(locked.length).toBeGreaterThan(0);
    expect(screen.getByText("Send an ask — only after you approve each one")).toBeTruthy();
    expect(screen.getByText("It can never")).toBeTruthy();
  });

  it("approves and records the real connection", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/assistants/access")) return { ok: true, json: async () => ({ plan: "max" }) };
      if (String(url).includes("/api/assistants/connections") && init?.method === "POST") {
        return { ok: true, status: 201, json: async () => ({ connection: { id: 1, provider: "chatgpt", scopes: ["read", "draft"] } }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText("ChatGPT is connected")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/assistants/connections", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => String(url).includes("/api/assistants/connections") && init?.method === "POST")?.[1]?.body ?? "{}"));
    expect(body.scopes).toContain("read");
  });

  it("routes lower plans to the Max gate", async () => {
    stubFetch(url => (url.includes("/api/assistants/access") ? { ok: true, json: async () => ({ plan: "pro" }) } : { ok: true, json: async () => ({}) }));
    render(<ConnectAssistant />);
    expect(await screen.findByText("Assistants need Max")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Upgrade to Max" }).getAttribute("href")).toBe("/plans");
  });

  it("asks signed-out visitors to sign in first", () => {
    authState.isSignedIn = false;
    render(<ConnectAssistant />);
    expect(screen.getByText("Sign in to connect ChatGPT")).toBeTruthy();
  });

  it("shows the expired link state", () => {
    location.value = "/connect-assistant?state=expired";
    render(<ConnectAssistant />);
    expect(screen.getByText("This link has expired")).toBeTruthy();
  });

  it("cancels to the declined state", async () => {
    stubFetch(url => (url.includes("/api/assistants/access") ? { ok: true, json: async () => ({ plan: "max" }) } : { ok: true, json: async () => ({}) }));
    render(<ConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel connection" }));
    expect(await screen.findByText("Connection cancelled")).toBeTruthy();
  });

  it("maps a plan rejection on approve to the Max gate", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/assistants/access")) return { ok: true, json: async () => ({ plan: "max" }) };
      if (String(url).includes("/api/assistants/connections") && init?.method === "POST") return { ok: false, status: 402, json: async () => ({ error: "Assistants are part of the max plan." }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Assistants need Max")).toBeTruthy();
  });
});
