// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConnectAssistant from "./ConnectAssistant";

const { authState, userState, search } = vi.hoisted(() => ({
  authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), signOut: vi.fn().mockResolvedValue(undefined) },
  userState: { value: { primaryEmailAddress: { emailAddress: "asha@gmail.com" } } as { primaryEmailAddress: { emailAddress: string } | null } | null },
  search: { value: "" },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  useUser: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, user: userState.value }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
// wouter's location is the path only; the page must read its query from useSearch.
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/connect-assistant", vi.fn()],
  useSearch: () => search.value,
}));

const OAUTH_QUERY = "response_type=code&client_id=swc_abcdefghijklmnopqrstuvwx&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcallback&code_challenge=challenge123&code_challenge_method=S256&state=st_1";

function stubFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; status?: number; json: () => Promise<unknown> }) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init));
  vi.stubGlobal("fetch", mock);
  return mock;
}
const granted = (url: string) => (url.includes("/api/assistants/access") ? { ok: true, json: async () => ({ plan: "max", hasAccess: true }) } : null);

beforeEach(() => {
  authState.isSignedIn = true;
  authState.signOut.mockClear();
  userState.value = { primaryEmailAddress: { emailAddress: "asha@gmail.com" } };
  search.value = "";
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ConnectAssistant", () => {
  it("renders the consent screen with locked read scopes and the signed-in email", async () => {
    stubFetch(url => granted(url) ?? { ok: true, json: async () => ({}) });
    render(<ConnectAssistant />);
    expect(await screen.findByText("Connect ChatGPT to SkipWait")).toBeTruthy();
    const locked = screen.getAllByRole("checkbox").filter(box => (box as HTMLInputElement).disabled);
    expect(locked.length).toBeGreaterThan(0);
    expect(screen.getByText("Send an ask — only after you approve each one")).toBeTruthy();
    expect(screen.getByText("It can never")).toBeTruthy();
    expect(screen.getByText("asha@gmail.com")).toBeTruthy();
    // Kit default: every "It can" box starts ticked (send and paid tools still need approval each time).
    expect(screen.getAllByRole("checkbox").every(box => (box as HTMLInputElement).checked)).toBe(true);
    // No referrer-facing "Sent with" label exists, so the consent screen never promises one.
    expect(screen.queryByText(/Sent with/)).toBeNull();
  });

  it("switch account signs the member out", async () => {
    stubFetch(url => granted(url) ?? { ok: true, json: async () => ({}) });
    const before = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", "/connect-assistant?client=ChatGPT&state=abc");
    render(<ConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch account" }));
    await waitFor(() => expect(authState.signOut).toHaveBeenCalledTimes(1));
    // Switching account returns to this consent screen with its OAuth query intact.
    expect(authState.signOut).toHaveBeenCalledWith({ returnTo: "/connect-assistant?client=ChatGPT&state=abc" });
    window.history.replaceState(null, "", before);
  });

  it("approves and records the real connection", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url.includes("/api/assistants/connections") && init?.method === "POST") return { ok: true, status: 201, json: async () => ({ connection: { id: 1, provider: "chatgpt", scopes: ["read", "draft"] } }) };
      return granted(url) ?? { ok: true, json: async () => ({}) };
    });
    render(<ConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText("ChatGPT is connected")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/assistants/connections", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => String(url).includes("/api/assistants/connections") && init?.method === "POST")?.[1]?.body ?? "{}"));
    expect(body.scopes).toEqual(["read", "draft", "send", "credits"]);
    // Not an OAuth hand-off, so nothing is "taking you back".
    expect(screen.queryByText(/Taking you back/)).toBeNull();
    expect(screen.getByRole("link", { name: "Manage assistants" }).getAttribute("href")).toBe("/assistants");
  });

  it("runs the OAuth consent from the query string and hands back to the client", async () => {
    search.value = OAUTH_QUERY;
    const fetchMock = stubFetch((url, init) => {
      if (url.startsWith("/api/oauth/client")) return { ok: true, json: async () => ({ clientName: "ChatGPT" }) };
      if (url === "/api/oauth/authorize" && init?.method === "POST") return { ok: true, json: async () => ({ redirectTo: "#connected" }) };
      return granted(url) ?? { ok: true, json: async () => ({}) };
    });
    render(<ConnectAssistant />);
    // A self-registered client that calls itself "ChatGPT" is still shown as unverified, with its callback host.
    expect(await screen.findByText("“ChatGPT” isn't verified by SkipWait")).toBeTruthy();
    expect(screen.getByText("It connected through the open MCP link. It can only read and draft until it's verified. Only continue if you trust it.")).toBeTruthy();
    expect(screen.getByText("Callback: chatgpt.com")).toBeTruthy();
    expect(screen.queryByText("Connect ChatGPT to SkipWait")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue, read & draft only" }));
    expect(await screen.findByText("Taking you back to ChatGPT…")).toBeTruthy();
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url) === "/api/oauth/authorize")?.[1]?.body ?? "{}"));
    expect(body).toMatchObject({ client_id: "swc_abcdefghijklmnopqrstuvwx", code_challenge: "challenge123", decision: "approve", state: "st_1" });
  });

  it("shows an unknown OAuth client as an expired link", async () => {
    search.value = OAUTH_QUERY;
    stubFetch(url => (url.startsWith("/api/oauth/client") ? { ok: false, status: 404, json: async () => ({ error: "This connection link is not valid" }) } : granted(url) ?? { ok: true, json: async () => ({}) }));
    render(<ConnectAssistant />);
    expect(await screen.findByText("This link has expired")).toBeTruthy();
  });

  it("names an unverified OAuth client and limits it to read and draft", async () => {
    search.value = OAUTH_QUERY;
    stubFetch(url => (url.startsWith("/api/oauth/client") ? { ok: true, json: async () => ({ clientName: "JobBot" }) } : granted(url) ?? { ok: true, json: async () => ({}) }));
    render(<ConnectAssistant />);
    expect(await screen.findByText("“JobBot” isn't verified by SkipWait")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue, read & draft only" })).toBeTruthy();
  });

  it("routes members without assistant access to the Land gate", async () => {
    stubFetch(url => (url.includes("/api/assistants/access") ? { ok: true, json: async () => ({ plan: "pro", hasAccess: false }) } : { ok: true, json: async () => ({}) }));
    render(<ConnectAssistant />);
    expect(await screen.findByText("Assistants need Land")).toBeTruthy();
    expect(screen.getByText("Signing in, connecting and applying through ChatGPT, Claude, bots or your own tools is part of Land and Concierge.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Upgrade to Land" }).getAttribute("href")).toBe("/plans");
    expect(screen.getByRole("link", { name: "Keep using SkipWait yourself" }).getAttribute("href")).toBe("/explore");
  });

  it.each(["access answers first", "client answers first"])("shows the Land gate, not the unverified-app screen, to a non-Land member arriving from an assistant (%s)", async order => {
    search.value = OAUTH_QUERY;
    let releaseSlow: () => void = () => undefined;
    const slow = new Promise<void>(resolve => { releaseSlow = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const isAccess = String(url).includes("/api/assistants/access");
      const isClient = String(url).startsWith("/api/oauth/client");
      if ((order === "access answers first" && isClient) || (order === "client answers first" && isAccess)) await slow;
      if (isAccess) return { ok: true, json: async () => ({ plan: "momentum", planLabel: "Momentum", tier: "momentum", hasAccess: false }) };
      if (isClient) return { ok: true, json: async () => ({ clientName: "ChatGPT" }) };
      return { ok: true, json: async () => ({}) };
    }));
    render(<ConnectAssistant />);
    if (order === "client answers first") await screen.findByText("“ChatGPT” isn't verified by SkipWait");
    releaseSlow();
    expect(await screen.findByText("Assistants need Land")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Continue, read & draft only" })).toBeNull());
    expect(screen.queryByText("“ChatGPT” isn't verified by SkipWait")).toBeNull();
  });

  it("asks signed-out visitors to sign in first", () => {
    authState.isSignedIn = false;
    render(<ConnectAssistant />);
    expect(screen.getByText("Sign in to connect ChatGPT")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in to SkipWait" })).toBeTruthy();
  });

  it("never derives a screen from URL flags the client controls", async () => {
    // An OAuth state of "expired" or an unverified=0 flag must not change what the person is shown.
    search.value = `${OAUTH_QUERY.replace("state=st_1", "state=expired")}&unverified=0`;
    stubFetch(url => (url.startsWith("/api/oauth/client") ? { ok: true, json: async () => ({ clientName: "JobBot" }) } : granted(url) ?? { ok: true, json: async () => ({}) }));
    render(<ConnectAssistant />);
    expect(await screen.findByText("“JobBot” isn't verified by SkipWait")).toBeTruthy();
    expect(screen.queryByText("This link has expired")).toBeNull();
  });

  it("cancels to the declined state", async () => {
    stubFetch(url => granted(url) ?? { ok: true, json: async () => ({}) });
    render(<ConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel connection" }));
    expect(await screen.findByText("Connection cancelled")).toBeTruthy();
  });

  it("maps a plan rejection on approve to the Land gate", async () => {
    stubFetch((url, init) => {
      if (url.includes("/api/assistants/connections") && init?.method === "POST") return { ok: false, status: 402, json: async () => ({ error: "Assistants are part of the max plan." }) };
      return granted(url) ?? { ok: true, json: async () => ({}) };
    });
    render(<ConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Assistants need Land")).toBeTruthy();
  });

  it("keeps the member on consent with the error when connecting fails", async () => {
    stubFetch((url, init) => {
      if (url.includes("/api/assistants/connections") && init?.method === "POST") return { ok: false, status: 500, json: async () => ({ error: "We could not connect this assistant" }) };
      return granted(url) ?? { ok: true, json: async () => ({}) };
    });
    render(<ConnectAssistant />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not connect this assistant");
    expect(screen.getByText("Connect ChatGPT to SkipWait")).toBeTruthy();
  });
});
