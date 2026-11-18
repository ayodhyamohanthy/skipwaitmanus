// @vitest-environment jsdom
// D-048-p3-home-signed-in (packet docs/plans/D-048-marketing.md §3-§5): the
// signed-in home is a router, not a dashboard. A signed-in seeker goes to /explore and a verified
// referrer (the server's verdict, D-055) to /referrer-home; auth loading shows
// the fetch-free goal frame, never a flash of the landing. D-048-K-home
// removes the retired layout and its switches; these are the default routes.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

type AccessState =
  | { status: "signed-out" }
  | { status: "checking" }
  | { status: "error"; error: Error; retrying: boolean; retry: () => void }
  | { status: "unverified"; access: unknown }
  | { status: "code_required"; access: unknown }
  | { status: "verified"; access: unknown };

const { auth, access, navigate } = vi.hoisted(() => ({
  auth: { isLoaded: true as boolean | undefined, isSignedIn: false },
  access: { value: { status: "signed-out" } as unknown },
  navigate: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => auth,
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => access.value as AccessState }));
vi.mock("wouter", () => ({
  useLocation: () => ["/", navigate],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const verdict = (value: AccessState) => { access.value = value; };
const retry = vi.fn();

beforeEach(() => {
  auth.isLoaded = true;
  auth.isSignedIn = false;
  access.value = { status: "signed-out" };
  navigate.mockReset();
  retry.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ acceptedReferrals: 0 }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("signed-in home (D-048-p3-home-signed-in)", () => {
  it("renders the released landing for a signed-out visitor", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "Nobody reads the pile." })).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows the fetch-free frame while auth loads, never the landing", () => {
    auth.isLoaded = false;
    render(<Home />);
    expect(screen.getByRole("status").textContent).toContain("Opening skipwait.me");
    expect(screen.queryByRole("navigation", { name: "Website navigation" })).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("keeps the frame while the server verdict is being checked", () => {
    auth.isSignedIn = true;
    verdict({ status: "checking" });
    render(<Home />);
    expect(screen.getByRole("status").textContent).toContain("Checking your referral access");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("sends a verified referrer to /referrer-home by the server verdict (D-055)", () => {
    auth.isSignedIn = true;
    verdict({ status: "verified", access: { verified: true } });
    render(<Home />);
    expect(navigate).toHaveBeenCalledWith("/referrer-home", { replace: true });
  });

  it("still routes a verified referrer whose session needs the work-email step-up to /referrer-home", () => {
    auth.isSignedIn = true;
    verdict({ status: "code_required", access: { verified: true, codeRequired: true } });
    render(<Home />);
    expect(navigate).toHaveBeenCalledWith("/referrer-home", { replace: true });
  });

  it("sends a seeker with no verified work email to /explore", () => {
    auth.isSignedIn = true;
    verdict({ status: "unverified", access: { verified: false } });
    render(<Home />);
    expect(navigate).toHaveBeenCalledWith("/explore", { replace: true });
  });

  it("never guesses a destination when the verdict check fails: it says so and retries", () => {
    auth.isSignedIn = true;
    verdict({ status: "error", error: new Error("We could not check access"), retrying: false, retry });
    render(<Home />);
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("We couldn't check your referral access");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("keeps the signed-out landing free of the account router", () => {
    render(<Home />);
    expect(screen.getByRole("navigation", { name: "Landing" })).toBeTruthy();
    expect(screen.queryByText(/Opening skipwait.me/)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
