// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Notifications from "./Notifications";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("tok") }), SignInButton: ({ children }: { children: React.ReactNode }) => children, useUser: () => ({ user: { emailAddresses: [] } }) }));
vi.mock("wouter", () => ({ useLocation: () => ["", vi.fn()] }));

const unreadItem = { id: 7, category: "message" as const, title: "New message", body: "A private note waits for you.", readAt: null, createdAt: "2026-10-08T10:00:00.000Z" };

describe("notifications page", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: true, json: async () => ({ success: true }) };
      return { ok: true, json: async () => ({ notifications: [unreadItem] }) };
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("renders the loaded update with its unread count", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Notifications /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "New message" })).toBeTruthy());
    expect(screen.getByText("1 unread update")).toBeTruthy();
  });

  it("marks the update read after opening it and shows the caught-up copy", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Notifications /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: /Read update/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Read update/ }));
    await waitFor(() => expect(screen.getByText("You’re all caught up")).toBeTruthy());
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url) === "/api/notifications/7/read" && (init as RequestInit)?.method === "POST")).toBe(true);
  });
});
