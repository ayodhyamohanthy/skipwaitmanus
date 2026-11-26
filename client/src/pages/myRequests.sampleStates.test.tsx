// @vitest-environment jsdom
// Empty state on /requests. D-387 (owner, Nov 24 2026) removed the sample
// asks the Oct 21 override added: one promised "Expires in 7 days ... The
// credit comes back", against D-174 and D-173/D-180. Every seeker with no
// asks now gets the same honest empty state, and no sample ever renders.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const SLOTS = { open: 0, cap: 3, full: false, plan: "free", planLabel: "Free", nextPlan: null };

function stubMine(payload: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/api/credits/summary")
    ? { ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 4 } }) }
    : { ok: true, status: 200, json: async () => payload }));
}

const oneRequest = { id: 12, title: "Product Designer", targetRoleUrl: null, companyDomain: "acme.com", companyName: null, companyInitials: null, status: "pending", referrerId: 77, queueStatus: "available_for_review", referrerMessage: null, unreadMessageCount: 0, createdAt: "2026-09-01T09:41:00.000Z", updatedAt: "2026-09-02T14:05:00.000Z", attachmentCount: 1 };

describe("My asks empty state shows no sample asks (D-387)", () => {
  it("gives a first-timer the honest empty state: no fabricated asks, no expiry or credit promise", async () => {
    stubMine({ requests: [], hasEverAsked: false, slots: SLOTS });
    renderPage();
    expect(await screen.findByText("No asks yet.")).toBeTruthy();
    expect(screen.queryByTestId("goal-sample-rows")).toBeNull();
    const page = document.body.textContent ?? "";
    expect(page).not.toMatch(/SAMPLE/);
    expect(page).not.toMatch(/Sample Co\.|Example Industries|Placeholder Ltd\./);
    expect(page).not.toMatch(/Expires/i);
    expect(page).not.toMatch(/credit/i);
    // One next-step block, real counts, and the setup hand-off stay.
    expect(screen.getAllByRole("region", { name: "Your next step" })).toHaveLength(1);
    expect(screen.getByTestId("asks-slots").textContent).toContain("Open asks 0 of 3");
    expect(document.querySelectorAll('[data-testid="goal-list-row"]')).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Finish setup" }).getAttribute("href")).toBe("/onboarding");
  });

  it("keeps the honest empty state for a returning user (hasEverAsked true)", async () => {
    stubMine({ requests: [], hasEverAsked: true, slots: SLOTS });
    renderPage();
    expect(await screen.findByText("No asks yet.")).toBeTruthy();
    expect(screen.queryByTestId("goal-sample-rows")).toBeNull();
  });

  it("keeps the honest empty state on an old payload without the flag (fail closed)", async () => {
    stubMine({ requests: [], slots: SLOTS });
    renderPage();
    expect(await screen.findByText("No asks yet.")).toBeTruthy();
    expect(screen.queryByTestId("goal-sample-rows")).toBeNull();
  });

  it("never shows samples when a real ask exists, even for a first-timer flag", async () => {
    stubMine({ requests: [oneRequest], hasEverAsked: false, slots: { ...SLOTS, open: 1 } });
    renderPage();
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(screen.queryByTestId("goal-sample-rows")).toBeNull();
  });
});
