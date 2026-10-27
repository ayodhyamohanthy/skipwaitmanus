// @vitest-environment jsdom
// Goal /alerts (AYO-8, dark): goal line, next step = newest unread, needs-you
// vs earlier hierarchy, mark-all-read, routing, flags-off kit control.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = { isLoaded: true, isSignedIn: true };
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ ...authState, userId: "u1", getToken: async () => "tok" }), SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const flagState = { on: true };
vi.mock("@/lib/goalSurfaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goalSurfaces")>();
  return { ...actual, goalSurfaceOn: (id: string) => flagState.on && id === "alerts" };
});
vi.mock("@/hooks/usePersistFn", () => ({ usePersistFn: (fn: unknown) => fn }));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "verified" }) }));
vi.mock("@/components/alerts/SavedAlerts", () => ({ SavedAlerts: () => <div data-testid="saved-alerts" /> }));
const goMock = vi.fn();
vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return { ...actual, useLocation: () => ["/alerts", goMock] };
});

const items = [
  { id: 2, category: "message", title: "Asha replied", body: "Happy to refer you", readAt: null, createdAt: new Date().toISOString() },
  { id: 1, category: "status", title: "Referral request accepted", body: "Quillmint accepted your referral request", readAt: "2026-10-20T00:00:00Z", createdAt: "2026-10-20T00:00:00Z" },
];
const serverState = { items: items as unknown[], ok: true, failOnce: [] as number[], block: null as null | (() => Promise<void>), readCalls: [] as { url: string; method?: string; credentials?: string; body?: unknown }[] };
vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.endsWith("/read") && init?.method === "POST") {
    serverState.readCalls.push({ url, method: init.method, credentials: init.credentials as string | undefined });
    if (serverState.block) await serverState.block();
    const id = Number(/notifications\/(\d+)\/read/.exec(url)?.[1]);
    const failAt = serverState.failOnce.indexOf(id);
    if (failAt >= 0) { serverState.failOnce.splice(failAt, 1); return { ok: false, status: 500, json: async () => ({}) } as Response; }
    return { ok: serverState.ok, status: serverState.ok ? 200 : 500, json: async () => ({}) } as Response;
  }
  if (url === "/api/notifications") return { ok: true, status: 200, json: async () => ({ notifications: serverState.items }) } as Response;
  throw new Error("unexpected fetch " + url);
}));

import Alerts from "@/pages/Alerts";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Alerts /></QueryClientProvider>);
}

describe("goal alerts", () => {
  beforeEach(() => { authState.isLoaded = true; authState.isSignedIn = true; flagState.on = true; serverState.items = [...items]; serverState.ok = true; serverState.failOnce = []; serverState.block = null; serverState.readCalls = []; goMock.mockReset(); });
  afterEach(() => { cleanup(); });

  it("opens on the goal with the newest unread as the next step", async () => {
    renderPage();
    expect(await screen.findByTestId("goal-alerts")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "See what needs you." })).toBeTruthy();
    expect((await screen.findAllByText("Asha replied")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Open it" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Needs you/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Earlier/ })).toBeTruthy();
  });

  it("opens a notification, marks it read, and routes by category", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Open it" }));
    await waitFor(() => expect(goMock).toHaveBeenCalledWith("/inbox"));
    fireEvent.click(await screen.findByRole("button", { name: /Referral request accepted/ }));
    await waitFor(() => expect(goMock).toHaveBeenCalledWith("/requests"));
  });

  it("mark all read clears the needs-you section", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Needs you/ })).toBeNull());
  });

  it("posts one read request per unread alert, then retries only the failure", async () => {
    serverState.items = [
      { id: 2, category: "message", title: "Asha replied", body: "Happy to refer you", readAt: null, createdAt: new Date().toISOString() },
      { id: 3, category: "status", title: "Credit added", body: "1 credit", readAt: null, createdAt: new Date().toISOString() },
    ];
    serverState.failOnce = [3];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));
    await screen.findByText("Some alerts could not be marked read. Try again.");
    expect(serverState.readCalls.map(call => call.url).sort()).toEqual(["/api/notifications/2/read", "/api/notifications/3/read"]);
    for (const call of serverState.readCalls) { expect(call.method).toBe("POST"); expect(call.credentials).toBe("include"); }
    expect((await screen.findAllByText("Credit added")).length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(screen.queryByText("Some alerts could not be marked read. Try again.")).toBeNull());
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Needs you/ })).toBeNull());
    expect(serverState.readCalls.map(call => call.url)).toEqual(["/api/notifications/2/read", "/api/notifications/3/read", "/api/notifications/3/read"]);
  });

  it("blocks a second mark-all while the first is still in flight", async () => {
    let release: () => void = () => undefined;
    serverState.block = () => new Promise<void>(resolve => { release = resolve; });
    renderPage();
    const commit = await screen.findByRole("button", { name: "Mark all read" });
    fireEvent.click(commit);
    await waitFor(() => expect(serverState.readCalls.length).toBe(1));
    fireEvent.click(commit);
    fireEvent.click(commit);
    release();
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Needs you/ })).toBeNull());
    expect(serverState.readCalls.map(call => call.url)).toEqual(["/api/notifications/2/read"]);
  });

  it("shows the caught-up next step when nothing is unread", async () => {
    serverState.items = items.map(item => ({ ...item, readAt: "2026-10-20T00:00:00Z" }));
    renderPage();
    expect(await screen.findByRole("heading", { name: /all caught up/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Explore companies/ })).toBeTruthy();
  });

  it("gates alerts behind sign-in", async () => {
    authState.isSignedIn = false;
    renderPage();
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("flags off keeps the kit alerts", async () => {
    flagState.on = false;
    renderPage();
    expect(await screen.findByText(/STAY IN THE LOOP/)).toBeTruthy();
    expect(screen.queryByTestId("goal-alerts")).toBeNull();
  });
});
