// @vitest-environment jsdom
// /requests never offers an inline Withdraw: the list is one link per ask and
// the thread owns the confirm. The full-slots note still names withdrawing only
// when a listable ask can actually be withdrawn (P0-allocated-ask-stuck).
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyRequests from "./MyRequests";

const { go, getToken, auth } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("test-token"), auth: { openSignIn: vi.fn() } }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 4106, getToken, openSignIn: auth.openSignIn }),
  useUser: () => ({ user: { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/requests", go],
}));
vi.mock("sonner", () => ({ toast: vi.fn() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MyRequests /></QueryClientProvider>);
}

const pendingRequest = { id: 12, title: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", companyName: null, companyInitials: null, status: "pending", referrerId: null, queueStatus: null, referrerMessage: null, unreadMessageCount: 0, createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", attachmentCount: 1 };
const claimedRequest = { ...pendingRequest, id: 13, status: "pending", referrerId: 77, queueStatus: "available_for_review" };
const slots = { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: { id: "momentum", label: "Momentum", openRequests: 15 } };

function stubRequestsFetch(requests: unknown[], slotBody: unknown = slots) {
  const fetchMock = vi.fn(async (url: string) => String(url).includes("/api/credits/summary")
    ? { ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 4 } }) }
    : { ok: true, status: 200, json: async () => ({ requests, slots: slotBody }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

describe("My asks withdraw entry point", () => {
  it("opens an unclaimed pending ask in its thread, with no inline Withdraw or Ref reference", async () => {
    stubRequestsFetch([pendingRequest]);
    renderPage();
    const row = (await screen.findByText("Product Designer")).closest("a");
    expect(row?.getAttribute("href")).toBe("/conversation/12");
    expect(row?.textContent).toContain("Waiting");
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(row?.textContent).not.toContain("Ref-1012");
    expect((await screen.findByTestId("asks-slots")).textContent).toBe("Open asks 1 of 3 · Free plan");
  });

  it("shows a claimed ask's review state and still offers no list-level Withdraw", async () => {
    stubRequestsFetch([claimedRequest]);
    renderPage();
    const row = (await screen.findByText("Product Designer")).closest("a");
    expect(row?.textContent).toContain("Under review");
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });

  // P0-allocated-ask-stuck: a delivered ask nobody picked up is withdrawable, so with every slot in use the
  // list's full-slots note offers withdrawing it (the list's withdraw signal; Withdraw itself lives in the thread).
  it("counts a pending ask with unclaimedAssignment as withdrawable when every slot is in use", async () => {
    const full = { ...slots, open: 3, full: true };
    const claimed = (id: number) => ({ ...claimedRequest, id });
    stubRequestsFetch([claimed(21), claimed(22), { ...claimed(23), unclaimedAssignment: true }], full);
    renderPage();
    const lead = await screen.findByText(/All 3 slots are in use\./);
    expect(lead.closest('[role="status"]')?.textContent).toContain("Wait for an answer, withdraw an ask, or get more slots with Momentum (15).");
  });

  it("does not offer withdrawing when every open ask was picked up", async () => {
    const full = { ...slots, open: 3, full: true };
    const claimed = (id: number) => ({ ...claimedRequest, id });
    stubRequestsFetch([claimed(21), claimed(22), { ...claimed(23), unclaimedAssignment: false }], full);
    renderPage();
    const lead = await screen.findByText(/All 3 slots are in use\./);
    expect(lead.closest('[role="status"]')?.textContent).toContain("Wait for an answer or get more slots with Momentum (15).");
  });

  it("never calls the withdraw endpoint from the list", async () => {
    const fetchMock = stubRequestsFetch([pendingRequest]);
    renderPage();
    fireEvent.click((await screen.findByText("Product Designer")).closest("a") as HTMLElement);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/withdraw"))).toBe(false);
  });
});
