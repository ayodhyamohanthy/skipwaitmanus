import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor, act } from "@testing-library/react";
import { builtinEnvironments } from "vitest/runtime";
import { AuthProvider, SDK_WAIT_MS, useAuth } from "./auth";
import { getGlobalAccessToken, setGlobalAccessToken } from "./accessToken";

const mocks = vi.hoisted(() => ({
  sdk: { isLoading: false, user: null as null | { id: string; email: string; emailVerified: boolean }, getAccessToken: vi.fn(), signOut: vi.fn(), signIn: vi.fn() },
  me: { data: null as null | { id: number; openId: string; name: string; email: string }, isLoading: false },
  invalidate: vi.fn(),
  setData: vi.fn(),
  cancel: vi.fn(),
  providerError: false,
  hookError: false,
  providerProps: {} as Record<string, any>,
}));
const utils = { auth: { me: { invalidate: mocks.invalidate, setData: mocks.setData, cancel: mocks.cancel } } };
vi.mock("@/lib/trpc", () => ({ trpc: { auth: { me: { useQuery: () => mocks.me } }, useUtils: () => utils } }));
vi.mock("@workos-inc/authkit-react", () => ({
  AuthKitProvider: (props: { children: React.ReactNode }) => {
    mocks.providerProps = props;
    if (mocks.providerError) throw new Error("SDK initialization failed");
    return props.children;
  },
  useAuth: () => {
    if (mocks.hookError) throw new Error("SDK context unavailable");
    return mocks.sdk;
  },
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
  mocks.me.data = { id: 1, openId: "workemail_test@example.com", name: "Employee", email: "test@example.com" };
  mocks.me.isLoading = false;
  mocks.invalidate.mockReset().mockResolvedValue(undefined);
  mocks.cancel.mockReset().mockResolvedValue(undefined);
  mocks.setData.mockReset();
  mocks.providerError = false;
  mocks.hookError = false;
  setGlobalAccessToken(null);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("WorkOS client and server-session compatibility", () => {
  it.each([undefined, "/plans?role=referrer&plan=max&currency=INR"]) ("passes the current or explicit destination to server sign-in", returnTo => {
    mocks.me.data = null;
    mount();
    const location = { href: "https://skipwait.me/premium?role=job_seeker#credits", origin: "https://skipwait.me" };
    vi.stubGlobal("window", { location });
    auth.openSignIn(returnTo ? { returnTo } : undefined);
    expect(new URL(location.href, location.origin).searchParams.get("returnTo")).toBe(returnTo ?? "/premium?role=job_seeker#credits");
    vi.unstubAllGlobals();
  });

  it.each(["loading-cookie", "loading-sdk", "signed-in"]) ("does not start unnecessary authentication for %s", state => {
    if (state !== "signed-in") mocks.me.data = null;
    mocks.me.isLoading = state === "loading-cookie";
    mocks.sdk.isLoading = state === "loading-sdk";
    mount();
    const location = { href: "https://skipwait.me/premium?role=job_seeker", origin: "https://skipwait.me" };
    vi.stubGlobal("window", { location });
    auth.openSignIn();
    expect(location.href).toBe("https://skipwait.me/premium?role=job_seeker");
    vi.unstubAllGlobals();
  });

  it("loads a valid cookie identity without waiting for the independent SDK", () => {
    mocks.sdk.isLoading = true;
    mount();
    expect(auth.isSignedIn).toBe(true);
    expect(auth.isLoaded).toBe(true);
  });

  it("stops waiting for a hung SDK probe once the server says signed out", async () => {
    vi.useFakeTimers();
    try {
      mocks.me.data = null;
      mocks.sdk.isLoading = true;
      mount();
      expect(auth.isLoaded).toBe(false);
      await act(async () => { vi.advanceTimersByTime(SDK_WAIT_MS + 10); });
      expect(auth.isLoaded).toBe(true);
      expect(auth.isSignedIn).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it.each(["providerError", "hookError"] as const)("keeps cookie auth usable after %s", failure => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks[failure] = true;
    expect(() => mount()).not.toThrow();
    expect(auth.isSignedIn).toBe(true);
    expect(auth.isLoaded).toBe(true);
  });

  it("refreshes auth.me once the SDK token is available to the tRPC transport", async () => {
    mocks.sdk.user = { id: "user_test", email: "test@example.com", emailVerified: true };
    mocks.sdk.getAccessToken.mockResolvedValue("sdk-access-token");
    mocks.me.data = null;
    mount();
    await waitFor(() => expect(getGlobalAccessToken()).toBe("sdk-access-token"));
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it("publishes rotated SDK tokens even when the user object does not change", async () => {
    mocks.sdk.user = { id: "user_test", email: "test@example.com", emailVerified: true };
    mocks.sdk.getAccessToken.mockResolvedValue("old-access-token");
    mount();
    await waitFor(() => expect(getGlobalAccessToken()).toBe("old-access-token"));
    await act(async () => { mocks.providerProps.onRefresh?.({ accessToken: "new-access-token" }); });
    expect(getGlobalAccessToken()).toBe("new-access-token");
  });

  it("clears the app session before asking the SDK to sign out without navigation", async () => {
    mount();
    const events: string[] = [];
    vi.mocked(fetch).mockImplementation(async () => { events.push("cookie"); return { ok: true } as Response; });
    mocks.sdk.signOut.mockImplementation(async () => { events.push("sdk"); });
    setGlobalAccessToken("old-access-token");
    await act(async () => { await auth.signOut(); });
    expect(events).toEqual(["cookie", "sdk"]);
    expect(mocks.sdk.signOut).toHaveBeenCalledWith({ navigate: false });
    expect(getGlobalAccessToken()).toBeNull();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.cancel).toHaveBeenCalled();
    expect(mocks.setData).toHaveBeenCalledWith(undefined, null);
  });

  it("does not pretend logout succeeded when the server could not clear the cookie", async () => {
    mount();
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(auth.signOut()).rejects.toThrow("Sign out could not be completed");
    expect(mocks.sdk.signOut).not.toHaveBeenCalled();
    expect(mocks.setData).not.toHaveBeenCalled();
  });

  it("uses the registered dev logout route when WorkOS routes are absent", async () => {
    vi.stubEnv("VITE_WORKOS_CLIENT_ID", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response).mockResolvedValueOnce({ ok: true } as Response);
    mount();
    await act(async () => { await auth.signOut(); });
    expect(fetch).toHaveBeenCalledWith("/api/dev-auth/logout", { method: "POST", credentials: "include" });
  });
});
