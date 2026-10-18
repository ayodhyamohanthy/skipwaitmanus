// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyAsks from "./MyAsks";

const state = vi.hoisted(() => ({ signedIn: true, search: "", navigate: vi.fn(), openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: state.signedIn, userId: "u1", getToken: async () => null, openSignIn: state.openSignIn }),
}));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }));
vi.mock("wouter", () => ({
  useLocation: () => ["/requests", state.navigate],
  useSearch: () => state.search,
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const ask = (id: number, over: Record<string, unknown>) => ({
  id, displayRef: `R-${id}AAAA`.slice(0, 7), title: "Role from shared job link", targetRoleUrl: `https://example${id}.com/careers/data-analyst`, companyDomain: `example${id}.com`,
  companyName: `Company ${id}`, companyInitials: "C", jobFunction: "Data", status: "pending", referrerId: null, waitingForCoverage: false,
  coverageVisibleAt: "2026-10-01T00:00:00.000Z", createdAt: `2026-10-0${id}T00:00:00.000Z`, updatedAt: `2026-10-0${id}T00:00:00.000Z`, expiresAt: "2026-10-12T00:00:00.000Z", unreadMessageCount: 0, ...over,
});
let asks: Array<Record<string, unknown>>;
let fail = false;
const calls: Array<{ url: string; method: string }> = [];

beforeEach(() => {
  state.signedIn = true;
  state.search = "";
  state.navigate.mockClear();
  state.openSignIn.mockClear();
  fail = false;
  calls.length = 0;
  asks = [ask(1, {}), ask(2, { status: "approved", referrerId: 9 }), ask(3, { status: "withdrawn" })];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/api/company-referrals/mine")) return fail ? json({ error: "boom" }, 500) : json({ requests: asks, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null } });
    if (url.startsWith("/api/credits/ledger")) return json({ entries: [{ id: 1, kind: "credit_spend", credits: -1, bucket: "cycle", reference: { type: "referral_request", id: "1" }, createdAt: "2026-10-01T00:00:00.000Z" }] });
    if (url === "/api/company-referrals/1/withdraw") {
      asks = asks.map(item => (item.id === 1 ? { ...item, status: "withdrawn" } : item));
      return json({ withdrawn: true, requestId: 1, status: "withdrawn" });
    }
    return json({ error: "not mocked" }, 404);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MyAsks /></QueryClientProvider>);
}

describe("My asks (goal UI)", () => {
  it("groups asks, shows the open-asks line and renders exactly one primary", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /Active/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Closed/ })).toBeTruthy();
    expect(screen.getByText("Open asks 1 of 3 · Free plan")).toBeTruthy();
    expect(document.querySelectorAll("[data-g-primary]")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Ask for a referral/ }).getAttribute("href")).toBe("/explore");
  });

  it("opens the newest active ask by default with its reference, stepper and ledger credit line", async () => {
    renderPage();
    const detail = await screen.findByTestId("goal-ask-detail");
    expect(within(detail).getByText("R-2AAAA")).toBeTruthy();
    expect(within(detail).getByRole("heading", { name: /Company 2/ })).toBeTruthy();
    expect(within(detail).getByRole("list", { name: "Progress" })).toBeTruthy();
  });

  it("selects a row through the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Company 1, Data Analyst, Waiting" }));
    expect(state.navigate).toHaveBeenCalledWith("/requests?ask=1", { replace: true });
  });

  it("withdraws after a confirmation and reloads the list", async () => {
    const user = userEvent.setup();
    state.search = "ask=1";
    renderPage();
    const detail = await screen.findByTestId("goal-ask-detail");
    expect(within(detail).getAllByText(/1 credit spent/).length).toBeGreaterThan(0);
    await user.click(within(detail).getByRole("button", { name: "Withdraw" }));
    const dialog = await screen.findByRole("dialog", { name: "Withdraw this ask?" });
    expect(within(dialog).getByText(/unless its month or plan has ended by then/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/company-referrals/1/withdraw" && call.method === "POST")).toBe(true));
    expect(await screen.findByText(/Withdrawn. Your ask to Company 1 is closed/)).toBeTruthy();
    await waitFor(() => expect(calls.filter(call => call.url.startsWith("/api/company-referrals/mine"))).toHaveLength(2));
  });

  it("asks a signed-out visitor to sign in and returns them here", async () => {
    const user = userEvent.setup();
    state.signedIn = false;
    renderPage();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(state.openSignIn).toHaveBeenCalledWith({ returnTo: "/requests" });
    expect(calls).toHaveLength(0);
  });

  it("explains a load failure with a retry, and an empty list in plain words", async () => {
    fail = true;
    const { unmount } = renderPage();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Your asks are still active and nothing was lost.")).toBeTruthy();
    unmount();
    fail = false;
    asks = [];
    renderPage();
    expect(await screen.findByText("No asks yet.")).toBeTruthy();
  });
});
