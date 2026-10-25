// @vitest-environment jsdom
// Sample-filled empty state on /requests (owner override, Oct 21 11:35 PM,
// verified phonemsg-01M5FT6Z0SYN6QWFVDR3J3S2CS). Pins the hard boundary:
// samples teach, but they can NEVER touch counts, slots, credits, unread,
// routes, withdraw or the tab order - and they only render for a first-timer
// (server says hasEverAsked === false) with an empty real list.
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

describe("My referrals sample empty state", () => {
  it("renders marked, inert sample rows for a first-timer with an empty list - and real counts stay zero", async () => {
    stubMine({ requests: [], hasEverAsked: false, slots: SLOTS });
    renderPage();
    const zone = (await screen.findByTestId("goal-sample-rows"));
    expect(zone.textContent).toContain("SAMPLE · NOT REAL ASKS");
    expect(zone.textContent).toContain("Sample Co.");
    expect(zone.textContent).toContain("Example Industries");
    expect(zone.textContent).toContain("Placeholder Ltd.");
    expect(zone.textContent).toContain("Waiting");
    expect(zone.textContent).toContain("Accepted");
    expect(zone.textContent).toContain("Referred");
    expect(zone.querySelectorAll("li")).toHaveLength(3);
    expect(zone.textContent).toContain("Samples show what a real ask looks like. They are not counted in your open asks and disappear after your first real ask.");
    // Boundary: no routes, no buttons, no tab stops inside the sample rows.
    const list = zone.querySelector("ul");
    expect(list?.getAttribute("aria-hidden")).toBe("true");
    expect(zone.querySelector("ul")?.querySelectorAll("a, button, [role=link], [tabindex]")).toHaveLength(0);
    expect(zone.querySelectorAll('[data-testid="goal-list-row"]')).toHaveLength(0);
    expect(zone.textContent).not.toContain("Withdraw");
    // Counts stay real: the slots meter reads the true zero, samples never inflate it.
    expect(screen.getByTestId("asks-slots").textContent).toContain("Open asks 0 of 3");
    expect(document.querySelectorAll('[data-testid="goal-list-row"]')).toHaveLength(0);
    // A first-timer still gets the kit's setup hand-off beside the samples.
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
