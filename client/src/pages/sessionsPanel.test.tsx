// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPanels } from "../components/settings/AccountPanels";

vi.mock("wouter", async () => ({ ...(await vi.importActual<object>("wouter")), useLocation: () => ["/", vi.fn()] }));

let list: unknown;
const calls: string[] = [];
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body, text: async () => JSON.stringify(body) });

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input); calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/account/sessions") return reply(200, list);
    if (url.startsWith("/api/account/sessions/")) return reply(200, { revoked: 1 });
    if (url.includes("company-referrals/access")) return reply(200, { verifiedCompanyAccess: false });
    if (url.includes("privacy/requests")) return reply(200, { requests: [] });
    return reply(404, {});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPanel = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><AccountPanels getToken={async () => "t"} /></QueryClientProvider>);

describe("Where you're signed in", () => {
  it("lists devices, marks this one, and signs a single other device out", async () => {
    list = { sessions: [{ id: "session_cur", device: "Chrome on macOS", current: true, lastActive: null }, { id: "session_two", device: "Safari on iOS", current: false, lastActive: null }], currentKnown: true };
    renderPanel();
    expect(await screen.findByText("Chrome on macOS · This device")).toBeTruthy();
    expect(screen.getByText(/up to 30 minutes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(calls).toContain("DELETE /api/account/sessions/session_two"));
  });
  it("offers sign out everywhere else only when the current device is known", async () => {
    list = { sessions: [{ id: "a", device: "Chrome on macOS", current: false }, { id: "b", device: "Safari on iOS", current: false }], currentKnown: false };
    renderPanel();
    await screen.findByText("Safari on iOS");
    expect(screen.queryByRole("button", { name: "Sign out everywhere else" })).toBeNull();
  });
  it("says so when nothing can be listed", async () => {
    list = { sessions: [], currentKnown: false };
    renderPanel();
    expect(await screen.findByText(/signed in on this device/)).toBeTruthy();
  });
});
