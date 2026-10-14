// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referrerAccessKey, useReferrerAccess, type ReferrerAccessState } from "./useReferrerAccess";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, userId: "12" as string | null } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ ...authState, getToken: vi.fn().mockResolvedValue("t") }) }));

const VERIFIED = { verifiedCompanyAccess: true, workEmailDomain: "skipwait.me", companyName: "SkipWait", companyInitials: "SW" };
const UNVERIFIED = { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null };
let reply: { status: number; body: unknown };
const fetchMock = vi.fn(async () => ({ ok: reply.status < 400, status: reply.status, json: async () => reply.body }));

function renderAccess(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const seen: ReferrerAccessState["status"][] = [];
  const view = renderHook(() => { const state = useReferrerAccess(); seen.push(state.status); return state; }, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  return { ...view, seen, client };
}

beforeEach(() => { authState.isSignedIn = true; authState.userId = "12"; reply = { status: 200, body: VERIFIED }; fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("useReferrerAccess", () => {
  it("reports signed-out without asking the server", () => {
    authState.isSignedIn = false;
    const { result } = renderAccess();
    expect(result.current.status).toBe("signed-out");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks, then reports the server's verified verdict with the company", async () => {
    const { result, seen } = renderAccess();
    await waitFor(() => expect(result.current.status).toBe("verified"));
    expect(seen[0]).toBe("checking");
    expect(result.current).toMatchObject({ access: { verified: true, domain: "skipwait.me", companyName: "SkipWait" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/access", expect.objectContaining({ credentials: "include", headers: { Authorization: "Bearer t" } }));
  });

  it("reports unverified only when the server says so", async () => {
    reply = { status: 200, body: UNVERIFIED };
    const { result } = renderAccess();
    await waitFor(() => expect(result.current.status).toBe("unverified"));
  });

  it("reports an error with the server's message and a working retry, never unverified", async () => {
    reply = { status: 401, body: { error: "Sign in with your company email to continue" } };
    const { result, seen } = renderAccess();
    await waitFor(() => expect(result.current.status).toBe("error"), { timeout: 4000 });
    const failed = result.current;
    if (failed.status !== "error") throw new Error("expected the error state");
    expect(failed.error.message).toBe("Sign in with your company email to continue");
    expect(seen).not.toContain("unverified");
    reply = { status: 200, body: VERIFIED };
    failed.retry();
    await waitFor(() => expect(result.current.status).toBe("verified"));
  });

  it("never shows a cached 'not verified' as the gate while the fresh check runs (code just verified on /verify)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(referrerAccessKey("12"), { verified: false, domain: "", companyName: null, companyInitials: null });
    const { result, seen } = renderAccess(client);
    await waitFor(() => expect(result.current.status).toBe("verified"));
    expect(seen).not.toContain("unverified");
  });

  it("keeps a verified referrer verified while the re-check runs", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(referrerAccessKey("12"), { verified: true, domain: "skipwait.me", companyName: "SkipWait", companyInitials: "SW" });
    let release: (() => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ ok: true, status: 200, json: async () => VERIFIED }); }));
    const { result, seen } = renderAccess(client);
    expect(result.current.status).toBe("verified");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    release?.();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(new Set(seen)).toEqual(new Set(["verified"]));
  });

  it("keys the verdict by account so a different sign-in is checked afresh", async () => {
    const { result, rerender, client } = renderAccess();
    await waitFor(() => expect(result.current.status).toBe("verified"));
    authState.userId = "99";
    reply = { status: 200, body: UNVERIFIED };
    rerender();
    await waitFor(() => expect(result.current.status).toBe("unverified"));
    expect(client.getQueryData(referrerAccessKey("12"))).toMatchObject({ verified: true });
  });
});
