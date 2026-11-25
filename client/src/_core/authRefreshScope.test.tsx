import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { builtinEnvironments } from "vitest/runtime";
import { AuthProvider, useAuth } from "./auth";
import { getGlobalAccessToken, setGlobalAccessToken } from "./accessToken";

/**
 * AUTH-workos-refresh-scope (D-389): the AuthKit SDK answers getAccessToken()
 * with a refresh request, and WorkOS refuses that request with 400 when the
 * session was not issued by WorkOS. Cookie-only sessions (reviewer demo
 * accounts, work-email OTP referrers, seeker email code, password, passkey)
 * must therefore never ask the SDK for a token; a real WorkOS session still
 * refreshes.
 */
const mocks = vi.hoisted(() => ({
  sdk: { isLoading: false, user: null as null | { id: string; email: string; emailVerified: boolean }, getAccessToken: vi.fn(), signOut: vi.fn(), signIn: vi.fn() },
  me: { data: null as null | { id: number; openId: string; name: string; email: string }, isLoading: false },
  invalidate: vi.fn(),
  setData: vi.fn(),
  cancel: vi.fn(),
  providerProps: {} as Record<string, any>,
}));
const utils = { auth: { me: { invalidate: mocks.invalidate, setData: mocks.setData, cancel: mocks.cancel } } };
vi.mock("@/lib/trpc", () => ({ trpc: { auth: { me: { useQuery: () => mocks.me } }, useUtils: () => utils } }));
vi.mock("@workos-inc/authkit-react", () => ({
  AuthKitProvider: (props: { children: React.ReactNode }) => {
    mocks.providerProps = props;
    return props.children;
  },
  useAuth: () => mocks.sdk,
}));
vi.mock("@/contexts/smokeRuntime", () => ({ smokeState: () => ({ active: false }) }));

let environment: Awaited<ReturnType<typeof builtinEnvironments.jsdom.setup>>;
let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return React.createElement("div", null, auth.isLoaded ? "loaded" : "loading");
}
function mount() {
  return render(React.createElement(AuthProvider, null, React.createElement(Probe)));
}
beforeAll(async () => { environment = await builtinEnvironments.jsdom.setup(globalThis, {}); });
afterAll(() => environment.teardown(globalThis));
beforeEach(() => {
  vi.stubEnv("VITE_WORKOS_CLIENT_ID", "client_test");
  mocks.sdk.isLoading = false;
  mocks.sdk.user = null;
  mocks.sdk.getAccessToken.mockReset().mockResolvedValue(null);
  mocks.sdk.signOut.mockReset().mockResolvedValue(undefined);
  mocks.me.data = null;
  mocks.me.isLoading = false;
  mocks.invalidate.mockReset().mockResolvedValue(undefined);
  mocks.cancel.mockReset().mockResolvedValue(undefined);
  mocks.setData.mockReset();
  setGlobalAccessToken(null);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("WorkOS token refresh scope (D-389)", () => {
  it("a cookie-only signed-in session asks WorkOS for no token", async () => {
    mocks.me.data = { id: 1, openId: "reviewer_seeker", name: "Demo seeker", email: "seeker@reviewer.skipwait.me" };
    mount();
    await waitFor(() => expect(auth.isSignedIn).toBe(true));
    await expect(auth.getToken()).resolves.toBeNull();
    expect(mocks.sdk.getAccessToken).not.toHaveBeenCalled();
  });

  it("a WorkOS session still refreshes its token", async () => {
    mocks.sdk.user = { id: "user_test", email: "test@example.com", emailVerified: true };
    mocks.sdk.getAccessToken.mockResolvedValue("sdk-access-token");
    mount();
    await waitFor(() => expect(auth.isSignedIn).toBe(true));
    await expect(auth.getToken()).resolves.toBe("sdk-access-token");
    expect(mocks.sdk.getAccessToken).toHaveBeenCalled();
  });

  it("a signed-out session asks WorkOS for no token", async () => {
    mount();
    await expect(auth.getToken()).resolves.toBeNull();
    expect(mocks.sdk.getAccessToken).not.toHaveBeenCalled();
  });

  it("mounting a cookie-only session publishes no token and asks WorkOS for none", async () => {
    mocks.me.data = { id: 1, openId: "reviewer_seeker", name: "Demo seeker", email: "seeker@reviewer.skipwait.me" };
    mount();
    await waitFor(() => expect(auth.isSignedIn).toBe(true));
    expect(mocks.sdk.getAccessToken).not.toHaveBeenCalled();
    expect(getGlobalAccessToken()).toBeNull();
  });
});
