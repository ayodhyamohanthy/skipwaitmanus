// @vitest-environment jsdom
// D-132 audit item 3: the pre-send cost line and the one-tap top-up on the ask page.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReferralRequest from "./ReferralRequest";

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReferralRequest /></QueryClientProvider>);

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
  it("flag on, short of credits: states cost, balance and the gap, and Send stays - no forced top-up (QA contract: uncovered asks wait free; covered-and-short is refused at submit)", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    quote({ level: 5, cost: 5, totalAvailable: 3, shortfall: 2 });
    localStorage.setItem("bridge-seeker-attachments", JSON.stringify([{ id: "a1", fileName: "ada-resume.pdf" }]));
    renderPage();
    await waitFor(() => expect(screen.getByText(/This ask costs 5 credits\. You have 3\. Add 2 more\./)).toBeTruthy());
    expect(screen.queryByRole("link", { name: /Add \d+ more credit/ })).toBeNull();
    const send = screen.getByRole("button", { name: /send private referral request/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it("flag on, enough credits: shows the cost line without a top-up link", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    quote({ level: 2, cost: 2, totalAvailable: 3, shortfall: 0 });
    renderPage();
    await waitFor(() => expect(screen.getByText(/This ask costs 2 credits\. You have 3\./)).toBeTruthy());
    expect(screen.queryByRole("link", { name: /Add \d+ more credit/ })).toBeNull();
  });

  it("flag on, quote pending: Send is disabled until the price is in - no flat-line fallback", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    let release!: (value: unknown) => void;
    const gate = new Promise(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("/quote") ? gate.then(() => ({ ok: true, json: async () => ({ level: 5, cost: 5, totalAvailable: 3, shortfall: 2 }) })) : { ok: false, status: 404, json: async () => ({}), text: async () => "" })));
    localStorage.setItem("bridge-seeker-attachments", JSON.stringify([{ id: "a1", fileName: "ada-resume.pdf" }]));
    renderPage();
    await screen.findByText("Pricing this ask…");
    const send = screen.getByRole("button", { name: /send private referral request/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(send); // native disabled: activation cannot reach send
    expect(vi.mocked(fetch).mock.calls.some(([u, i]) => String(u) === "/api/company-referrals" && (i as RequestInit | undefined)?.method === "POST")).toBe(false);
    expect(screen.queryByText(/This ask costs/)).toBeNull();
    release(null);
    await screen.findByText(/This ask costs 5 credits\. You have 3\. Add 2 more\./);
  });

  it("flag on, quote failed: the failure shows and Send stays disabled", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("/quote") ? { ok: false, status: 500, json: async () => ({ error: "We could not price this ask" }), text: async () => "" } : { ok: false, status: 404, json: async () => ({}), text: async () => "" })));
    localStorage.setItem("bridge-seeker-attachments", JSON.stringify([{ id: "a1", fileName: "ada-resume.pdf" }]));
    renderPage();
    await screen.findByText("We could not price this ask. Refresh to try again.");
    const send = screen.getByRole("button", { name: /send private referral request/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.queryByText(/This ask costs/)).toBeNull();
  });

  it("flag off: no quote is requested and the flat one-credit line stays", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "false");
    quote({ level: 5, cost: 5, totalAvailable: 3, shortfall: 2 });
    renderPage();
    await new Promise(r => setTimeout(r, 50));
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes("/quote"))).toBe(false);
    expect(screen.queryByText(/This ask costs/)).toBeNull();
  });
});
