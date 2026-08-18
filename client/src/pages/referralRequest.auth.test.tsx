// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReferralRequest from "./ReferralRequest";

const authState = vi.hoisted(() => ({ signedIn: false, openSignIn: vi.fn() }));
const pendingResume = vi.hoisted(() => ({ files: [] as File[], save: vi.fn(), clear: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
  trpc: { ai: { draftHiringManagerEmail: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } },
}));
vi.mock("@/lib/pendingResume", () => ({
  savePendingResumeFiles: async (files: File[]) => { pendingResume.files = files; pendingResume.save(files); },
  restorePendingResumeFiles: async () => pendingResume.files,
  clearPendingResumeFiles: async () => { pendingResume.files = []; pendingResume.clear(); },
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.signedIn, getToken: vi.fn().mockResolvedValue("test-clerk-token") }),
  useClerk: () => ({ openUserProfile: vi.fn(), openSignIn: authState.openSignIn }),
  useUser: () => ({ isLoaded: true, user: null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <span onClick={authState.openSignIn}>{children}</span>,
}));

describe("ReferralRequest secure resume handoff", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("bridge-job-seeker-token-reset-3-free-v1", "complete");
    localStorage.setItem("bridge-tokens", "3");
    localStorage.setItem("bridge-target-url", "https://careers.acme.com/jobs/design");
    authState.signedIn = false;
    authState.openSignIn.mockReset();
    pendingResume.files = [];
    pendingResume.save.mockReset();
    pendingResume.clear.mockReset();
  });

  afterEach(() => cleanup());

  it("persists an unsigned resume through sign-in and continues secure upload", async () => {
    render(<ReferralRequest />);
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const openFileChooser = vi.spyOn(fileInput, "click");
    fireEvent.click(screen.getByText("Add your resume").closest("button") as HTMLButtonElement);
    expect(openFileChooser).toHaveBeenCalledTimes(1);
    fireEvent.change(fileInput, { target: { files: [new File(["resume"], "avery-resume.pdf", { type: "application/pdf" })] } });
    expect(screen.getByText("avery-resume.pdf")).toBeTruthy();
    await waitFor(() => expect(pendingResume.save).toHaveBeenCalledTimes(1));
    const send = screen.getByRole("button", { name: /send private referral request/i }) as HTMLButtonElement;
    await waitFor(() => expect(send.disabled).toBe(false));
    fireEvent.click(send);
    await waitFor(() => expect(authState.openSignIn).toHaveBeenCalledTimes(1));
    expect(pendingResume.files[0]?.name).toBe("avery-resume.pdf");

    cleanup();
    authState.signedIn = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => String(input).includes("/api/documents") ? { ok: true, json: async () => ({ id: "71", fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 6, key: "private/71", url: "/api/documents/71" }) } : { ok: true, json: async () => ({ companyDomain: "acme.com", remainingTokens: 2 }) }));
    render(<ReferralRequest />);
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/api/documents"))).toBe(true));
    await waitFor(() => expect(pendingResume.clear).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("1 of 3 free credits used this month.")).toBeTruthy());
    expect(screen.getByRole("link", { name: "Request another referral" }).getAttribute("href")).toBe("/start");
    vi.unstubAllGlobals();
  });

  it("shows the real file chooser once the Job Seeker is signed in", () => {
    authState.signedIn = true;
    render(<ReferralRequest />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    expect(fileInput?.disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Account menu" })).toBeTruthy();
    const openFileChooser = vi.spyOn(fileInput as HTMLInputElement, "click");
    fireEvent.click(screen.getByText("Add your resume").closest("button") as HTMLButtonElement);
    expect(openFileChooser).toHaveBeenCalledTimes(1);
  });

  it("keeps credits intact and presents one visual coverage invite action when no verified employee exists at the employer", async () => {
    authState.signedIn = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (String(input).includes("/api/documents")) return { ok: true, json: async () => ({ id: "72", fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 6, key: "private/72", url: "/api/documents/72" }) };
      if (String(input).includes("/api/company-referrals")) return { ok: true, json: async () => ({ companyDomain: "acme.com", coverageStatus: "waiting_for_company_coverage", remainingTokens: 3, creditSummary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, purchasedCreditsRemaining: 0, totalAvailable: 3, cycleKey: "2026-08", subscriptionStatus: null, subscriptionCurrentTermEnd: null } }) };
      return { ok: true, json: async () => ({ summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, purchasedCreditsRemaining: 0, totalAvailable: 3, cycleKey: "2026-08", subscriptionStatus: null, subscriptionCurrentTermEnd: null } }) };
    }));
    render(<ReferralRequest />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["resume"], "avery-resume.pdf", { type: "application/pdf" })] } });
    const sendButton = screen.getByRole("button", { name: /send private referral request/i }) as HTMLButtonElement;
    await waitFor(() => expect(sendButton.disabled).toBe(false));
    fireEvent.click(sendButton);
    await waitFor(() => expect(document.querySelector('[data-skipwait-coverage-invite="true"]')).toBeTruthy());
    expect(screen.getByRole("button", { name: "Invite one employee at acme.com" })).toBeTruthy();
    expect(screen.queryByText(/We are building coverage/i)).toBeNull();
    expect(screen.queryByText(/did not use a credit/i)).toBeNull();
    vi.unstubAllGlobals();
  });
});
