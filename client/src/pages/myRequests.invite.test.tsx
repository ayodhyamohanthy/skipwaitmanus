// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyRequests from "./MyRequests";

const { go, auth, flags } = vi.hoisted(() => ({
  go: vi.fn(),
  auth: { isLoaded: true, isSignedIn: true, openSignIn: vi.fn() },
  flags: { byor: true },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: auth.isLoaded, isSignedIn: auth.isSignedIn, userId: auth.isSignedIn ? 4106 : null, getToken: async () => "test-token", openSignIn: auth.openSignIn }),
  useUser: () => ({ user: auth.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/flags", () => ({ get BYOR_LINK() { return flags.byor; }, COMPANY_RESPONSE_SIGNAL: false }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/requests", go],
}));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const day = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
const base = { targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", companyName: "Acme", companyInitials: "AC", queueStatus: "waiting_for_coverage", referrerMessage: null, unreadMessageCount: 0, attachmentCount: 1 };
const openAsk = (id: number, extra: Record<string, unknown> = {}) => ({ ...base, id, title: "Product Designer", status: "pending", referrerId: null, waitingForCoverage: true, createdAt: iso(Date.now() - day), updatedAt: iso(Date.now() - day), ...extra });
const slots = { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null };
const TOKEN = "b".repeat(43);
const URL = `https://skipwait.me/r/${TOKEN}`;
let mineRows: unknown[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, url: "https://skipwait.me/api/company-referrals/mine" };
}
function stubPage(rows: unknown[]) {
  mineRows = rows;
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/api/credits/summary")) return response(200, { summary: { totalAvailable: 4 } });
    if (url === "/api/company-referrals/mine") return response(200, { requests: mineRows, slots });
    if (url.endsWith("/invite-link/revoke")) {
      mineRows = mineRows.map(row => {
        const item = row as Record<string, unknown>;
        return item.id === 42 ? { ...item, askInvite: { state: "revoked", createdAt: iso(Date.now()), expiresAt: iso(Date.now() + day) } } : row;
      });
      return response(200, { revoked: true });
    }
    if (url.endsWith("/invite-link")) {
      mineRows = mineRows.map(row => {
        const item = row as Record<string, unknown>;
        return item.id === 42 ? { ...item, askInvite: { state: "active", createdAt: iso(Date.now()), expiresAt: iso(Date.now() + 7 * day) } } : row;
      });
      return response(201, { token: TOKEN, url: URL, expiresAt: iso(Date.now() + 7 * day) });
    }
    return response(404, { error: "unavailable" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MyRequests /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  go.mockClear();
  vi.unstubAllGlobals();
  auth.isLoaded = true;
  auth.isSignedIn = true;
  flags.byor = true;
  mineRows = [];
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("My asks BYOR invite action", () => {
  it("shows the invite action only on a waiting ask", async () => {
    stubPage([
      openAsk(42),
      openAsk(43, { waitingForCoverage: false, referrerId: 503 }),
      openAsk(44, { status: "closed", waitingForCoverage: false }),
    ]);
    renderPage();
    expect(await screen.findByRole("button", { name: "Invite someone you know" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Invite someone you know" })).toHaveLength(1);
  });

  it("renders no BYOR action and sends no invite request when the client flag is off", async () => {
    flags.byor = false;
    const fetch = stubPage([openAsk(42)]);
    renderPage();
    await screen.findByText("Product Designer");
    expect(screen.queryByRole("button", { name: /Invite someone|Link active|Revoke/ })).toBeNull();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("invite-link") || String(url).includes("ask-invites"))).toBe(false);
  });

  it("explains the rules and shows the one-time URL with copy after creation", async () => {
    const fetch = stubPage([openAsk(42)]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Invite someone you know" }));
    expect(await screen.findByText("This link works once and expires in seven days.")).toBeTruthy();
    expect(screen.getByText(/verified work email at Acme/)).toBeTruthy();
    expect(screen.getByText(/name and files stay hidden until the insider accepts/)).toBeTruthy();
    expect(screen.getByText("No credit is used until someone can see your referral request.")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toMatch(/referral request/i);
    expect(screen.getByRole("dialog").textContent).not.toMatch(/\bask\b/i);
    fireEvent.click(screen.getByRole("button", { name: "Create one-time link" }));
    const linkInput = await screen.findByRole("textbox", { name: "One-time invite link" }) as HTMLInputElement;
    await waitFor(() => expect(linkInput.value).toBe(URL));
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/invite-link"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
    fireEvent.click(screen.getByRole("button", { name: "Close invite sheet" }));
    expect(await screen.findByRole("button", { name: "Link active · copy" })).toBeTruthy();
  });

  it("does not promise a copy when an active link URL is no longer in this browser", async () => {
    stubPage([openAsk(42, { askInvite: { state: "active", createdAt: iso(Date.now()), expiresAt: iso(Date.now() + 7 * day) } })]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Link active" }));
    expect(await screen.findByText(/one-time URL is not saved in this browser/)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "One-time invite link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Link active · copy" })).toBeNull();
  });

  it("requires revoke confirmation and returns the waiting row to its invite action", async () => {
    stubPage([openAsk(42, { askInvite: { state: "active", createdAt: iso(Date.now()), expiresAt: iso(Date.now() + 7 * day) } })]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(await screen.findByRole("heading", { name: "Revoke this invite link?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revoke this link" })).toBeNull();
    expect(screen.getByRole("dialog").textContent).toMatch(/referral request/i);
    expect(screen.getByRole("dialog").textContent).not.toMatch(/\bask\b/i);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/invite-link/revoke"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Revoke link" }));
    expect(await screen.findByRole("button", { name: "Invite someone you know" })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/invite-link/revoke"))).toBe(true);
  });

  it.each(["claimed", "delivered"] as const)("shows neutral status copy for a %s link without exposing a name", async state => {
    stubPage([openAsk(42, { waitingForCoverage: false, referrerId: 503, askInvite: { state, createdAt: iso(Date.now()), expiresAt: iso(Date.now() + 7 * day) } })]);
    renderPage();
    expect(await screen.findByText("Your insider has your referral request.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Invite someone|Link active|Revoke/ })).toBeNull();
    expect(document.querySelector("main")?.textContent).not.toContain("503");
  });
});
