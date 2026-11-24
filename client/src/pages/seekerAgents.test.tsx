// @vitest-environment jsdom
// /agents was built in the D-048-p3-agents row; these tests pin its released
// goal behavior, grant boundaries, retry path and referrer-safe promises.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SeekerAgents from "./SeekerAgents";
import GoalConnectAssistant from "./goal/assistants/GoalConnectAssistant";
import { GoalApprovalCard } from "./goal/assistants/GoalApprovalCard";
import type { AssistantApproval } from "@/components/assistants/format";

const { authState, searchState } = vi.hoisted(() => ({
  authState: { isSignedIn: true, isLoaded: true, getToken: vi.fn().mockResolvedValue("fixture-token"), signOut: vi.fn().mockResolvedValue(undefined), openSignIn: vi.fn() },
  searchState: { value: "" },
}));
vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  useUser: () => ({ user: { primaryEmailAddress: { emailAddress: "fictional@example.invalid" } } }),
}));
vi.mock("wouter", () => ({
  useSearch: () => searchState.value,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

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

beforeEach(() => { authState.isSignedIn = true; authState.isLoaded = true; authState.openSignIn.mockClear(); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalOnlineDescriptor) Object.defineProperty(window.navigator, "onLine", originalOnlineDescriptor);
  else Reflect.deleteProperty(window.navigator, "onLine");
});

describe("released /agents goal route", () => {
  it("always renders the released goal route without a surface override", async () => {
    stubServer();
    const { container } = render(<SeekerAgents />);
    expect(await screen.findByRole("heading", { level: 1, name: "Let your agent prepare a better referral" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Your AI agents" })).toBeNull();
    expect(container.querySelector('[data-skipwait-screen="agents"]')).toBeTruthy();
  });

  it("keeps agent keys in the shared assistants route family", async () => {
    stubServer();
    render(<SeekerAgents />);
    expect((await screen.findByRole("link", { name: "Approvals" })).getAttribute("href")).toBe("/approve");
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
    expect(screen.getByLabelText("Agent name")).toBeTruthy();
    expect(screen.getByLabelText("Access expires after (days, max 30)")).toBeTruthy();
    for (const id of ["limit-creditsPerAsk", "limit-creditsPerDay", "limit-creditsPerWeek", "limit-asksPerDay"]) {
      expect(document.getElementById(id)).toBeTruthy();
    }
    expect(screen.getByLabelText("Look up companies and prices")).toBeTruthy();
    expect(screen.getByLabelText("Draft referrals (never sends)")).toBeTruthy();
    // SKIPPY-6 (D-290 (1)): the send permission is a request, never a send.
    expect(screen.getByLabelText("Ask me to approve a send (never sends on its own)")).toBeTruthy();
    expect(container.textContent).toContain("it never sends on its own and never buys referrals or plans.");
    expect(screen.getByRole("button", { name: "Pause all agents" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Activity" })).toBeTruthy();
    expect(screen.getByText("Fictional draft helper")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
    expect(container.textContent).toContain("May: lookup, draft");
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

describe("D-178.screen - agent portal access screen, consent, and approval card", () => {
  const approvalBase: AssistantApproval = {
    id: 42,
    kind: "ask_send",
    status: "pending",
    provider: "ChatGPT",
    companyDomain: "example.com",
    role: "Senior Staff Engineer",
    note: "Strong referral fit.",
    creditCount: 1,
    slotCount: 2,
    targetRoleUrl: "https://example.com/jobs/42",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };

  const cardHandlers = () => ({
    editing: false,
    draftNote: "",
    working: false,
    actionError: "",
    onDraftChange: vi.fn(),
    onStartEdit: vi.fn(),
    onSaveEdit: vi.fn(),
    onDecide: vi.fn(),
    resumes: [{ id: 1, fileName: "Resume.pdf" }],
    resumeId: 1,
    onResumeChange: vi.fn(),
  });

  it("consent page shows the self-declared name line and offers expiry (7 default, 30 max)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/assistants/access")) return response({ hasAccess: true });
      return response({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<GoalConnectAssistant />);

    // Self-declared name line requirement (R7): the typed provider name is not verified.
    expect(await screen.findByText(/The name “ChatGPT” is self-declared by the agent\. skipwait\.me has not verified it\./)).toBeTruthy();
    unmount();

    // The expiry choice belongs to the OAuth consent, where the D-141 grant is created (D-290 R1).
    searchState.value = "?client_id=swc_test&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&code_challenge=abc&code_challenge_method=S256&response_type=code";
    const oauthFetch = vi.fn(async (url: string) => {
      if (url.includes("/api/assistants/access")) return response({ hasAccess: true });
      if (url.includes("/api/oauth/client")) return response({ clientName: "ChatGPT" });
      return response({});
    });
    vi.stubGlobal("fetch", oauthFetch);
    render(<GoalConnectAssistant />);

    const expiryInput = (await screen.findByLabelText("Access expires after (days, max 30)")) as HTMLInputElement;
    expect(expiryInput.value).toBe("7");
    expect(expiryInput.getAttribute("min")).toBe("1");
    expect(expiryInput.getAttribute("max")).toBe("30");
    expect(screen.getByText(/The name “ChatGPT” is self-declared by the agent\. skipwait\.me has not verified it\./)).toBeTruthy();
    searchState.value = "";
  });

  // The balance line renders its numerals through GoalNum spans (the design system's
  // mono numerals), so match the paragraph's full textContent rather than direct text nodes.
  const balanceLine = (text: string) => screen.getByText((_, element) => element?.tagName === "P" && element.textContent === text);

  it("approval card shows referral cost with source (included, free or purchased) and balance after", () => {
    const h = cardHandlers();
    const { rerender } = render(
      <GoalApprovalCard approval={{ ...approvalBase, costSource: "included" }} balance={5} primary handlers={h} />
    );

    // Shows 1 referral with source (included)
    expect(screen.getByText("1 referral")).toBeTruthy();
    expect(screen.getByText(/included/i)).toBeTruthy();
    // Shows balance before and after for referrals
    expect(balanceLine("5 available · 4 after this")).toBeTruthy();

    // With free source
    rerender(
      <GoalApprovalCard approval={{ ...approvalBase, costSource: "free" }} balance={3} primary handlers={h} />
    );
    expect(screen.getByText(/free/i)).toBeTruthy();
    expect(balanceLine("3 available · 2 after this")).toBeTruthy();

    // With purchased source (the frozen spending order's own word, D-219/D-221)
    rerender(
      <GoalApprovalCard approval={{ ...approvalBase, costSource: "purchased" }} balance={1} primary handlers={h} />
    );
    expect(screen.getByText(/purchased/i)).toBeTruthy();
    expect(balanceLine("1 available · 0 after this")).toBeTruthy();
  });

  it("has no user-facing 'credit' in consent or approval cards", async () => {
    const h = cardHandlers();
    const { container: cardContainer } = render(
      <GoalApprovalCard approval={{ ...approvalBase, costSource: "included" }} balance={5} primary handlers={h} />
    );
    expect(cardContainer.textContent?.toLowerCase()).not.toContain("credit");

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/assistants/access")) return response({ hasAccess: true });
      return response({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container: consentContainer } = render(<GoalConnectAssistant />);
    await screen.findByText("Connect ChatGPT to skipwait.me");
    expect(consentContainer.textContent?.toLowerCase()).not.toContain("credit");
  });
});
