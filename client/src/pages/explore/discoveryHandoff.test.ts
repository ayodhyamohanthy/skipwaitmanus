// @vitest-environment jsdom
// D-174-worldwide-discovery.company-context: the handoff is display-only context -
// one key, fresh TTL (mirroring ASK_PREFILL_TTL_MS), consumed on use. A malformed or
// stale payload reads as absent; storage refusal never throws into the page.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_PREFILL_TTL_MS } from "@/lib/askPrefill";
import { DISCOVERY_HANDOFF_KEY, clearDiscoveryHandoff, readDiscoveryHandoff, saveDiscoveryHandoff } from "./discoveryHandoff";

const { go, uploadResumeMock } = vi.hoisted(() => ({ go: vi.fn(), uploadResumeMock: vi.fn() }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "user-7", getToken: async () => "test-token" }),
  useUser: () => ({ user: { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...rest }, children),
  useLocation: () => [window.location.pathname, go],
  useSearch: () => "",
  useRoute: () => [false, null],
}));
vi.mock("@/lib/resumeUpload", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/resumeUpload")>();
  return { ...actual, uploadResume: uploadResumeMock };
});
vi.mock("@/pages/explore/signInHandoff", async importOriginal => ({
  ...await importOriginal<typeof import("@/pages/explore/signInHandoff")>(),
  goToSeekerSignIn: vi.fn(),
}));

import Ask from "@/pages/Ask";

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });

function stubFetch() {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (path === "/api/companies") return json(200, { companies: [], openCount: 0 });
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 3 } });
    if (path === "/api/profile/setup") return json(200, { goal: "", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "", resume: null });
    if (path === "/api/work-items") return json(200, { items: [] });
    if (path === "/api/ask-drafts" && method === "GET") return json(200, { draft: null });
    if (path === "/api/ask-drafts" && method === "PUT") return json(200, { draft: null });
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderAsk = () => render(React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, React.createElement(Ask)));
const PICK_HINT = "You picked Acme Corp (acme.example) - paste its job link below";

describe("the discovered-company handoff (display-only context)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a pick with name, domain and timestamp", () => {
    saveDiscoveryHandoff({ name: "Acme Corp", domain: "acme.example" }, 1_000);
    expect(readDiscoveryHandoff(1_500)).toEqual({ name: "Acme Corp", domain: "acme.example", at: 1_000 });
  });

  it("reads as absent once the shared prefill TTL has passed", () => {
    saveDiscoveryHandoff({ name: "Acme Corp", domain: "acme.example" }, 1_000);
    expect(readDiscoveryHandoff(1_000 + ASK_PREFILL_TTL_MS + 1)).toBeNull();
    expect(readDiscoveryHandoff(1_000 + ASK_PREFILL_TTL_MS)).not.toBeNull();
  });

  it("reads as absent on malformed JSON or an invalid shape", () => {
    localStorage.setItem(DISCOVERY_HANDOFF_KEY, "not json");
    expect(readDiscoveryHandoff()).toBeNull();
    localStorage.setItem(DISCOVERY_HANDOFF_KEY, JSON.stringify({ name: "", domain: "acme.example", at: 1 }));
    expect(readDiscoveryHandoff()).toBeNull();
    localStorage.setItem(DISCOVERY_HANDOFF_KEY, JSON.stringify({ name: "Acme Corp", domain: "acme.example" }));
    expect(readDiscoveryHandoff()).toBeNull();
  });

  it("clear removes the key (consumed on use, and sign-out cleanup)", () => {
    saveDiscoveryHandoff({ name: "Acme Corp", domain: "acme.example" });
    clearDiscoveryHandoff();
    expect(localStorage.getItem(DISCOVERY_HANDOFF_KEY)).toBeNull();
    expect(readDiscoveryHandoff()).toBeNull();
  });

  it("a storage refusal on save does not throw", () => {
    const setter = window.localStorage.setItem;
    Object.defineProperty(window.localStorage, "setItem", { configurable: true, value: () => { throw new Error("denied"); } });
    try {
      expect(() => saveDiscoveryHandoff({ name: "Acme Corp", domain: "acme.example" })).not.toThrow();
    } finally {
      Object.defineProperty(window.localStorage, "setItem", { configurable: true, value: setter });
    }
  });
});

describe("the composer wiring (Tier 1: one hint line, display only)", () => {
  beforeEach(() => {
    localStorage.clear();
    stubFetch();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("a fresh pick shows as the link field's hint on /ask and is consumed on use", async () => {
    saveDiscoveryHandoff({ name: "Acme Corp", domain: "acme.example" });
    const first = renderAsk();
    expect(await screen.findByText(PICK_HINT)).toBeTruthy();
    expect(localStorage.getItem(DISCOVERY_HANDOFF_KEY)).toBeNull();
    first.unmount();
    renderAsk();
    await screen.findByPlaceholderText("Paste the job posting link…");
    expect(screen.queryByText(PICK_HINT)).toBeNull();
  });

  it("the pick hint yields to the normal link hint once a link is typed", async () => {
    saveDiscoveryHandoff({ name: "Acme Corp", domain: "acme.example" });
    renderAsk();
    expect(await screen.findByText(PICK_HINT)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Paste the job posting link…"), { target: { value: "https://careers.acme.example/jobs/123" } });
    expect(await screen.findByText("We’ll confirm the employer when you send.")).toBeTruthy();
    expect(screen.queryByText(PICK_HINT)).toBeNull();
  });

  it("a storage read failure renders /ask normally, without the pick context", async () => {
    const getter = window.localStorage.getItem;
    Object.defineProperty(window.localStorage, "getItem", { configurable: true, value: () => { throw new Error("denied"); } });
    try {
      renderAsk();
      await screen.findByPlaceholderText("Paste the job posting link…");
      expect(screen.queryByText(PICK_HINT)).toBeNull();
    } finally {
      Object.defineProperty(window.localStorage, "getItem", { configurable: true, value: getter });
    }
  });
});
