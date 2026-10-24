// @vitest-environment jsdom
// D-048-p3-email-review: flag-off parity and flag-on goal rebuild for
// /email-review/:linkToken.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EmailReviewAction from "../../EmailReviewAction";

const { authState, go, surfaces, routeToken } = vi.hoisted(() => ({ authState: { isSignedIn: true }, go: vi.fn(), surfaces: { on: new Set<string>() }, routeToken: { value: "tok-1" } }));
const getToken = vi.fn().mockResolvedValue("test-token");
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: authState.isSignedIn, getToken }) }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => [`/email-review/${routeToken.value}`, go],
  useRoute: () => [true, { linkToken: routeToken.value }],
}));
vi.mock("@/components/WorkEmailSignIn", () => ({ WorkEmailSignIn: () => <div data-testid="work-email-sign-in" /> }));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });

beforeEach(() => { surfaces.on = new Set(["email-review"]); routeToken.value = "tok-1"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); getToken.mockClear(); go.mockClear(); authState.isSignedIn = true; });

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
  it("keeps the link behind work-email sign-in", async () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailReviewAction />);
    expect(await screen.findByText("Use your company email.")).toBeTruthy();
    expect(screen.getByTestId("work-email-sign-in")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records an accept only after the ethics line is confirmed", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
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

  it("records a decline with its reason and stays private", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/decision")) return ok({ status: "declined" });
      return ok({ review: { ready: true } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmailReviewAction />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline - not now" }));
    expect(await screen.findByText("Passed privately.")).toBeTruthy();
    const decision = fetchMock.mock.calls.find(call => String(call[0]).endsWith("/decision"));
    expect(String(decision?.[1]?.body)).toBe(JSON.stringify({ decision: "declined", declineReason: "timing" }));
    expect(screen.getByText(/without your name/)).toBeTruthy();
  });

  it("shows the server's reason when the link is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(410, { error: "This review was already decided" })));
    render(<EmailReviewAction />);
    expect(await screen.findByText("This review was already decided")).toBeTruthy();
    expect(screen.getByText("Review link unavailable")).toBeTruthy();
  });
});
