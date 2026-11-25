// @vitest-environment jsdom
// ADMIN-support-view (D-393) goal /admin/users/:id/support: the page opens "Fix one person's problem.",
// shows one person's identity, wallet, requests and activity, states the plain-words cause and fix, keeps
// the sandbox control off until QA-sandbox-requests lands, and never renders another account. Fixtures are
// synthetic; no real account, email or request is used.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import GoalAdminSupport, { GOAL_PAGE } from "./GoalAdminSupport";

const { authState, routeState } = vi.hoisted(() => ({
  authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() },
  routeState: { id: "7" as string | undefined },
}));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, ...authState }) }));
vi.mock("wouter", () => ({ useRoute: () => [true, routeState.id === undefined ? undefined : { id: routeState.id }] }));

const VIEW = {
  account: {
    id: 7, email: "person7@example.test", name: "Person Seven", role: "user", accountType: "job_seeker", company: null,
    createdAt: "2026-11-01T00:00:00.000Z", suspended: false, canonicalPersonId: 17,
    workEmailVerifiedAt: null, workEmailDomain: null, signInMethods: ["workos"],
    aliases: [{ provider: "workos", email: "person7@example.test", verifiedAt: "2026-11-01T00:00:00.000Z" }],
  },
  wallet: {
    role: "job_seeker", plan: "free", totalAvailable: 2, monthlyCreditsRemaining: 2, purchasedCreditsRemaining: 0,
    promoCreditsRemaining: 0, subscriptionStatus: null, subscriptionCurrentTermEnd: null, cardValidated: false,
    freeCreditsLocked: false,
    ledger: [{ id: 91, kind: "spend", credits: -1, bucket: "monthly", createdAt: "2026-11-20T10:00:00.000Z" }],
  },
  checkoutIntents: [],
  referrer: null,
  blocks: [],
  requests: [{
    id: 41, title: "Backend engineer", companyDomain: "example.test", targetRoleUrl: "https://example.test/jobs/1",
    status: "pending", waitingForCoverage: false, referrerId: null,
    createdAt: "2026-11-20T10:00:00.000Z", updatedAt: "2026-11-21T10:00:00.000Z",
    state: { label: "Privately routed", reason: "It remains private while a verified employee decides whether to claim it." },
    timeline: [{ id: 410, action: "created", fromStatus: "none", resultingStatus: "pending", role: "seeker", createdAt: "2026-11-20T10:00:00.000Z" }],
    sandbox: { available: false, companySlug: "example.test", targetRoleUrl: "https://example.test/jobs/1" },
  }],
  activity: [{ id: 501, action: "company_referral.company_cap_reached", outcome: "denied", metadata: null, createdAt: "2026-11-24T09:00:00.000Z" }],
  newestFailures: [{
    id: 501, action: "company_referral.company_cap_reached", outcome: "denied", metadata: null, createdAt: "2026-11-24T09:00:00.000Z",
    cause: { cause: "Send was blocked: this person already has two open referral requests at that company.", fix: "Wait for one of those requests to be decided, or withdraw one.", adminAction: { label: "Open the activity log", href: "/admin/activity" } },
  }],
};

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, json: async () => body });

function stub(body: unknown = VIEW, status = 200) {
  const fetchMock = vi.fn(async () => reply(body, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><GoalAdminSupport /></QueryClientProvider>);

afterEach(() => {
  cleanup();
  authState.isSignedIn = true;
  routeState.id = "7";
  vi.unstubAllGlobals();
});

describe("goal /admin/users/:id/support", () => {
  it("opens with the goal line and one next step holding the one black commit", async () => {
    stub();
    const { container } = renderPage();
    await screen.findByText("Person Seven");
    assertGoalPage(container, GOAL_PAGE);
  });

  it("shows the person's identity, wallet, request and activity", async () => {
    stub();
    renderPage();
    expect(await screen.findByText("Person Seven")).toBeTruthy();
    expect(screen.getAllByText(/person7@example\.test/).length).toBeGreaterThan(0);
    expect(screen.getByText("Backend engineer")).toBeTruthy();
    expect(screen.getByText(/Privately routed/)).toBeTruthy();
    expect(screen.getByText("spend")).toBeTruthy();
    expect(screen.getByText("company_referral.company_cap_reached")).toBeTruthy();
  });

  it("states the plain-words cause and the existing admin action that fixes it", async () => {
    stub();
    renderPage();
    expect((await screen.findAllByText(/two open referral requests at that company/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Wait for one of those requests to be decided/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Open the activity log" }).length).toBeGreaterThan(0);
  });

  it("keeps the sandbox control off with the plain reason until QA-sandbox-requests lands", async () => {
    stub();
    renderPage();
    const control = await screen.findByRole("button", { name: "Try this in the sandbox" });
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/Sandbox requests arrive with QA-sandbox-requests/)).toBeTruthy();
  });

  it("asks for sign-in instead of showing a person when signed out", async () => {
    authState.isSignedIn = false;
    const fetchMock = stub();
    renderPage();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an invalid account reference without a request", async () => {
    routeState.id = "abc";
    const fetchMock = stub();
    renderPage();
    expect(screen.getByText("That account reference is not valid.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the access message when the server refuses a non-admin", async () => {
    stub({ error: "Administrator access is required" }, 403);
    renderPage();
    expect(await screen.findByText(/Administrator access is required/)).toBeTruthy();
  });

  it("shows the server's plain message when the view fails", async () => {
    stub({ error: "We could not load this person's support view" }, 500);
    renderPage();
    expect(await screen.findByText("We could not load this person's support view")).toBeTruthy();
  });
});
