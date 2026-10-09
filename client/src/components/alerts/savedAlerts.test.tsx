// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SavedAlerts, domainInitials } from "./SavedAlerts";
import { seekerAlertSchema } from "./seekerAlertsApi";

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (status: number, body: unknown): Reply => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const WATCH = { id: 7, companyDomain: "merkle.com", paused: false, notifiedAt: null, createdAt: "2026-10-08T04:00:00.000Z" };
const getToken = vi.fn(async () => "test-token");

type Handler = (url: string, init?: RequestInit) => Reply | undefined;
function serve(handler: Handler, { alerts = [WATCH] as unknown[], plan = "free" as string | null } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const custom = handler(String(url), init);
    if (custom) return custom;
    if (String(url) === "/api/seeker-alerts" && !init?.method) return reply(200, { alerts });
    if (String(url).startsWith("/api/credits/summary")) return plan ? reply(200, { summary: { plan } }) : reply(500, { error: "We could not load your referral credits" });
    return reply(404, { error: "not mocked" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderSaved() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SavedAlerts userId="user-1" getToken={getToken} /></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Saved alerts tab", () => {
  it("draws the kit row for each live watch with its real status", async () => {
    serve(() => undefined, { alerts: [WATCH, { ...WATCH, id: 8, companyDomain: "tata-consultancy.com", paused: true }, { ...WATCH, id: 9, companyDomain: "wipro.com", notifiedAt: "2026-10-08T05:00:00.000Z" }] });
    renderSaved();
    expect(await screen.findByText("merkle.com")).toBeTruthy();
    expect(screen.getByText("Watching · instant")).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.getByText("Notified — door open")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume alert for tata-consultancy.com" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause alert for merkle.com" })).toBeTruthy();
    expect(await screen.findByText("Free accounts keep 3 alerts (3 used).")).toBeTruthy();
  });

  it("surfaces the server's Free cap message and keeps the typed domain", async () => {
    const fetchMock = serve((url, init) => (url === "/api/seeker-alerts" && init?.method === "POST" ? reply(400, { error: "Free accounts keep 3 alerts. Upgrade for unlimited alerts." }) : undefined));
    renderSaved();
    await screen.findByText("merkle.com");
    fireEvent.click(screen.getByRole("button", { name: "New alert" }));
    fireEvent.change(screen.getByLabelText("Company domain"), { target: { value: "globex.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save alert" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Free accounts keep 3 alerts. Upgrade for unlimited alerts.");
    expect(screen.queryByText("globex.com")).toBeNull();
    expect((screen.getByLabelText("Company domain") as HTMLInputElement).value).toBe("globex.com");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ companyDomain: "globex.com" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "New alert" })).toBeTruthy();
  });

  it("words the cap from the live plan, falling back to Free like the server", async () => {
    serve(() => undefined, { plan: "pro" });
    renderSaved();
    expect(await screen.findByText("Your plan allows unlimited alerts.")).toBeTruthy();
    cleanup();
    serve(() => undefined, { plan: null });
    renderSaved();
    expect(await screen.findByText("Free accounts keep 3 alerts (1 used).")).toBeTruthy();
  });

  it("shows loading, then an honest empty state with no sample companies", async () => {
    let release: (value: Reply) => void = () => undefined;
    const pending = new Promise<Reply>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url) === "/api/seeker-alerts" ? pending : reply(200, { summary: { plan: "free" } }))));
    renderSaved();
    expect(await screen.findByText("Loading your saved alerts…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New alert" })).toBeNull();
    release(reply(200, { alerts: [] }));
    expect(await screen.findByRole("heading", { name: "Get told when a door opens." })).toBeTruthy();
    expect(screen.queryByText("Loading your saved alerts…")).toBeNull();
    expect(screen.queryByText(/Merkle|Momentum/)).toBeNull();
  });

  it("surfaces a load error and recovers on Try again", async () => {
    let calls = 0;
    serve((url, init) => {
      if (url !== "/api/seeker-alerts" || init?.method) return undefined;
      calls += 1;
      return calls === 1 ? reply(500, { error: "We could not load your alerts" }) : undefined;
    });
    renderSaved();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not load your alerts");
    expect(screen.queryByRole("button", { name: "New alert" })).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("merkle.com")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rejects a malformed list and explains a network failure", async () => {
    serve((url, init) => (url === "/api/seeker-alerts" && !init?.method ? reply(200, { alerts: [{ id: "x", companyDomain: 4 }] }) : undefined));
    renderSaved();
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your saved alerts");
    expect(screen.queryByRole("heading", { name: "Get told when a door opens." })).toBeNull();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    renderSaved();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not reach SkipWait. Check your connection and try again.");
    expect(alert.textContent).not.toContain("Failed to fetch");
  });

  it("keeps a row as it was when the server refuses a pause or delete", async () => {
    serve((url, init) => {
      if (url === "/api/seeker-alerts/7" && init?.method === "PATCH") return reply(404, { error: "This alert is not in your account" });
      if (url === "/api/seeker-alerts/7" && init?.method === "DELETE") return reply(500, { error: "We could not remove this alert" });
      return undefined;
    });
    renderSaved();
    fireEvent.click(await screen.findByRole("button", { name: "Pause alert for merkle.com" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This alert is not in your account");
    expect(screen.getByRole("button", { name: "Pause alert for merkle.com" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete alert for merkle.com" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("We could not remove this alert"));
    expect(screen.getByText("merkle.com")).toBeTruthy();
  });
});

describe("saved alert helpers", () => {
  it("derives the kit company mark from the domain", () => {
    expect(domainInitials("merkle.com")).toBe("M");
    expect(domainInitials("tata-consultancy.com")).toBe("TC");
    expect(domainInitials("")).toBe("?");
  });

  it("parses the server row shape and rejects unknown states", () => {
    expect(seekerAlertSchema.safeParse({ ...WATCH, userId: 3 }).success).toBe(true);
    expect(seekerAlertSchema.safeParse({ ...WATCH, paused: "no" }).success).toBe(false);
    expect(seekerAlertSchema.safeParse({ ...WATCH, notifiedAt: undefined }).success).toBe(false);
  });
});
