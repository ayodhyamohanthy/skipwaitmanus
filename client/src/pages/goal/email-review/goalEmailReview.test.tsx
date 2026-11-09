// @vitest-environment jsdom
// D-048-p3-email-review: flag-off parity and flag-on goal rebuild for
// /email-review/:linkToken.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import EmailReviewAction from "../../EmailReviewAction";
import { GOAL_PAGE } from "./GoalEmailReviewAction";

const { authState, go, surfaces, routeToken, sentryMock } = vi.hoisted(() => ({
  authState: { isSignedIn: true, isLoaded: true },
  go: vi.fn(),
  surfaces: { on: new Set<string>() },
  routeToken: { value: "tok-1" },
  sentryMock: { captureClientError: vi.fn() },
}));

const getToken = vi.fn().mockResolvedValue("test-token");
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: authState.isSignedIn, isLoaded: authState.isLoaded, getToken }) }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
vi.mock("@/lib/sentry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sentry")>("@/lib/sentry");
  return {
    ...actual,
    captureClientError: sentryMock.captureClientError,
  };
});
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => [`/email-review/${routeToken.value}`, go],
  useRoute: () => [true, { linkToken: routeToken.value }],
}));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });

beforeEach(() => {
  surfaces.on = new Set(["email-review"]);
  routeToken.value = "tok-1";
  sentryMock.captureClientError.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  getToken.mockClear();
  go.mockClear();
  authState.isSignedIn = true;
  authState.isLoaded = true;
});

describe("Goal /email-review flag gate", () => {
  it("renders the kit card untouched when the flag is off", async () => {
    surfaces.on = new Set();
    vi.stubGlobal("fetch", vi.fn(async () => ok({ review: { ready: true } })));
    render(<EmailReviewAction />);
    expect(await screen.findByText("Choose your decision.")).toBeTruthy();
    expect(screen.queryByText("PRIVATE REVIEW")).toBeNull();
  });
});

describe("Goal /email-review states", () => {
  it("renders a loading frame while auth is loading without flashing signed-out card", async () => {
    authState.isSignedIn = false;
    authState.isLoaded = false;
    render(<EmailReviewAction />);
    expect(await screen.findByText("Opening private review…")).toBeTruthy();
    expect(screen.queryByText("Use your company email.")).toBeNull();
  });

  it("keeps the link behind work-email sign-in with canonical referrerSignInHref", async () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailReviewAction />);
    expect(await screen.findByText("Use your company email.")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Sign in with work email" });
    expect(link.getAttribute("href")).toBe(referrerSignInHref("/email-review/tok-1"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the Goal page contract with exactly one h1 and one black commit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ review: { ready: true } })));
    const { container } = render(<EmailReviewAction />);
    expect(await screen.findByText("PRIVATE REVIEW")).toBeTruthy();
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(GOAL_PAGE.goalLine);
  });

  it("records an accept only after the ethics line is confirmed", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/decision")) return ok({ status: "approved" });
      return ok({ review: { ready: true } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailReviewAction />);
    expect(await screen.findByText("PRIVATE REVIEW")).toBeTruthy();
    const accept = screen.getByRole("button", { name: "Accept & connect" });
    fireEvent.click(accept);
    expect(fetchMock.mock.calls.filter(call => String(call[0]).endsWith("/decision"))).toHaveLength(0);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Accept & connect" }));
    expect(await screen.findByText("Request accepted.")).toBeTruthy();
    const decision = fetchMock.mock.calls.find(call => String(call[0]).endsWith("/decision"));
    expect(String(decision?.[0])).toContain("/api/referrer-review-links/tok-1/decision");
    expect(String(decision?.[1]?.body)).toBe(JSON.stringify({ decision: "approved", ethicsConfirmed: true }));
    fireEvent.click(screen.getByRole("button", { name: "Open My Company Inbox" }));
    expect(go).toHaveBeenCalledWith("/inbox");
  });

  it("records a decline with its reason, referral-only copy, and no unapproved disclosure", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/decision")) return ok({ status: "passed", declineReason: "timing" });
      return ok({ review: { ready: true } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailReviewAction />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline - not now" }));
    expect(await screen.findByText("Passed privately.")).toBeTruthy();
    const decision = fetchMock.mock.calls.find(call => String(call[0]).endsWith("/decision"));
    expect(String(decision?.[1]?.body)).toBe(JSON.stringify({ decision: "declined", declineReason: "timing" }));
    expect(screen.getByText("This referral request remains open to other verified colleagues.")).toBeTruthy();
    expect(screen.queryByText(/without your name/i)).toBeNull();
    expect(screen.queryByText(/\bask\b/i)).toBeNull();
  });

  it("fails closed on malformed decision response status", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/decision")) return ok({ status: "unknown_decision_status" });
      return ok({ review: { ready: true } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailReviewAction />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline - not now" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Passed privately.")).toBeNull();
    expect(screen.queryByText("Request accepted.")).toBeNull();
  });

  it("supports offline detection, scrubbed telemetry on network failure, and retry recovery", async () => {
    let shouldFail = true;
    const fetchMock = vi.fn(async () => {
      if (shouldFail) throw new TypeError("Failed to fetch");
      return ok({ review: { ready: true } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmailReviewAction />);
    expect(await screen.findByText("Review link unavailable")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Unable to reach the server");
    expect(sentryMock.captureClientError).toHaveBeenCalledWith(
      expect.any(TypeError),
      expect.objectContaining({
        source: "email-review",
        url: expect.stringMatching(/^\/email-review\/:token/),
      }),
    );

    // Test retry recovery
    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(GOAL_PAGE.goalLine)).toBeTruthy();
  });

  it("shows offline message when browser is offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<EmailReviewAction />);
    expect(await screen.findByText("Review link unavailable")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("currently offline");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("shows the server's reason when the link is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(410, { error: "This review was already decided" })));
    render(<EmailReviewAction />);
    expect(await screen.findByText("This review was already decided")).toBeTruthy();
    expect(screen.getByText("Review link unavailable")).toBeTruthy();
  });
});
