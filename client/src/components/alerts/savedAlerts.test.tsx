// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import { SavedAlerts, alertIdentity, domainInitials } from "./SavedAlerts";
import { seekerAlertSchema } from "./seekerAlertsApi";

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (status: number, body: unknown): Reply => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const WATCH = { id: 7, companyDomain: "merkle.com", paused: false, notifiedAt: null, createdAt: "2026-10-08T04:00:00.000Z" };
const getToken = vi.fn(async () => "test-token");
// GET /api/companies as the server serves it (shared/companies.ts contract), nobody open.
const DIRECTORY = LAUNCH_COMPANY_SEED.map(({ sortOrder: _order, ...company }) => ({ ...company, functions: [...company.functions], domains: [...company.domains], openToReferrals: false }));

type Handler = (url: string, init?: RequestInit) => Reply | undefined;
function serve(handler: Handler, { alerts = [WATCH] as unknown[] } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const custom = handler(String(url), init);
    if (custom) return custom;
    if (String(url) === "/api/seeker-alerts" && !init?.method) return reply(200, { alerts });
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
    expect(screen.getByText("Free: 3 alerts")).toBeTruthy();
  expect(screen.queryByText(/Momentum and Land/)).toBeNull();
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

  it("states the plan caps with the kit footnote and leaves enforcement to the server", async () => {
    const fetchMock = serve(() => undefined);
    renderSaved();
    await screen.findByText("merkle.com");
    expect(screen.getByText("Free: 3 alerts")).toBeTruthy();
  expect(screen.queryByText(/Momentum and Land/)).toBeNull();
    expect(screen.queryByText(/used\)/)).toBeNull();
    // Only the watch list and the public directory (for row names): no plan or quota read.
    await waitFor(() => expect(fetchMock.mock.calls.map(([url]) => String(url)).sort()).toEqual(["/api/companies", "/api/seeker-alerts"]));
  });

  it("names a watched domain from the company directory and keeps any other domain as typed", async () => {
    serve(url => (url === "/api/companies" ? reply(200, { companies: DIRECTORY, openCount: 0 }) : undefined), { alerts: [WATCH, { ...WATCH, id: 8, companyDomain: "skipwait.me" }, { ...WATCH, id: 9, companyDomain: "globex.com" }] });
    renderSaved();
    expect(await screen.findByText("Merkle")).toBeTruthy();
    const rows = screen.getAllByRole("listitem");
    expect(rows.map(row => row.querySelector(".company-mark")?.textContent)).toEqual(["M", "SW", "G"]);
    expect(within(rows[1]).getByText("skipwait.me")).toBeTruthy();
    expect(within(rows[2]).getByText("globex.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause alert for skipwait.me" })).toBeTruthy();
    expect(screen.queryByText("merkle.com")).toBeNull();
  });

  it("keeps the watched domain when the directory cannot load", async () => {
    serve(url => (url === "/api/companies" ? reply(503, { error: "down" }) : undefined));
    renderSaved();
    expect(await screen.findByText("merkle.com")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("button", { name: "Pause alert for merkle.com" })).toBeTruthy();
  });

  it("draws kit size-9 icon buttons that keep a 44px tap target", async () => {
    serve(() => undefined);
    renderSaved();
    for (const name of ["Pause alert for merkle.com", "Delete alert for merkle.com"]) {
      const classes = (await screen.findByRole("button", { name })).className.split(" ");
      expect(classes).toEqual(expect.arrayContaining(["size-9", "relative", "before:absolute", "before:-inset-1"]));
      expect(classes).not.toContain("size-11");
    }
  });

  it("shows loading, then an honest empty state with no sample companies", async () => {
    let release: (value: Reply) => void = () => undefined;
    const pending = new Promise<Reply>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url) === "/api/seeker-alerts" ? pending : reply(404, { error: "not mocked" }))));
    renderSaved();
    expect(await screen.findByText("Loading your saved alerts…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New alert" })).toBeNull();
    expect(screen.queryByText(/Free: 3 alerts/)).toBeNull();
    release(reply(200, { alerts: [] }));
    expect(await screen.findByRole("heading", { name: "Get told when a door opens." })).toBeTruthy();
    expect(screen.queryByText("Loading your saved alerts…")).toBeNull();
    expect(screen.queryByText(/Merkle|merkle/)).toBeNull();
    expect(screen.getByText("Free: 3 alerts")).toBeTruthy();
  expect(screen.queryByText(/Momentum and Land/)).toBeNull();
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
    expect(alert.textContent).toContain("We could not reach skipwait.me. Check your connection and try again.");
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
  it("resolves directory identity by any company domain, case-insensitively", () => {
    expect(alertIdentity("Merkle.com", DIRECTORY)).toEqual({ name: "Merkle", mark: "M" });
    expect(alertIdentity("goneutrinos.com", DIRECTORY)).toEqual({ name: "Neutrinos", mark: "N" });
    expect(alertIdentity("neutrinos.com", DIRECTORY)).toEqual({ name: "Neutrinos", mark: "N" });
    expect(alertIdentity("tata-consultancy.com", DIRECTORY)).toEqual({ name: "tata-consultancy.com", mark: "TC" });
    expect(alertIdentity("merkle.com", [])).toEqual({ name: "merkle.com", mark: "M" });
  });

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
