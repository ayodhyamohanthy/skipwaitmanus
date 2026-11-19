// @vitest-environment jsdom
// D-048-R-admin-money: /admin/money-check keeps its existing admin-only calls
// and explicit preview/apply guard, with synthetic responses only.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminMoneyCheck, { GOAL_PAGE } from "./GoalAdminMoneyCheck";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, openSignIn: vi.fn() } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => authState }));

type Reply = { ok: boolean; status: number; url: string; json(): Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, url: "http://localhost/api", json: async () => body });
const STATUS = { latestOutcome: "success", latestAt: "2026-11-20T08:00:00.000Z", lastSuccessAt: "2026-11-20T08:00:00.000Z", failuresLast7Days: 0, ownerNotReached: false };
const RESULT = { ranAt: "2026-11-20T08:05:00.000Z", findingsFound: true, emailSent: false, subject: "daily money check · 1 finding", findings: "ledger mismatch: payment #42" };
const PREVIEW = { cutoff: "2026-11-13T08:00:00.000Z", candidates: 3, accounts: 2, oldest: "2026-11-01T08:00:00.000Z", newest: "2026-11-12T08:00:00.000Z", byCurrency: [{ currency: "INR", count: 2 }, { currency: "USD", count: 1 }], applied: false, closed: 0 };
const CLOSED = { ...PREVIEW, applied: true, closed: 3 };
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })}><GoalAdminMoneyCheck /></QueryClientProvider>);

beforeEach(() => { authState.isSignedIn = true; authState.openSignIn.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal /admin/money-check", () => {
  it("opens with the money goal and preserves the single check commit plus a separate test-alert action", async () => {
    const fetchMock = vi.fn(async () => reply(STATUS));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine })).toBeTruthy();
    assertGoalPage(container, GOAL_PAGE);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/money-check/status", { credentials: "include" });
    expect(within(screen.getByRole("region", { name: "Your next step" })).getByRole("button", { name: "Run money check now" })).toBeTruthy();
    expect(Array.from(container.querySelectorAll("[data-g-primary]")).map(node => node.textContent?.trim())).toEqual(["Run money check now"]);
    expect(screen.getByRole("button", { name: "Send test alert" })).toBeTruthy();
  });

  it("shows findings and the actual owner-email outcome from the existing POST", async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith("/status") ? reply(STATUS) : reply(RESULT));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await screen.findByText("Latest alert delivered or not needed");
    fireEvent.click(screen.getByRole("button", { name: "Run money check now" }));
    expect(await screen.findByText("ledger mismatch: payment #42")).toBeTruthy();
    expect(screen.getByText("The owner alert was not sent; review the findings below.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/money-check/run", { method: "POST", credentials: "include" });
  });

  it("distinguishes a successful no-findings run from a missing or failed report", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/status") ? reply(STATUS) : reply({ ...RESULT, findingsFound: false, emailSent: false, subject: null, findings: null })));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run money check now" }));
    expect(await screen.findByText("All clear. Nothing to flag.")).toBeTruthy();
    expect(screen.getByText("No owner email was needed.")).toBeTruthy();
  });

  it("shows failed alert delivery and does not say the owner was reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ ...STATUS, latestOutcome: "failure", ownerNotReached: true, failuresLast7Days: 2, lastSuccessAt: null })));
    renderPage();
    expect(await screen.findByText("Latest alert failed")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("The latest owner alert failed.");
    expect(screen.getByText("Failed sends in the last 7 days:").parentElement?.textContent).toContain("2");
  });

  it("does not show an alert as delivered when the status read fails and retries with the same GET", async () => {
    let reads = 0;
    const fetchMock = vi.fn(async () => { reads += 1; return reads === 1 ? reply({ error: "Status unavailable" }, 503) : reply(STATUS); });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    expect(await screen.findByText("Status unavailable")).toBeTruthy();
    expect(screen.queryByText("Latest alert delivered or not needed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check alert status again" }));
    await waitFor(() => expect(reads).toBe(2));
    expect(await screen.findByText("Latest alert delivered or not needed")).toBeTruthy();
  });

  it("reports the five-minute limit in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/status") ? reply(STATUS) : reply({ error: "The check just ran." }, 429)));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run money check now" }));
    expect(await screen.findByText("The check just ran. Wait 5 minutes before running it again.")).toBeTruthy();
  });

  it("sends the fixed test alert through the existing endpoint and reports its response", async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith("/status") ? reply(STATUS) : reply({ sentAt: "2026-11-20T08:00:00.000Z", sent: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Send test alert" }));
    expect(await screen.findByText("Test alert sent. Check the owner inbox.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/alerts/test", { method: "POST", credentials: "include" });
  });

  it("keeps abandoned checkout preview separate from its explicit apply action", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? reply(init.body === JSON.stringify({ apply: true }) ? CLOSED : PREVIEW) : reply(STATUS));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Preview what would close" }));
    const preview = await screen.findByRole("region", { name: "Abandoned checkout preview" });
    expect(preview.textContent).toContain("3 checkout pages across 2 accounts would be marked.");
    expect(preview.textContent).toContain("INR:");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("close-abandoned"))).toHaveLength(1);
    const previewCall = fetchMock.mock.calls.find(([url]) => String(url).includes("close-abandoned"));
    expect(previewCall?.[1]?.body).toBe(JSON.stringify({ apply: false }));
    fireEvent.click(screen.getByRole("button", { name: "Close these 3 pages" }));
    expect(await screen.findByText("Closed 3 checkout pages. No rows were deleted and no money moved.")).toBeTruthy();
    const mutationCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("close-abandoned"));
    expect(mutationCalls.map(([, init]) => init?.body)).toEqual([JSON.stringify({ apply: false }), JSON.stringify({ apply: true })]);
  });

  it("shows an unsuccessful preview plainly and offers another preview, never applying", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => String(url).includes("close-abandoned") ? reply({ error: "Preview unavailable" }, 500) : reply(STATUS));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Preview what would close" }));
    expect(await screen.findByText("Preview unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Close these/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Read the preview again" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("close-abandoned"))).toHaveLength(2));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.body === JSON.stringify({ apply: true }))).toHaveLength(0);
  });

  it("uses the administrator sign-in recovery on 401 and 403", async () => {
    const fetchMock = vi.fn(async () => reply({ error: "Administrator access is required" }, 403));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: GOAL_PAGE.goalLine })).toBeTruthy();
    expect((await screen.findByRole("link", { name: "Sign in as administrator" })).getAttribute("href")).toBe("/sign-in?returnTo=%2Fadmin%2Fmoney-check");
    expect(container.querySelector("[data-goal-page='admin-money']")).toBeTruthy();
  });
});
