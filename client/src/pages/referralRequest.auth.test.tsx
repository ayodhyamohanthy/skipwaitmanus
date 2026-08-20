// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReferralRequest from "./ReferralRequest";

const authState = vi.hoisted(() => ({ signedIn: false, openSignIn: vi.fn() }));
const pendingResume = vi.hoisted(() => ({ files: [] as File[], save: vi.fn(), clear: vi.fn(), restore: vi.fn(async () => [] as File[]) }));

vi.mock("@/lib/trpc", () => ({
  trpc: { ai: { draftHiringManagerEmail: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } },
}));
vi.mock("@/lib/pendingResume", () => ({
  savePendingResumeFiles: async (files: File[]) => { pendingResume.files = files; pendingResume.save(files); },
  restorePendingResumeFiles: () => pendingResume.restore(),
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
    pendingResume.restore.mockReset();
    pendingResume.restore.mockImplementation(async () => pendingResume.files);
  });

  afterEach(() => cleanup());

  it("persists an unsigned resume through sign-in and continues secure upload", async () => {
    render(<ReferralRequest />);
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
    expect(screen.queryByText(/monthly credit/i)).toBeNull();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const openFileChooser = vi.spyOn(fileInput, "click");
    fireEvent.click(screen.getAllByRole("button", { name: /add your resume/i })[0]);
    expect(openFileChooser).toHaveBeenCalledTimes(1);
    fireEvent.change(fileInput, { target: { files: [new File(["resume"], "avery-resume.pdf", { type: "application/pdf" })] } });
    expect(screen.getByText("avery-resume.pdf")).toBeTruthy();
    await waitFor(() => expect(pendingResume.save).toHaveBeenCalledTimes(1));
    const send = await screen.findByRole("button", { name: /sign in & send private request/i }) as HTMLButtonElement;
    await waitFor(() => expect(send.disabled).toBe(false));
    fireEvent.click(send);
    await waitFor(() => expect(authState.openSignIn).toHaveBeenCalledTimes(1));
    expect(pendingResume.files[0]?.name).toBe("avery-resume.pdf");

    cleanup();
    authState.signedIn = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => String(input).includes("/complete") ? { ok: true, json: async () => ({ id: "71", fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 6, key: "private/71", url: "/api/documents/71" }) } : String(input).includes("/chunks") ? { ok: true, json: async () => ({ nextChunkIndex: 1, receivedSize: 6 }) } : String(input).includes("/api/documents/uploads") ? { ok: true, json: async () => ({ sessionId: "upload-71", chunkBytes: 49152 }) } : { ok: true, json: async () => ({ companyDomain: "acme.com", remainingTokens: 2, lifetimeRequestCount: 1 }) }));
    render(<ReferralRequest />);
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/api/documents"))).toBe(true));
    const startCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/api/documents/uploads"));
    const chunkCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("/chunks"));
    const completeCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("/complete"));
    expect(startCall?.[1]).toMatchObject({ method: "POST", headers: expect.objectContaining({ "Content-Type": "application/json", Authorization: "Bearer test-clerk-token" }) });
    expect(JSON.parse(String(startCall?.[1]?.body))).toMatchObject({ fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 6 });
    const encryptedChunk = JSON.parse(String(chunkCall?.[1]?.body)); expect(encryptedChunk).toMatchObject({ chunkIndex: 0, encryptedContent: expect.any(String), encryptionKey: expect.any(String), initializationVector: expect.any(String) });
    expect(completeCall?.[1]).toMatchObject({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer test-clerk-token" }) });
    await waitFor(() => expect(pendingResume.clear).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("1 of 3 free credits used this month.")).toBeTruthy());
    expect(screen.getByLabelText("Referral request milestone").textContent).toContain("Your 1st referral request is now active.");
    expect(document.querySelector("[data-referral-success='true']")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Share your invite link" }).getAttribute("href")).toBe("/share");
    expect(screen.queryByRole("link", { name: "Request another referral" })).toBeNull();
    expect(screen.queryByRole("link", { name: "View my request" })).toBeNull();
    vi.unstubAllGlobals();
  });

  it("uses the primary action to open the resume picker before a document is selected", async () => {
    render(<ReferralRequest />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const openFileChooser = vi.spyOn(fileInput, "click");
    const primaryAction = screen.getAllByRole("button", { name: "Add your resume" }).at(-1) as HTMLButtonElement;
    expect(primaryAction.disabled).toBe(false);
    fireEvent.click(primaryAction);
    expect(openFileChooser).toHaveBeenCalledTimes(1);
  });

  it("does not disable the post-resume CTA while IndexedDB restoration is pending", async () => {
    pendingResume.restore.mockImplementation(() => new Promise<File[]>(() => undefined));
    render(<ReferralRequest />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["resume"], "avery-resume.pdf", { type: "application/pdf" })] } });
    const send = await screen.findByRole("button", { name: /sign in & send private request/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it("rejects unsupported files before storing or uploading a resume", () => {
    render(<ReferralRequest />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["script"], "resume.html", { type: "text/html" })] } });
    expect(screen.getByText(/Use a PDF, Word document, PNG, or JPEG resume/i)).toBeTruthy();
    expect(pendingResume.save).not.toHaveBeenCalled();
  });

  it("does not reveal a cached credit count before the Job Seeker signs in", () => {
    localStorage.setItem("bridge-tokens", "5");
    render(<ReferralRequest />);
    expect(screen.queryByText(/5 credits available/i)).toBeNull();
    expect(screen.queryByText(/monthly credit/i)).toBeNull();
  });

  it("shows the real file chooser once the Job Seeker is signed in", () => {
    authState.signedIn = true;
    render(<ReferralRequest />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    expect(fileInput?.disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Account menu" })).toBeTruthy();
    const openFileChooser = vi.spyOn(fileInput as HTMLInputElement, "click");
    fireEvent.click(screen.getAllByRole("button", { name: /add your resume/i })[0]);
    expect(openFileChooser).toHaveBeenCalledTimes(1);
  });

  it("offers an optional note for the exact-company Referrer once a resume is attached", async () => {
    authState.signedIn = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => String(input).includes("/complete") ? { ok: true, json: async () => ({ id: "73", fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 6, key: "private/73", url: "/api/documents/73" }) } : String(input).includes("/chunks") ? { ok: true, json: async () => ({ nextChunkIndex: 1, receivedSize: 6 }) } : String(input).includes("/api/documents/uploads") ? { ok: true, json: async () => ({ sessionId: "upload-73", chunkBytes: 49152 }) } : { ok: true, json: async () => ({ summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, purchasedCreditsRemaining: 0, totalAvailable: 3, cycleKey: "2026-08", subscriptionStatus: null, subscriptionCurrentTermEnd: null } }) }));
    render(<ReferralRequest />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["resume"], "avery-resume.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByRole("button", { name: /add a note for the referrer/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /add a note for the referrer/i }));
    const note = screen.getByLabelText(/note for the referrer/i) as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "I led a measurable product design launch." } });
    expect(note.value).toBe("I led a measurable product design launch.");
    vi.unstubAllGlobals();
  });

  it("confirms that all available credits are used before showing the optional purchase action", async () => {
    authState.signedIn = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 0, purchasedCreditsRemaining: 0, totalAvailable: 0, cycleKey: "2026-08", subscriptionStatus: null, subscriptionCurrentTermEnd: null } }) })));
    render(<ReferralRequest />);

    await waitFor(() => expect(screen.getByText("You have used all available referral credits.")).toBeTruthy());
    expect(screen.getByText("0/3 monthly credits left")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add credits" })).toBeTruthy();
  });

  it("keeps credits intact and presents one visual coverage invite action when no verified employee exists at the employer", async () => {
    authState.signedIn = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (String(input).includes("/complete")) return { ok: true, json: async () => ({ id: "72", fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 6, key: "private/72", url: "/api/documents/72" }) };
      if (String(input).includes("/chunks")) return { ok: true, json: async () => ({ nextChunkIndex: 1, receivedSize: 6 }) };
      if (String(input).includes("/api/documents/uploads")) return { ok: true, json: async () => ({ sessionId: "upload-72", chunkBytes: 49152 }) };
      if (String(input).includes("/api/company-referrals")) return { ok: true, json: async () => ({ companyDomain: "acme.com", coverageStatus: "waiting_for_company_coverage", remainingTokens: 3, creditSummary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, purchasedCreditsRemaining: 0, totalAvailable: 3, cycleKey: "2026-08", subscriptionStatus: null, subscriptionCurrentTermEnd: null } }) };
      return { ok: true, json: async () => ({ summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, purchasedCreditsRemaining: 0, totalAvailable: 3, cycleKey: "2026-08", subscriptionStatus: null, subscriptionCurrentTermEnd: null } }) };
    }));
    render(<ReferralRequest />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["resume"], "avery-resume.pdf", { type: "application/pdf" })] } });
    const sendButton = await screen.findByRole("button", { name: /send private referral request/i }) as HTMLButtonElement;
    await waitFor(() => expect(sendButton.disabled).toBe(false));
    fireEvent.click(sendButton);
    await waitFor(() => expect(document.querySelector('[data-skipwait-coverage-invite="true"]')).toBeTruthy());
    expect(screen.getByRole("button", { name: "Invite one employee at acme.com" })).toBeTruthy();
    expect(screen.queryByText(/We are building coverage/i)).toBeNull();
    expect(screen.queryByText(/did not use a credit/i)).toBeNull();
    vi.unstubAllGlobals();
  });
});
