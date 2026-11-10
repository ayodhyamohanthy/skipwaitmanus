// @vitest-environment jsdom
// D-048-p3-home-signed-in (Tier 2, dark behind goalSurfaceOn('home-signed-in')):
// / for a signed-in visitor is a router, not a dashboard and not the Kit v4
// page. A seeker goes to /explore, a verified referrer to /referrer-home on the
// server verdict (D-055); auth loading shows the fetch-free frame; a failed
// verdict check is visible with a retry instead of a silent misroute. The
// flag-off case pins the kit landing untouched (release control, D-048 §1).
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const { auth, flags, access } = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true },
  flags: { on: new Set<string>() },
  access: { value: { status: "checking" } as Record<string, unknown> },
}));

vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => flags.on.has(id) }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => auth,
  useUser: () => ({ user: { id: "u1" } }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  openSignIn: vi.fn(),
}));
vi.mock("@/hooks/useReferrerAccess", () => ({
  useReferrerAccess: () => access.value,
  referrerAccessKey: (userId: string | null) => ["referrer-access", userId],
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLocation: () => ["/", vi.fn()],
  Redirect: ({ to }: { to: string }) => <div data-testid="goal-redirect" data-to={to} />,
}));

const redirectTarget = () => screen.getByTestId("goal-redirect").getAttribute("data-to");

beforeEach(() => {
  auth.isLoaded = true;
  auth.isSignedIn = true;
  flags.on = new Set(["home-signed-in"]);
  access.value = { status: "checking" };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Goal signed-in home switch", () => {
  it("keeps the kit landing for a signed-in visitor while the surface is off", () => {
    flags.on = new Set();
    const { container } = render(<Home />);
    expect(container.querySelector(".launch-page")).toBeTruthy();
    expect(screen.getByText(/INTRODUCING SKIPWAIT\.ME/)).toBeTruthy();
    expect(screen.queryByTestId("goal-home-loading")).toBeNull();
    expect(screen.queryByTestId("goal-home-signed-in")).toBeNull();
  });

  it("shows the fetch-free frame, not the landing, while auth loads", () => {
    auth.isLoaded = false;
    const { container } = render(<Home />);
    expect(screen.getByTestId("goal-home-loading")).toBeTruthy();
    expect(screen.getByText("Checking your sign-in…")).toBeTruthy();
    expect(container.textContent).not.toMatch(/INTRODUCING SKIPWAIT/);
    // Fetch-free by construction: the loading frame never calls the API.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe("Goal signed-in home routing", () => {
  it("sends a verified referrer to /referrer-home on the server verdict", () => {
    access.value = { status: "verified", access: { verified: true } };
    render(<Home />);
    expect(redirectTarget()).toBe("/referrer-home");
  });

  it("sends a referrer who still owes the work-email step-up to /referrer-home", () => {
    access.value = { status: "code_required", access: { verified: true, codeRequired: true } };
    render(<Home />);
    expect(redirectTarget()).toBe("/referrer-home");
  });

  it("sends a seeker to /explore", () => {
    access.value = { status: "unverified", access: { verified: false } };
    render(<Home />);
    expect(redirectTarget()).toBe("/explore");
  });

  it("keeps the frame while the verdict is in flight instead of the marketing landing", () => {
    access.value = { status: "checking" };
    render(<Home />);
    expect(screen.getByTestId("goal-home-loading")).toBeTruthy();
    expect(screen.queryByTestId("goal-redirect")).toBeNull();
  });

  it("surfaces a failed verdict check with a retry rather than misrouting silently", () => {
    const retry = vi.fn();
    access.value = { status: "error", error: new Error("The access check is unreachable."), retrying: false, retry };
    render(<Home />);
    expect(screen.queryByTestId("goal-redirect")).toBeNull();
    expect(screen.getByText(/couldn't check whether you're a verified referrer/i)).toBeTruthy();
    expect(screen.getByText("The access check is unreachable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    // Recovery is offered, never a dead end.
    expect(screen.getByRole("link", { name: /find a referral/i }).getAttribute("href")).toBe("/explore");
  });
});
