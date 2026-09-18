// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyRequests from "./MyRequests";

const { go, getToken } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("test-token") }));

// A stable getToken matters here: MyRequests' load effect depends on it, so a
// per-render vi.fn() would re-run the effect on every render in tests.
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken }) }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/requests", go] }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div>, LogoMark: () => <div data-skipwait-logo-mark="true" /> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ requests: [] }) })));
});
afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

const pendingRequest = { id: 12, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", status: "pending", referrerId: null, queueStatus: null, referrerMessage: null, unreadMessageCount: 0, createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", attachmentCount: 1 };
const claimedRequest = { ...pendingRequest, id: 13, status: "pending", referrerId: 77, queueStatus: "available_for_review" };
const creditSummary = (monthlyCreditsRemaining: number) => ({ summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining, purchasedCreditsRemaining: 0, totalAvailable: monthlyCreditsRemaining, cycleKey: "2026-09", subscriptionStatus: null, subscriptionCurrentTermEnd: null } });

function stubRequestsFetch(requests: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => String(url).includes("/api/credits/summary") ? creditSummary(2) : { requests } })));
}

describe("My Requests withdraw flow", () => {
  it("offers Withdraw on a pending unclaimed request and shows its Ref reference", async () => {
    stubRequestsFetch([pendingRequest]);
    render(<MyRequests />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Withdraw" })).toBeTruthy());
    expect(screen.getByText("Ref-1012")).toBeTruthy();
    expect(screen.getByText("2 left")).toBeTruthy();
  });

  it("hides Withdraw once a verified employee has claimed the request", async () => {
    stubRequestsFetch([claimedRequest]);
    render(<MyRequests />);
    await waitFor(() => expect(screen.getByRole("link", { name: /View job posting/ })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });

  it("withdraws from the confirm dialog, updates the state card, and restores the credit", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => String(url).includes("/withdraw")
      ? { ok: true, json: async () => ({ withdrawn: true, requestId: 12, status: "withdrawn", creditSummary: creditSummary(3).summary }) }
      : { ok: true, json: async () => String(url).includes("/api/credits/summary") ? creditSummary(2) : { requests: [pendingRequest] } });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyRequests />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Withdraw" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Withdraw this request?");
    expect(dialog.textContent).toContain("acme.com employees will no longer see it. Your credit returns to your balance.");
    expect(dialog.textContent).toContain("Keep request");
    fireEvent.click(screen.getByRole("button", { name: "Withdraw request", }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/12/withdraw", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("You withdrew this request.")).toBeTruthy();
    expect(screen.getByText("3 left")).toBeTruthy();
    expect(screen.getAllByText("Withdrawn").length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the request and offers Try again when the withdraw fails", async () => {
    const fetchMock = vi.fn(async (url: string) => String(url).includes("/withdraw")
      ? { ok: false, status: 409, json: async () => ({ error: "The network dropped before we could reach the server" }) }
      : { ok: true, json: async () => String(url).includes("/api/credits/summary") ? creditSummary(2) : { requests: [pendingRequest] } });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyRequests />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Withdraw" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw request" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Withdraw didn't go through");
    expect(alert.textContent).toContain("The network dropped before we could reach the server");
    expect(alert.textContent).toContain("Your request is still active and nothing was lost.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep request" })).toBeTruthy();
    expect(screen.getByText("Ref-1012")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep request" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
