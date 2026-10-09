// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BlockedPeople from "../components/settings/BlockedPeople";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState }));

beforeEach(() => { authState.isSignedIn = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });

describe("BlockedPeople settings section", () => {
  it("lists blocks and removes one on unblock", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return ok({ unblocked: true });
      expect(String(url)).toBe("/api/blocks/mine");
      return ok({ blocks: [{ id: 7, blockedUserId: 22, reason: null, createdAt: "2026-09-01T00:00:00.000Z" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<BlockedPeople />);
    expect(await screen.findByText("Blocked member")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    expect(await screen.findByText(/Nobody blocked/)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/blocks/7" && init?.method === "DELETE")).toBe(true);
  });

  it("shows the empty state with no blocks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ blocks: [] })));
    render(<BlockedPeople />);
    expect(await screen.findByText(/Nobody blocked/)).toBeTruthy();
  });

  it("retries after a load failure", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++calls === 1 ? { ok: false, status: 500, json: async () => ({}) } : ok({ blocks: [] }))));
    render(<BlockedPeople />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Nobody blocked/)).toBeTruthy();
  });
});
