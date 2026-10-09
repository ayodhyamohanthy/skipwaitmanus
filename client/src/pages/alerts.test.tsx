// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Alerts from "./Alerts";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/alerts", go],
}));

// Fixed local midday: "12 minutes ago" must be today whatever time CI runs (a run just after
// midnight UTC used to push these onto yesterday and break the Today group).
const now = new Date(2026, 9, 9, 12, 0, 0).getTime();
const ITEMS = [
  { id: 1, category: "referral", title: "Your ask was accepted", body: "A verified referrer at Wipro accepted", readAt: null, createdAt: new Date(now - 12 * 60000).toISOString() },
  { id: 2, category: "message", title: "New message", body: "Happy to help", readAt: null, createdAt: new Date(now - 60 * 60000).toISOString() },
  { id: 3, category: "system", title: "Weekly summary", body: "Your week on SkipWait", readAt: new Date(now - 2 * 86400000).toISOString(), createdAt: new Date(now - 2 * 86400000).toISOString() },
];

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); vi.useFakeTimers({ toFake: ["Date"], now }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Alerts center", () => {
  it("groups real notifications into Today and Earlier with unread counts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ notifications: ITEMS }) })));
    render(<Alerts />);
    expect(await screen.findByText("TODAY")).toBeTruthy();
    expect(screen.getByText("EARLIER")).toBeTruthy();
    expect(screen.getByText("Your ask was accepted")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /unread \(2\)/i })).toBeTruthy();
  });

  it("filters to unread and celebrates caught-up state honestly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ notifications: ITEMS }) })));
    render(<Alerts />);
    await screen.findByText("Your ask was accepted");
    fireEvent.click(screen.getByRole("tab", { name: /unread/i }));
    expect(screen.queryByText("Weekly summary")).toBeNull();
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("opens a notification by marking it read then following its category", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/read")) return { ok: true, json: async () => ({ success: true }) };
      return { ok: true, json: async () => ({ notifications: ITEMS }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Alerts />);
    fireEvent.click(await screen.findByRole("button", { name: /Your ask was accepted, unread/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/notifications/1/read", expect.objectContaining({ method: "POST" })));
    expect(go).toHaveBeenCalledWith("/requests");
  });

  it("marks every unread item read in one action", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/read")) return { ok: true, json: async () => ({ success: true }) };
      return { ok: true, json: async () => ({ notifications: ITEMS }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Alerts />);
    await screen.findByText("Your ask was accepted");
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/read")).length).toBe(2));
    fireEvent.click(screen.getByRole("tab", { name: /unread/i }));
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
  });

  it("shows a truthful empty state with no fabricated activity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ notifications: [] }) })));
    render(<Alerts />);
    expect(await screen.findByText("No notifications yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore companies" })).toBeTruthy();
  });

  it("manages saved company alerts without inventing matches", async () => {
    const alerts = [{ id: 1, companyDomain: "acme.com", paused: false, notifiedAt: null, createdAt: new Date(now).toISOString() }];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/seeker-alerts") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return { ok: true, json: async () => ({ alert: { id: 2, companyDomain: body.companyDomain, paused: false, notifiedAt: null, createdAt: new Date().toISOString() } }) };
      }
      if (String(url).includes("/seeker-alerts/1") && init?.method === "PATCH") return { ok: true, json: async () => ({ alert: { ...alerts[0], paused: true } }) };
      if (String(url).includes("/seeker-alerts/1") && init?.method === "DELETE") return { ok: true, json: async () => ({}) };
      if (String(url).includes("/seeker-alerts")) return { ok: true, json: async () => ({ alerts }) };
      if (String(url).includes("/credits/summary")) return { ok: true, json: async () => ({ summary: { plan: "free" } }) };
      return { ok: true, json: async () => ({ notifications: [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Alerts />);
    fireEvent.click(await screen.findByRole("tab", { name: "Saved alerts" }));
    expect(await screen.findByText("acme.com")).toBeTruthy();
    expect(screen.getByText(/Free accounts keep 3 alerts/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("acme.com"), { target: { value: "Globex" } });
    fireEvent.click(screen.getByRole("button", { name: "New alert" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/seeker-alerts", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Globex")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause alert for acme.com" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume alert for acme.com" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Delete alert for acme.com" }));
    await waitFor(() => expect(screen.queryByText("acme.com")).toBeNull());
  });
});
