// @vitest-environment jsdom
// D-030 / D-049: every seeker, shared or admin "Sign in" starts on skipwait.me's own /sign-in page,
// never on a provider-less /api/auth/workos/sign-in (that route opened the hosted AuthKit page).
import React from "react";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  me: { data: null as null | { id: number; openId: string; name: string; email: string }, isLoading: false },
  sdk: { isLoading: false, user: null, getAccessToken: vi.fn(async () => null), signOut: vi.fn(async () => undefined), signIn: vi.fn(async () => undefined) },
}));
const utils = { auth: { me: { invalidate: vi.fn(), setData: vi.fn(), cancel: vi.fn() } } };
vi.mock("@/lib/trpc", () => ({ trpc: { auth: { me: { useQuery: () => mocks.me } }, useUtils: () => utils } }));
vi.mock("@workos-inc/authkit-react", () => ({ AuthKitProvider: (props: { children: React.ReactNode }) => props.children, useAuth: () => mocks.sdk }));
vi.mock("@/contexts/smokeRuntime", () => ({ smokeState: () => ({ active: false }) }));
vi.mock("@/lib/clarity", () => ({ identifyClarity: vi.fn() }));

import { AuthProvider, SignInButton, useAuth } from "./auth";

let auth: ReturnType<typeof useAuth> | undefined;
function Probe() {
  auth = useAuth();
  return React.createElement(SignInButton, null, "Sign in");
}
function mount() {
  return render(React.createElement(AuthProvider, null, React.createElement(Probe)));
}
function stubLocation(href: string) {
  const location = { href, origin: new URL(href).origin };
  vi.stubGlobal("location", location);
  return location;
}

beforeEach(() => {
  vi.stubEnv("VITE_WORKOS_CLIENT_ID", "client_test");
  mocks.me.data = null;
  mocks.me.isLoading = false;
  auth = undefined;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("openSignIn and SignInButton go to the skipwait.me sign-in with a safe returnTo", () => {
  it("SignInButton returns the person to the page they were on", () => {
    const location = stubLocation("https://skipwait.me/plans?x=1");
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(location.href).toBe("/sign-in?returnTo=%2Fplans%3Fx%3D1");
  });

  it("openSignIn honours an explicit same-site destination", () => {
    const location = stubLocation("https://skipwait.me/premium");
    mount();
    auth?.openSignIn({ returnTo: "/plans?x=1" });
    expect(location.href).toBe("/sign-in?returnTo=%2Fplans%3Fx%3D1");
  });

  it.each(["//evil.example", "https://evil.example", "/api/x", "/sign-in"])("drops the unsafe destination %s and opens the plain sign-in", returnTo => {
    const location = stubLocation("https://skipwait.me/premium");
    mount();
    auth?.openSignIn({ returnTo });
    expect(location.href).toBe("/sign-in");
  });

  it("does not navigate while the session is still loading", () => {
    mocks.me.isLoading = true;
    const location = stubLocation("https://skipwait.me/plans");
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(location.href).toBe("https://skipwait.me/plans");
  });

  it("does not navigate for someone already signed in", () => {
    mocks.me.data = { id: 1, openId: "workos_user_1", name: "Asha", email: "asha@gmail.com" };
    const location = stubLocation("https://skipwait.me/plans");
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(location.href).toBe("https://skipwait.me/plans");
  });

  it("the server-session fallback (no AuthKit client id) behaves the same", () => {
    vi.stubEnv("VITE_WORKOS_CLIENT_ID", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const location = stubLocation("https://skipwait.me/requests");
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(location.href).toBe("/sign-in?returnTo=%2Frequests");
    error.mockRestore();
  });

  it("the client auth module no longer names the provider-less WorkOS route", () => {
    const source = readFileSync("client/src/_core/auth.tsx", "utf8");
    expect(source).not.toContain("/api/auth/workos/sign-in");
    expect(source).toContain("signInPagePath");
  });
});
