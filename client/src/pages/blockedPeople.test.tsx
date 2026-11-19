// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BlockedPeople, { blockLabel } from "../components/settings/BlockedPeople";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState }));

beforeEach(() => { authState.isSignedIn = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });
const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><BlockedPeople /></QueryClientProvider>);
};

describe("BlockedPeople settings Panel", () => {
  it("lists blocks and removes one only after the server confirms the unblock", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return ok({ unblocked: true });
      expect(String(url)).toBe("/api/blocks/mine");
      return ok({ blocks: [{ id: 7, blockedUserId: 22, reason: null, createdAt: "2026-09-01T00:00:00.000Z" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();
    expect(await screen.findByText(/^Member · blocked/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/blocks/7" && init?.method === "DELETE")).toBe(true);
  });

  it("keeps the row and announces the failure when the unblock fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "DELETE" ? { ok: false, status: 500, json: async () => ({}) } : ok({ blocks: [{ id: 7, blockedUserId: 22, reason: "spam", createdAt: null }] }))));
    renderPanel();
    expect(await screen.findByText("Member · blocked · spam")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not remove this block");
    expect(screen.getByText("Member · blocked · spam")).toBeTruthy();
  });

  it("shows the kit empty state with no blocks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ blocks: [] })));
    renderPanel();
    expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();
  });

  it("retries after a load failure", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++calls === 1 ? { ok: false, status: 500, json: async () => ({}) } : ok({ blocks: [] }))));
    renderPanel();
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();
  });

  it("builds the row line from what the server knows", () => {
    expect(blockLabel({ id: 1, blockedUserId: 2, reason: "Asked for payment", createdAt: "not a date" })).toBe("Member · blocked · Asked for payment");
  });
});
