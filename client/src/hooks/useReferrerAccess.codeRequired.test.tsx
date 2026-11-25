// @vitest-environment jsdom
// D-057-session-gate (§0b.5, §0b.6; red first): a verified referrer in a
// personal-login session is `code_required`, and a work_email_code_required
// refusal from any referrer fetch re-checks the verdict.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReferrerAccess } from "./useReferrerAccess";
import { notifyWorkEmailCodeRequired } from "@/lib/referrerStepUpApi";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, userId: "12", getToken: vi.fn().mockResolvedValue("t") }) }));
const VERIFIED = { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "AC" };
let body: Record<string, unknown>;
const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
const render = () => renderHook(() => useReferrerAccess(), { wrapper: ({ children }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider> });

beforeEach(() => { fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("useReferrerAccess code_required", () => {
  it("reports code_required with the company when the server says the session needs a code", async () => {
    body = { ...VERIFIED, codeRequired: true };
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("code_required"));
    expect(result.current).toMatchObject({ access: { verified: true, domain: "acme.com", companyName: "Acme", codeRequired: true } });
  });

  it("reads a missing codeRequired as false (an older server)", async () => {
    body = { ...VERIFIED };
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("verified"));
  });

  it("re-checks the verdict when a referrer action is refused with work_email_code_required", async () => {
    body = { ...VERIFIED, codeRequired: false };
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe("verified"));
    body = { ...VERIFIED, codeRequired: true };
    notifyWorkEmailCodeRequired();
    await waitFor(() => expect(result.current.status).toBe("code_required"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
