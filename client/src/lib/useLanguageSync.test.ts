// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook, waitFor } from "@testing-library/react";
import { useLanguageSync } from "./useLanguageSync";
import { resolveDeviceLocale } from "./device";

// D-093 packet §5.3 (C4) red-first tests. They fail on main because
// ./useLanguageSync does not exist yet.
const STORE_KEY = "sw:language";
const MARKER_PREFIX = "sw:signup-language-sent";
const authState = { isLoaded: true, isSignedIn: true, userId: "person-test-1" as string | null };

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
    userId: authState.userId,
    getToken: async () => "test-token",
    signOut: async () => undefined,
    openSignIn: () => undefined,
    user: null,
  }),
}));

type FetchCall = { url: string; init?: RequestInit };
let calls: FetchCall[];
let accountLanguage: string | null;
let preferencesStatus: number;
let putStatus: number;
let signupStatus: number;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  accountLanguage = null;
  preferencesStatus = 200;
  putStatus = 200;
  signupStatus = 204;
  authState.isLoaded = true;
  authState.isSignedIn = true;
  authState.userId = "person-test-1";
  globalThis.localStorage?.clear();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "/api/account/preferences" && !init?.method) {
      return preferencesStatus === 200
        ? jsonResponse(200, { preferences: { timeZone: null, dateFormat: null, language: accountLanguage } })
        : jsonResponse(preferencesStatus, { error: "nope" });
    }
    if (url === "/api/account/preferences" && init?.method === "PUT") return jsonResponse(putStatus, { preferences: {} });
    if (url === "/api/account/signup-language" && init?.method === "POST") return new Response(null, { status: signupStatus });
    return jsonResponse(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.localStorage?.clear();
});

const puts = () => calls.filter(call => call.url === "/api/account/preferences" && call.init?.method === "PUT");
const signupPosts = () => calls.filter(call => call.url === "/api/account/signup-language");

describe("D-093 language sync after sign-in (C4)", () => {
  it("saves nothing and never PUTs when the account has no language and no choice is stored", async () => {
    renderHook(() => useLanguageSync());
    await waitFor(() => expect(signupPosts()).toHaveLength(1));
    expect(puts()).toHaveLength(0);
  });

  it("PUTs an explicitly stored visible language when the account has none", async () => {
    globalThis.localStorage.setItem(STORE_KEY, "en");
    renderHook(() => useLanguageSync());
    await waitFor(() => expect(puts()).toHaveLength(1));
    const body = JSON.parse(String(puts()[0].init?.body)) as { language: string };
    expect(body).toEqual({ language: "en" });
  });

  it("lets the account's language win and updates the local copy without a PUT", async () => {
    accountLanguage = "en";
    globalThis.localStorage.setItem(STORE_KEY, "en");
    renderHook(() => useLanguageSync());
    await waitFor(() => expect(signupPosts()).toHaveLength(1));
    expect(puts()).toHaveLength(0);
    expect(globalThis.localStorage.getItem(STORE_KEY)).toBe("en");
  });

  it("overwrites an invisible stored value with the account's language", async () => {
    accountLanguage = "en";
    globalThis.localStorage.setItem(STORE_KEY, "te");
    renderHook(() => useLanguageSync());
    await waitFor(() => expect(signupPosts()).toHaveLength(1));
    expect(globalThis.localStorage.getItem(STORE_KEY)).toBe("en");
    expect(puts()).toHaveLength(0);
  });

  it("posts the device primary language to signup-language exactly once per account per device", async () => {
    const first = renderHook(() => useLanguageSync());
    await waitFor(() => expect(signupPosts()).toHaveLength(1));
    const body = JSON.parse(String(signupPosts()[0].init?.body)) as { language: string };
    expect(body.language).toBe(resolveDeviceLocale(navigator as unknown as { languages?: readonly string[]; language?: string }));
    first.unmount();
    const second = renderHook(() => useLanguageSync());
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(signupPosts()).toHaveLength(1);
    second.unmount();
  });

  it("does not PUT a stored invisible code even when the account has none", async () => {
    globalThis.localStorage.setItem(STORE_KEY, "te");
    renderHook(() => useLanguageSync());
    await waitFor(() => expect(signupPosts()).toHaveLength(1));
    expect(puts()).toHaveLength(0);
  });

  it("fails soft when preferences cannot be read: no PUT, no POST, no throw", async () => {
    preferencesStatus = 500;
    expect(() => renderHook(() => useLanguageSync())).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(puts()).toHaveLength(0);
    expect(signupPosts()).toHaveLength(0);
  });

  it("keeps the signup-language POST pending when the marker is not set after a failure", async () => {
    signupStatus = 500;
    const first = renderHook(() => useLanguageSync());
    await waitFor(() => expect(signupPosts()).toHaveLength(1));
    first.unmount();
    signupStatus = 204;
    const second = renderHook(() => useLanguageSync());
    await waitFor(() => expect(signupPosts()).toHaveLength(2));
    second.unmount();
  });

  it("never derives language from country, billing or email domain (grep pin on the new files)", () => {
    const files = [
      join(__dirname, "i18n.ts"),
      join(__dirname, "useLanguageSync.ts"),
      join(__dirname, "..", "..", "shared", "i18n", "catalog.ts"),
      join(__dirname, "..", "..", "scripts", "i18n-coverage.mjs"),
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/CF-IPCountry|ipCountry|ip_country|billingRegion|emailDomain|x-billing/i);
    }
  });
});
