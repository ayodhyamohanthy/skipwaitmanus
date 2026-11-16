// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Alerts from "./Alerts";

const { authState, go } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true, userId: "user-1", getToken: vi.fn().mockResolvedValue("test-token") },
  go: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  useUser: () => ({ user: null }),
  SignInButton: ({ children, className }: { children?: React.ReactNode; className?: string }) => <button type="button" className={className}>{children}</button>,
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
  { id: 3, category: "system", title: "Weekly summary", body: "Your week on skipwait.me", readAt: new Date(now - 2 * 86400000).toISOString(), createdAt: new Date(now - 2 * 86400000).toISOString() },
];

type FetchReply = { ok: boolean; status?: number; json: () => Promise<unknown> };
const ok = (body: unknown): FetchReply => ({ ok: true, status: 200, json: async () => body });
const list = (notifications: unknown[] = ITEMS) => ok({ notifications });

function renderAlerts() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(<QueryClientProvider client={client}><Alerts /></QueryClientProvider>);
}

// Referral-alert routing on the server's verified-referrer verdict lives in alerts.referrerRouting.test.tsx.
const ACCESS_PATH = "/api/company-referrals/access";
const UNVERIFIED_ACCESS = ok({ verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });

beforeEach(() => { authState.isSignedIn = true; authState.isLoaded = true; go.mockReset(); vi.useFakeTimers({ toFake: ["Date"], now }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Alerts center", () => {
  it("groups real notifications into Today and Earlier with the unread count on the Notifications tab", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => list()));
    renderAlerts();
    expect(await screen.findByText("TODAY")).toBeTruthy();
    expect(screen.getByText("EARLIER")).toBeTruthy();
    expect(screen.getByText("Your ask was accepted")).toBeTruthy();
    const tab = screen.getByRole("tab", { name: /Notifications, 2 unread/ });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Alerts.");
    expect(screen.getByText("STAY IN THE LOOP")).toBeTruthy();
  });

  it("lists rows in kit feed order, newest first even when a newer row is already read", async () => {
    const readNewest = { id: 4, category: "status", title: "Request updated", body: "Your ask moved to Referred", readAt: new Date(now - 2 * 60000).toISOString(), createdAt: new Date(now - 5 * 60000).toISOString() };
    vi.stubGlobal("fetch", vi.fn(async () => list([...ITEMS, readNewest])));
    renderAlerts();
    await screen.findByText("Request updated");
    const today = screen.getByText("TODAY").parentElement as HTMLElement;
    expect(within(today).getAllByRole("button").map(row => row.getAttribute("aria-label"))).toEqual(["Request updated", "Your ask was accepted, unread", "New message, unread"]);
  });

  it("draws the kit 36px toolbar controls with a 44px tap target", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => list()));
    renderAlerts();
    await screen.findByText("Your ask was accepted");
    for (const name of ["All", "Unread"]) {
      const classes = screen.getByRole("button", { name }).className.split(" ");
      expect(classes).toEqual(expect.arrayContaining(["min-h-9", "relative", "before:absolute", "before:-inset-y-1"]));
      expect(classes).not.toContain("min-h-11");
    }
    const markAll = screen.getByRole("button", { name: "Mark all read" }).className.split(" ");
    expect(markAll).toEqual(expect.arrayContaining(["h-8", "relative", "before:absolute", "before:-inset-y-1.5"]));
    expect(markAll).not.toContain("min-h-11");
  });

  it("filters to unread and celebrates caught-up state honestly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => list()));
    renderAlerts();
    await screen.findByText("Your ask was accepted");
    fireEvent.click(screen.getByRole("button", { name: "Unread" }));
    expect(screen.getByRole("button", { name: "Unread" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Weekly summary")).toBeNull();
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("marks every unread item read in one action", async () => {
    const fetchMock = vi.fn(async (url: string) => String(url).endsWith("/read") ? ok({ success: true }) : list());
    vi.stubGlobal("fetch", fetchMock);
    renderAlerts();
    await screen.findByText("Your ask was accepted");
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/read")).length).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: "Unread" }));
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /unread/ })).toBeNull();
  });

  it("keeps an item unread when the server does not confirm the read", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url) === "/api/notifications/2/read") return { ok: false, status: 503, json: async () => ({ error: "Notifications are unavailable right now" }) };
      if (String(url).endsWith("/read")) return ok({ success: true });
      return list();
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAlerts();
    await screen.findByText("Your ask was accepted");
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(await screen.findByText("Some alerts could not be marked read. Try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /New message, unread/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Your ask was accepted" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Notifications, 1 unread/ })).toBeTruthy();
  });

  it("shows a truthful empty state with no fabricated activity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => list([])));
    renderAlerts();
    expect(await screen.findByText("No notifications yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore companies" })).toBeTruthy();
    // Idle kit ghost (aria-disabled), not the native disabled grey pill; clicking it does nothing.
    const markAll = screen.getByRole("button", { name: "Mark all read" });
    expect(markAll.getAttribute("aria-disabled")).toBe("true");
    expect(markAll).toHaveProperty("disabled", false);
    const calls = vi.mocked(fetch).mock.calls.length;
    fireEvent.click(markAll);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    expect(screen.getByText("When a referrer replies or a new one opens at your alert companies, it lands here.")).toBeTruthy();
  });

  it("shows a loading status while the first fetch is in flight", async () => {
    let release: (reply: FetchReply) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn((url: string) => String(url) === ACCESS_PATH ? Promise.resolve(UNVERIFIED_ACCESS) : new Promise<FetchReply>(resolve => { release = resolve; })));
    renderAlerts();
    expect(await screen.findByText("Loading your alerts…")).toBeTruthy();
    expect(screen.queryByText("No notifications yet.")).toBeNull();
    release(list([]));
    expect(await screen.findByText("No notifications yet.")).toBeTruthy();
    expect(screen.queryByText("Loading your alerts…")).toBeNull();
  });

  it("surfaces a load error and recovers on Try again", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url) === ACCESS_PATH) return UNVERIFIED_ACCESS;
      calls += 1;
      return calls === 1 ? { ok: false, status: 401, json: async () => ({ error: "Sign in to view your private updates" }) } : list();
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAlerts();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Sign in to view your private updates");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Your ask was accepted")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains a network failure instead of leaking the raw fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    renderAlerts();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not reach skipwait.me. Check your connection and try again.");
    expect(alert.textContent).not.toContain("Failed to fetch");
  });

  it("rejects a malformed payload instead of rendering a partial list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ notifications: [{ id: "x", title: 4 }] })));
    renderAlerts();
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your alerts");
    expect(screen.queryByText("No notifications yet.")).toBeNull();
  });

  it("shows an honest empty Saved alerts tab from the live watch list, never sample companies", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url) === "/api/seeker-alerts") return ok({ alerts: [] });
      return list();
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAlerts();
    await screen.findByText("Your ask was accepted");
    fireEvent.click(screen.getByRole("tab", { name: "Saved alerts" }));
    expect(screen.getByRole("tab", { name: "Saved alerts" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByRole("heading", { name: "Get told when a door opens." })).toBeTruthy();
    expect(await screen.findByText("Free: 3 alerts")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New alert" })).toBeTruthy();
    for (const fake of [/Merkle/, /Instant · push and email/, /Saved company alerts aren't available yet/]) expect(screen.queryByText(fake)).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark all read" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/seeker-alerts", expect.objectContaining({ credentials: "include" }));
  });

  it("gates signed-out visitors without fetching private updates", () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn(async () => list());
    vi.stubGlobal("fetch", fetchMock);
    renderAlerts();
    expect(screen.getByText("Alerts need you signed in.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
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
      return { ok: true, json: async () => ({ notifications: [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAlerts();
    fireEvent.click(await screen.findByRole("tab", { name: "Saved alerts" }));
    expect(await screen.findByText("acme.com")).toBeTruthy();
    expect(screen.getByText("Free: 3 alerts")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New alert" }));
    fireEvent.change(screen.getByPlaceholderText("acme.com"), { target: { value: "Globex" } });
    fireEvent.click(screen.getByRole("button", { name: "Save alert" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/seeker-alerts", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Globex")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause alert for acme.com" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume alert for acme.com" })).toBeTruthy());
    expect(screen.getByText("Paused")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete alert for acme.com" }));
    await waitFor(() => expect(screen.queryByText("acme.com")).toBeNull());
  });
});
