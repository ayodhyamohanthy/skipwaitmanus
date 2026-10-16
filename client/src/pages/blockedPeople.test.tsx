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

/**
 * Standalone block initiation (gate item 3.2's open gap).
 *
 * The server always accepted it -- POST /api/blocks takes `blockedUserId` or
 * `referralRequestId`. What was missing was any way to reach it from Settings:
 * the Panel listed blocks and removed them, full stop. These pin the client half.
 */
describe("BlockedPeople settings Panel — blocking a member directly", () => {
  const fillAndSubmit = (id: string, reason?: string) => {
    fireEvent.change(screen.getByLabelText("Block a member"), { target: { value: id } });
    if (reason !== undefined) fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: reason } });
    fireEvent.click(screen.getByRole("button", { name: "Block member" }));
  };

  it("posts the member id and refetches the list", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return ok({ blocked: true, created: true, id: 9, blockedUserId: 22 });
      return ok({ blocks: [{ id: 9, blockedUserId: 22, reason: "spam", createdAt: "2026-10-16T00:00:00.000Z" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();
    expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();

    fillAndSubmit("22", "spam");

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post, "a block must actually be created").toBeTruthy();
    expect(String(post![0])).toBe("/api/blocks");
    expect(JSON.parse(String(post![1]?.body))).toMatchObject({ blockedUserId: 22, reason: "spam" });
    // The 201 carries no reason or createdAt, so the row is refetched rather than invented.
    expect(await screen.findByText("Member · blocked · spam")).toBeTruthy();
  });

  it("omits the reason entirely when none is given", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? ok({ blocked: true, created: true, id: 9, blockedUserId: 22 }) : ok({ blocks: [] }));
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();
    expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();

    fillAndSubmit("22");

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post![1]?.body))).toEqual({ blockedUserId: 22 });
  });

  it("refuses a non-numeric, zero or negative id without calling the server", async () => {
    // The server would also reject these; rejecting client-side avoids a round trip that
    // can only fail, and the message is the same either way.
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? ok({ blocked: true, created: true, id: 9, blockedUserId: 22 }) : ok({ blocks: [] }));
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();
    expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();

    for (const bad of ["abc", "0", "-3", "1.5", "  "]) {
      fillAndSubmit(bad);
      expect(await screen.findByRole("alert")).toBeTruthy();
    }
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("keeps the input and shows the server's own message when the block is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? { ok: false, status: 400, json: async () => ({ error: "You cannot block yourself" }) }
        : ok({ blocks: [] })));
    renderPanel();
    expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();

    fillAndSubmit("99");

    expect((await screen.findByRole("alert")).textContent).toContain("You cannot block yourself");
    // Still filled in, so a typo is corrected rather than retyped.
    expect((screen.getByLabelText("Block a member") as HTMLInputElement).value).toBe("99");
  });

  it("clears the form on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? ok({ blocked: true, created: true, id: 9, blockedUserId: 22 }) : ok({ blocks: [] })));
    renderPanel();
    expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();

    fillAndSubmit("22", "spam");
    await screen.findByRole("button", { name: "Block member" });

    expect((screen.getByLabelText("Block a member") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/Reason/) as HTMLInputElement).value).toBe("");
  });

  it("disables the button until an id is entered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ blocks: [] })));
    renderPanel();
    expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Block member" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Block a member"), { target: { value: "22" } });
    expect(button.disabled).toBe(false);
  });
});
