// @vitest-environment jsdom
// /requests empty and accepted states on the goal UI (D-048 phase 3): one
// honest zero state, a real next step, and no fabricated activity anywhere.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function stubRequests(requests: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/api/credits/summary")
    ? { ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 4 } }) }
    : { ok: true, status: 200, json: async () => ({ requests }) }));
}

beforeEach(() => stubRequests([]));
afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

describe("My asks empty state", () => {
  it("draws one honest zero state with a real next step, never a fabricated preview", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("goal-empty-state")).toBeTruthy());
    // Exactly one "No asks yet." line: the section note and the empty state must not both render.
    expect(screen.getAllByText("No asks yet.").length).toBe(1);
    expect(screen.getByText("Pick a company, find a verified referrer, and write one great ask.")).toBeTruthy();
    // No share card, no illustrative activity, no old kit copy.
    expect(document.querySelector('[data-skipwait-zero-action="job_seeker"]')).toBeNull();
    expect(document.querySelector('[data-skipwait-empty-preview]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Share on WhatsApp" })).toBeNull();
    expect(screen.queryByText("No requests yet.")).toBeNull();
    // The one action is real and leads to the live company directory.
    fireEvent.click(screen.getByRole("button", { name: "Explore companies" }));
    expect(go).toHaveBeenCalledWith("/explore");
    expect(screen.getByRole("link", { name: "New ask" }).getAttribute("href")).toBe("/explore");
    // The kit's second next step survives the move (0e1ccba4): finish the profile.
    expect(screen.getByRole("link", { name: "Finish setup" }).getAttribute("href")).toBe("/onboarding");
  });

  it("shows the approved ask as a single link row with unread messages, never the referrer id", async () => {
    stubRequests([{ id: 12, title: "Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", companyName: null, companyInitials: null, status: "approved", referrerId: 77, referrerMessage: "I can introduce you to the hiring team.", unreadMessageCount: 2, queueStatus: null, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-11T09:00:00.000Z", attachmentCount: 1 }]);
    renderPage();
    const row = (await screen.findByText("Designer")).closest("a");
    expect(row?.getAttribute("href")).toBe("/conversation/12");
    expect(within(row as HTMLElement).getByTestId("goal-status").textContent).toBe("Accepted");
    expect(row?.textContent).toContain("2 new");
    expect(document.querySelector("main")?.textContent).not.toContain("77");
    // The referrer's note reaches the thread, not an extra aside here.
    expect(screen.queryByLabelText("Referrer update")).toBeNull();
    expect(row?.textContent).not.toContain("I can introduce you to the hiring team.");
  });
});
