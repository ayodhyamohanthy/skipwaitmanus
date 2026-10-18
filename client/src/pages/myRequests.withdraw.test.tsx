// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyRequests from "./MyRequests";

const { go, getToken } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("test-token") }));

// A stable getToken matters here: MyRequests' load effect depends on it, so a
// per-render vi.fn() would re-run the effect on every render in tests.
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 4106, getToken }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/requests", go] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MyRequests /></QueryClientProvider>);
}


beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [] }) })));
});
afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

const pendingRequest = { id: 12, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", status: "pending", referrerId: null, queueStatus: null, referrerMessage: null, unreadMessageCount: 0, createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", attachmentCount: 1 };
const claimedRequest = { ...pendingRequest, id: 13, status: "pending", referrerId: 77, queueStatus: "available_for_review" };
const slots = { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: { id: "momentum", label: "Momentum", openRequests: 15 } };

function stubRequestsFetch(requests: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests, slots }) })));
}

// Kit v4: the Requests row is a single link card. Withdraw lives in the thread
// (SeekerPanel's confirm modal, covered by referralConversation.test.tsx), so
// the list never offers an inline Withdraw or its dialog.
describe("My Requests withdraw entry point", () => {
  it("opens an unclaimed pending ask in its thread, with no inline Withdraw or Ref reference", async () => {
    stubRequestsFetch([pendingRequest]);
    renderPage();
    const row = await screen.findByLabelText("acme.com request, Requested");
    expect(row.getAttribute("href")).toBe("/conversation/12");
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(row.textContent).not.toContain("Ref-1012");
    // The kit slot meter: this one open ask holds 1 of the Free plan's 3 slots.
    expect(screen.getByText("OPEN SLOTS · FREE")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Open slots used" }).getAttribute("aria-valuenow")).toBe("1"));
  });

  it("shows a claimed ask's review state and still offers no list-level Withdraw", async () => {
    stubRequestsFetch([claimedRequest]);
    renderPage();
    const row = await screen.findByLabelText("acme.com request, Requested");
    expect(row.closest("li")?.textContent).toContain("Available for review");
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });

  // P0-allocated-ask-stuck: a delivered ask nobody picked up is withdrawable, so with every slot in use the
  // list's full-slots note offers withdrawing it (the list's withdraw signal; Withdraw itself lives in the thread).
  it("counts a pending ask with unclaimedAssignment as withdrawable when every slot is in use", async () => {
    const full = { ...slots, open: 3, full: true };
    const claimed = (id: number) => ({ ...claimedRequest, id });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [claimed(21), claimed(22), { ...claimed(23), unclaimedAssignment: true }], slots: full }) })));
    renderPage();
    expect(await screen.findByText(/All 3 slots are in use\./)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Wait for an answer, withdraw an ask, or get more slots with Momentum (15).");
  });

  it("does not offer withdrawing when every open ask was picked up", async () => {
    const full = { ...slots, open: 3, full: true };
    const claimed = (id: number) => ({ ...claimedRequest, id });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [claimed(21), claimed(22), { ...claimed(23), unclaimedAssignment: false }], slots: full }) })));
    renderPage();
    expect(await screen.findByText(/All 3 slots are in use\./)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Wait for an answer or get more slots with Momentum (15).");
  });

  it("never calls the withdraw endpoint from the list", async () => {
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => ({ requests: [pendingRequest], slots }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    fireEvent.click(await screen.findByLabelText("acme.com request, Requested"));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/withdraw"))).toBe(false);
  });
});
