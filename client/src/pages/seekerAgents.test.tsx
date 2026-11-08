// @vitest-environment jsdom
// D-048-p3-agents: /agents switches between the kit page and the goal body on
// the shared "assistants" surface id (D-134). The goal page keeps every D-141
// control visible: scopes, four limits, expiry, key shown once, pause-all,
// revoke and the audit trail; the kit page stays untouched when the flag is off.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SeekerAgents from "./SeekerAgents";

const { authState, surfaces } = vi.hoisted(() => ({
  authState: { isSignedIn: true, isLoaded: true, getToken: vi.fn().mockResolvedValue("fixture-token"), openSignIn: vi.fn() },
  surfaces: { on: new Set<string>() },
}));
vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children ?? "Sign in"}</button> }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));

const response = (body: object, status = 200) => ({ ok: status < 400, status, json: async () => body });
const DAY = 86400000;
const agent = {
  id: 7, name: "Fictional draft helper", keyPrefix: "sw_fictional", scopes: ["lookup", "draft"],
  limits: { creditsPerAsk: 10, creditsPerDay: 20, creditsPerWeek: 50, asksPerDay: 3 },
  status: "active", expiresAt: new Date(Date.now() + 7 * DAY).toISOString(), lastUsedAt: null, createdAt: new Date().toISOString(),
};
const originalOnlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

function stubServer(options: { agents?: unknown[]; firstRead?: "fail" | "not-enabled" } = {}) {
  let reads = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return response({ key: "fixture-key-not-real" });
    reads += 1;
    if (options.firstRead === "fail" && reads === 1) return response({ error: "Server error" }, 500);
    if (options.firstRead === "not-enabled") return response({ error: "Not found" }, 404);
    return response({ agents: options.agents ?? [], paused: false });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => { authState.isSignedIn = true; authState.isLoaded = true; authState.openSignIn.mockClear(); surfaces.on = new Set(["assistants"]); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalOnlineDescriptor) Object.defineProperty(window.navigator, "onLine", originalOnlineDescriptor);
  else Reflect.deleteProperty(window.navigator, "onLine");
});

describe("/agents flag gate", () => {
  it("renders the kit page untouched when the assistants surface is off", async () => {
    surfaces.on = new Set();
    stubServer();
    render(<SeekerAgents />);
    expect(await screen.findByRole("heading", { name: "Your AI agents" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Let your agent prepare a better referral" })).toBeNull();
    expect(document.querySelector("[data-g-primary]")).toBeNull();
  });

  it("uses the shared assistants surface id, never a separate agents id", async () => {
    surfaces.on = new Set(["agents"]);
    stubServer();
    render(<SeekerAgents />);
    expect(await screen.findByRole("heading", { name: "Your AI agents" })).toBeTruthy();
  });
});

describe("goal /agents", () => {
  it("opens on the goal line with one next step and one black commit", async () => {
    stubServer();
    const { container } = render(<SeekerAgents />);
    expect(await screen.findByRole("heading", { level: 1, name: "Let your agent prepare a better referral" })).toBeTruthy();
    const nextStep = screen.getByRole("region", { name: "Your next step" });
    expect(nextStep.textContent).toContain("Give one agent only the access it needs");
    expect(container.querySelectorAll("[data-g-primary]")).toHaveLength(1);
    expect(nextStep.contains(container.querySelector("[data-g-primary]"))).toBe(true);
    expect(screen.getByRole("link", { name: "Agent keys" }).getAttribute("href")).toBe("/agents");
    expect(screen.getByRole("link", { name: "Connections" }).getAttribute("href")).toBe("/assistants");
  });

  it("keeps every D-141 control visible for an active agent", async () => {
    stubServer({ agents: [agent] });
    const { container } = render(<SeekerAgents />);
    await screen.findByText("Granted agents");
    // The four limits are pinned by control id, never by their label text: the
    // shipped labels say "sends", which the product never does (review finding
    // 2, routed to D-048-p3-assistants, which owns the goal body). Pinning the
    // ids keeps the D-141 parity - every limit control stays visible - without
    // certifying wording this row knows to be wrong.
    expect(screen.getByLabelText("Agent name")).toBeTruthy();
    expect(screen.getByLabelText("Access expires after (days, max 30)")).toBeTruthy();
    for (const id of ["limit-creditsPerAsk", "limit-creditsPerDay", "limit-creditsPerWeek", "limit-asksPerDay"]) {
      expect(document.getElementById(id)).toBeTruthy();
    }
    expect(screen.getByLabelText("Look up companies and prices")).toBeTruthy();
    expect(screen.getByLabelText("Draft referrals (never sends)")).toBeTruthy();
    // The promise the copy must keep, and the one this row can vouch for: the
    // agent prepares drafts and never sends, buys or applies.
    expect(container.textContent).toContain("No sends, purchases or automatic applications.");
    expect(screen.getByRole("button", { name: "Pause all agents" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Activity" })).toBeTruthy();
    expect(screen.getByText("Fictional draft helper")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
    expect(container.textContent).toContain("May: lookup, draft");
    // The granted limits are summarised on the agent row. Only the day and week
    // figures are pinned here; the per-send and per-day wording is the routed
    // copy defect above, so this test does not repeat it.
    expect(container.textContent).toContain("20/day");
    expect(container.textContent).toContain("50/week");
    expect(container.textContent).toContain("Expires");
  });

  it("shows the new key once, copies the same scopes and limits, then hides it", async () => {
    const fetchMock = stubServer();
    render(<SeekerAgents />);
    await screen.findByLabelText("Agent name");
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Fictional draft helper" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent key" }));
    expect(await screen.findByTestId("agent-key")).toBeTruthy();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ name: "Fictional draft helper", scopes: ["lookup", "draft"], expiresInDays: 7, limits: { creditsPerAsk: 10, creditsPerDay: 20, creditsPerWeek: 50, asksPerDay: 3 } });
    fireEvent.click(screen.getByRole("button", { name: "I saved it" }));
    expect(screen.queryByTestId("agent-key")).toBeNull();
  });

  it("shows the audit trail for one agent and failed activity stays recoverable", async () => {
    let detailFails = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/drafts")) return detailFails ? response({ error: "Server error" }, 500) : response({ drafts: [{ id: 3, companySlug: "fictional", targetRoleUrl: "https://jobs.fictional.invalid/role", note: "Fictional draft", jobLevel: 1, creditCost: 1, status: "draft", createdAt: new Date().toISOString() }] });
      if (url.includes("/events")) return response({ events: [{ id: 5, agentName: "Fictional draft helper", action: "agent.draft", outcome: "success", detail: null, createdAt: new Date().toISOString() }] });
      return response({ agents: [agent], paused: false });
    }));
    const { container } = render(<SeekerAgents />);
    fireEvent.click(await screen.findByRole("button", { name: "Activity" }));
    expect(await screen.findByText("Activity did not load. Close and reopen it to try again.")).toBeTruthy();
    detailFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Hide activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    await waitFor(() => expect(container.textContent).toContain("Fictional draft"));
    expect(container.textContent).toContain("1 referral");
    expect(container.textContent).toContain("agent.draft · success");
  });

  it("answers a disabled server with the not-turned-on state and no create", async () => {
    stubServer({ firstRead: "not-enabled" });
    const { container } = render(<SeekerAgents />);
    expect(await screen.findByText("Agent access is not turned on yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create agent key" })).toBeNull();
    expect(container.querySelector("[data-g-primary]")).toBeNull();
    expect(screen.getByRole("link", { name: "Find a referral" }).getAttribute("href")).toBe("/explore");
  });

  it("states a load error plainly and re-reads on retry", async () => {
    stubServer({ firstRead: "fail" });
    render(<SeekerAgents />);
    expect(await screen.findByText("Could not load your agents. Try again in a moment.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check access again" }));
    expect(await screen.findByText("No agents yet. Create a key above when you are ready.")).toBeTruthy();
  });

  it("gates on sign-in without fetching and opens the sign-in flow", async () => {
    authState.isSignedIn = false;
    const fetchMock = stubServer();
    render(<SeekerAgents />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(authState.openSignIn).toHaveBeenCalled();
    expect(screen.getByText("Sign in to let your agent prepare referrals. It cannot send or buy referrals.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports offline plainly and makes the create commit inert", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    stubServer();
    render(<SeekerAgents />);
    expect(await screen.findByText("You are offline. Review what is here; reconnect before making changes.")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Create agent key" }).getAttribute("aria-disabled")).toBe("true"));
  });
});
