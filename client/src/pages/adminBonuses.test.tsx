// @vitest-environment jsdom
// D-099 slice A (D-374): /admin/bonuses honest states. Written before the page.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminBonuses from "./AdminBonuses";

const authState: { isSignedIn: boolean; getToken: () => Promise<string | null>; openSignIn: () => void } = { isSignedIn: true, getToken: async () => "token", openSignIn: vi.fn() };
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }) }));

const rows = [
  { company: { id: 10, slug: "wipro", name: "Wipro", initials: "W", status: "listed" }, bonus: { amountMinor: 5_000_000, currency: "INR", upTo: false, scopeNote: null, sourceUrl: "https://www.wipro.com/careers/referrals", sourceHost: "www.wipro.com", checkedAt: "2026-11-01T00:00:00.000Z", stale: false }, openReports: 1 },
  { company: { id: 11, slug: "tcs", name: "TCS", initials: "T", status: "listed" }, bonus: null, openReports: 0 },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminBonuses /></QueryClientProvider>);
}

beforeEach(() => {
  authState.isSignedIn = true;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/admin/company-bonuses" && (!init || init.method === "GET")) return { ok: true, status: 200, json: async () => ({ bonuses: rows }) } as Response;
    if (url.startsWith("/api/admin/company-bonus-reports")) return { ok: true, status: 200, json: async () => ({ reports: [{ id: 1, company: { slug: "wipro", name: "Wipro" }, reason: "figure_changed", note: "Changed", suggestedSourceUrl: null, status: "open", createdAt: "2026-11-20T00:00:00.000Z" }] }) } as Response;
    if (String(url).includes("/decision")) return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    if (String(url).includes("/withdraw")) return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    if (init?.method === "PUT") return { ok: false, status: 400, json: async () => ({ error: "The source must be on Wipro's own website." }) } as Response;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("AdminBonuses", () => {
  it("shows the access gate on a 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: "Administrator access is required" }) }) as Response));
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/administrator access is required/i).length).toBeGreaterThan(0));
  });

  it("lists companies with their figure and open reports", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Wipro")).toBeTruthy());
    expect(screen.getByText(/₹50,000/)).toBeTruthy();
    expect(screen.getByText(/1 open report/)).toBeTruthy();
    expect(screen.getByText("No figure")).toBeTruthy();
  });

  it("shows the server's 400 message under the form", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Wipro")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("button", { name: /edit/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /save figure/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("own website"));
  });

  it("withdraws only after a confirm", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/company-bonuses" && (!init || init.method === "GET")) return { ok: true, status: 200, json: async () => ({ bonuses: rows }) } as Response;
      if (url.startsWith("/api/admin/company-bonus-reports")) return { ok: true, status: 200, json: async () => ({ reports: [] }) } as Response;
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitFor(() => expect(screen.getByText("Wipro")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("button", { name: /edit/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /^withdraw$/i }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/withdraw"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /confirm withdraw/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/withdraw"))).toBe(true));
  });

  it("decides an open report", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/company-bonuses" && (!init || init.method === "GET")) return { ok: true, status: 200, json: async () => ({ bonuses: rows }) } as Response;
      if (url.startsWith("/api/admin/company-bonus-reports")) return { ok: true, status: 200, json: async () => ({ reports: [{ id: 1, company: { slug: "wipro", name: "Wipro" }, reason: "figure_changed", note: "Changed", suggestedSourceUrl: null, status: "open", createdAt: "2026-11-20T00:00:00.000Z" }] }) } as Response;
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitFor(() => expect(screen.getByText(/figure_changed/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /^fixed$/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/decision"))).toBe(true));
  });
});
