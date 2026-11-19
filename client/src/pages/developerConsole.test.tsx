// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import DeveloperConsole from "./DeveloperConsole";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") } }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  useUser: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, user: authState.isSignedIn ? { primaryEmailAddress: { emailAddress: "dev@instinct.app" } } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

/** Renders the console on an in-memory URL, so the view in the query string (?app=1, ?new=1) behaves as in the browser. */
function renderAt(url = "/developer-console") {
  const location = memoryLocation({ path: url, record: true });
  render(<Router hook={location.hook} searchHook={location.searchHook}><DeveloperConsole /></Router>);
  return location;
}

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
    renderAt();
    expect(await screen.findByText("Your apps")).toBeTruthy();
    expect(await screen.findByText("Instinct")).toBeTruthy();
    expect(screen.getByText("AI agent · Test mode")).toBeTruthy();
    expect(screen.getByRole("link", { name: "dev@instinct.app" }).getAttribute("href")).toBe("/settings");
  });

  it("shows an honest empty state when no apps are registered", async () => {
    stubFetch(url => (String(url).includes("/api/developer-apps") ? { ok: true, json: async () => ({ apps: [] }) } : { ok: true, json: async () => ({}) }));
    renderAt();
    expect(await screen.findByText("No apps yet")).toBeTruthy();
  });

  it("shows the load error with a retry", async () => {
    let calls = 0;
    stubFetch(url => {
      if (!String(url).includes("/api/developer-apps")) return { ok: true, json: async () => ({}) };
      calls += 1;
      return calls === 1 ? { ok: false, json: async () => ({ error: "We could not load your apps" }) } : { ok: true, json: async () => ({ apps: APPS }) };
    });
    renderAt();
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your apps");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Instinct")).toBeTruthy();
  });

  it("shows app details with the client id and webhook", async () => {
    stubFetch(url => (String(url).includes("/api/developer-apps") ? { ok: true, json: async () => ({ apps: APPS }) } : { ok: true, json: async () => ({}) }));
    const location = renderAt();
    fireEvent.click(await screen.findByText("Instinct"));
    expect(await screen.findByText("Credentials")).toBeTruthy();
    expect(screen.getByText("sw_app_7f3k29ab")).toBeTruthy();
    expect(screen.getByLabelText("Webhook URL")).toBeTruthy();
    // No client secret exists yet; never show a masked fake one.
    expect(screen.getByText("Not issued yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rotate" })).toBeNull();
    // Kit: no back link above the title; the view is in the URL, so browser back and deep links work.
    expect(screen.queryByRole("button", { name: "Your apps" })).toBeNull();
    expect(location.history).toEqual(["/developer-console", "/developer-console?app=1"]);
    act(() => location.navigate("/developer-console"));
    expect(await screen.findByText("Your apps")).toBeTruthy();
  });

  it("opens an app straight from its URL", async () => {
    stubFetch(url => (String(url).includes("/api/developer-apps") ? { ok: true, json: async () => ({ apps: APPS }) } : { ok: true, json: async () => ({}) }));
    renderAt("/developer-console?app=1");
    expect(await screen.findByText("Credentials")).toBeTruthy();
    expect(screen.getByText("sw_app_7f3k29ab")).toBeTruthy();
  });

  it("shows an honest miss for an app URL that is not yours", async () => {
    stubFetch(url => (String(url).includes("/api/developer-apps") ? { ok: true, json: async () => ({ apps: APPS }) } : { ok: true, json: async () => ({}) }));
    renderAt("/developer-console?app=99");
    expect(await screen.findByText("App not found")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Your apps" }).getAttribute("href")).toBe("/developer-console");
  });

  it("opens an in-review app on its status, with credentials one tap away", async () => {
    stubFetch(url => (String(url).includes("/api/developer-apps") ? { ok: true, json: async () => ({ apps: [{ ...APPS[0], status: "in_review" }] }) } : { ok: true, json: async () => ({}) }));
    renderAt();
    fireEvent.click(await screen.findByText("Instinct"));
    expect(await screen.findByText("Instinct is in review")).toBeTruthy();
    expect(screen.queryByText("Credentials")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open test credentials" }));
    expect(await screen.findByText("sw_app_7f3k29ab")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
  });

  it("shows a suspended app with the safety-team contact", async () => {
    stubFetch(url => (String(url).includes("/api/developer-apps") ? { ok: true, json: async () => ({ apps: [{ ...APPS[0], status: "suspended" }] }) } : { ok: true, json: async () => ({}) }));
    renderAt();
    fireEvent.click(await screen.findByText("Instinct"));
    expect(await screen.findByText("App suspended")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contact safety team" }).getAttribute("href")).toBe("/help");
    expect(screen.queryByRole("button", { name: "Open app details" })).toBeNull();
  });

  it("does not register an app without a name and description", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => (String(url).includes("/api/developer-apps") && !init?.method ? { ok: true, json: async () => ({ apps: [] }) } : { ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: /New app/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Create app" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Add the app name");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("submits a test app for review", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/developer-apps") && !init?.method) return { ok: true, json: async () => ({ apps: APPS }) };
      if (String(url).includes("/submit") && init?.method === "POST") return { ok: true, json: async () => ({ app: { status: "in_review" } }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAt();
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
    renderAt();
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
    renderAt();
    fireEvent.click(await screen.findByText("Instinct"));
    fireEvent.change(screen.getByLabelText("Webhook URL"), { target: { value: "https://instinct.app/hooks" } });
    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/developer-apps/1/webhook", expect.objectContaining({ method: "PUT" })));
  });

  it("renders rejected apps with the review reasons", async () => {
    const rejected = [{ ...APPS[0], status: "rejected", rejectReasons: ["Your app sends asks without showing the user the final note first."] }];
    stubFetch(url => (String(url).includes("/api/developer-apps") ? { ok: true, json: async () => ({ apps: rejected }) } : { ok: true, json: async () => ({}) }));
    renderAt();
    fireEvent.click(await screen.findByText("Instinct"));
    expect(await screen.findByText("Changes needed")).toBeTruthy();
    expect(screen.getByText("Your app sends asks without showing the user the final note first.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open app details" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit and resubmit" }));
    expect(await screen.findByText("Register an app")).toBeTruthy();
    expect((screen.getByPlaceholderText("Instinct") as HTMLInputElement).value).toBe("Instinct");
  });

  it("lets a rejected app be resubmitted as is from its details URL", async () => {
    const rejected = [{ ...APPS[0], status: "rejected", rejectReasons: ["Privacy policy link is missing."] }];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/developer-apps") && !init?.method) return { ok: true, json: async () => ({ apps: rejected }) };
      if (String(url).includes("/submit") && init?.method === "POST") return { ok: true, json: async () => ({ app: { status: "in_review" } }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    // The details view of a rejected app is reachable by its URL.
    renderAt("/developer-console?app=1&details=1");
    fireEvent.click(await screen.findByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/developer-apps/1/submit", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Instinct is in review")).toBeTruthy();
  });

  it("asks signed-out visitors to sign in", () => {
    authState.isSignedIn = false;
    renderAt();
    expect(screen.getByText("Sign in to the developer console")).toBeTruthy();
  });
});
