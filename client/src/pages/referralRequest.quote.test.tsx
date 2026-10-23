// @vitest-environment jsdom
// D-132 audit item 3: the pre-send cost line and the one-tap top-up on the ask page.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import ReferralRequest from "./ReferralRequest";

vi.mock("@/lib/trpc", () => ({ trpc: { ai: { draftHiringManagerEmail: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } } }));
vi.mock("@/lib/pendingResume", () => ({ savePendingResumeFiles: async () => undefined, restorePendingResumeFiles: async () => [], clearPendingResumeFiles: async () => undefined }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("t"), openSignIn: vi.fn() }),
  useUser: () => ({ isLoaded: true, user: null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const quote = (q: { level: number; cost: number; totalAvailable: number; shortfall: number }) =>
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("/quote") ? { ok: true, json: async () => q } : { ok: false, status: 404, json: async () => ({}), text: async () => "" })));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("bridge-job-seeker-token-reset-3-free-v1", "complete");
  localStorage.setItem("bridge-tokens", "3");
  localStorage.setItem("bridge-target-url", "https://careers.acme.com/jobs/staff-design");
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("ask page quote (D-132 item 3)", () => {
  it("flag on, short of credits: states cost, balance and the gap, and the primary action is a top-up link", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    quote({ level: 5, cost: 5, totalAvailable: 3, shortfall: 2 });
    render(<ReferralRequest />);
    await waitFor(() => expect(screen.getByText(/This ask costs 5 credits\. You have 3\. Add 2 more\./)).toBeTruthy());
    const topUp = screen.getByRole("link", { name: /Add 2 more credits/ }) as HTMLAnchorElement;
    expect(topUp.getAttribute("href")).toBe("/premium?role=job_seeker");
    expect(screen.queryByRole("button", { name: /send private request/i })).toBeNull();
  });

  it("flag on, enough credits: shows the cost line without a top-up link", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    quote({ level: 2, cost: 2, totalAvailable: 3, shortfall: 0 });
    render(<ReferralRequest />);
    await waitFor(() => expect(screen.getByText(/This ask costs 2 credits\. You have 3\./)).toBeTruthy());
    expect(screen.queryByRole("link", { name: /Add \d+ more credit/ })).toBeNull();
  });

  it("flag off: no quote is requested and the flat one-credit line stays", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "false");
    quote({ level: 5, cost: 5, totalAvailable: 3, shortfall: 2 });
    render(<ReferralRequest />);
    await new Promise(r => setTimeout(r, 50));
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes("/quote"))).toBe(false);
    expect(screen.queryByText(/This ask costs/)).toBeNull();
  });
});
