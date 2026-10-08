// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Referrer, { ReferralCoverageInviteBanner } from "./Referrer";

const authState = vi.hoisted(() => {
  const emailAddress = {
    id: "work-email-id",
    emailAddress: "employee@acme.com",
    verification: { status: "unverified" },
    prepareVerification: vi.fn().mockResolvedValue(undefined),
    attemptVerification: vi.fn(async () => {
      emailAddress.verification.status = "verified";
      return { verification: { status: "verified" } };
    }),
  };
  return {
    emailAddress,
    createEmailAddress: vi.fn().mockResolvedValue(emailAddress),
    reload: vi.fn().mockResolvedValue(undefined),
    isSignedIn: true,
    // Session email, exposed as user.primaryEmailAddress.emailAddress. The
    // fixed Referrer screen derives OTP enrollment from this; "" means the
    // mock session has no email.
    sessionEmail: "",
    // useAuth().signOut — both the "Continue with work email" escape
    // hatch and the AccountMenu sign-out route through it.
    signOut: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.isSignedIn, getToken: vi.fn().mockResolvedValue("test-token"), signOut: authState.signOut }),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      emailAddresses: [authState.emailAddress],
      createEmailAddress: authState.createEmailAddress,
      reload: authState.reload,
      // Compat sessions expose the verified session email here; Referrer treats
      // a company domain as "enrolled server-side during /api/auth/otp/verify".
      primaryEmailAddress: { emailAddress: authState.sessionEmail, verification: { status: "verified" } },
    },
  }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

function resetReferrerState() {
  localStorage.clear();
  // jsdom sessionStorage persists across tests in this file; each test opts in
  // to the legacy "skipwait:employee-sign-in-email" key explicitly instead.
  sessionStorage.clear();
  authState.isSignedIn = true;
  authState.sessionEmail = "";
  authState.signOut.mockClear();
  authState.emailAddress.verification.status = "unverified";
  authState.createEmailAddress.mockClear(); authState.reload.mockClear(); authState.emailAddress.prepareVerification.mockClear(); authState.emailAddress.attemptVerification.mockClear();
}

function stubReferrerFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = String(input);
    if (url.endsWith("/inbox")) return { ok: true, json: async () => ({ requests: [] }) };
    if (url.endsWith("/verify-work-email")) return { ok: true, json: async () => ({ verified: true, workEmailDomain: "acme.com" }) };
    return { ok: true, json: async () => ({}) };
  }));
}


function renderReferrer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Referrer /></QueryClientProvider>);
}

describe("Referrer work-email OTP verification", () => {
  beforeEach(() => {
    resetReferrerState();
    stubReferrerFetch();
  });

  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("asks a signed-in personal account to switch to the dedicated work-email sign-in instead of adding a potentially taken company address", async () => {
    authState.sessionEmail = "employee@gmail.com";
    renderReferrer();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue with work email" })).toBeTruthy());
    expect(authState.createEmailAddress).not.toHaveBeenCalled();
  });

  it("opens directly to one compact company-email OTP action before secure employee sign-in", async () => {
    authState.isSignedIn = false;
    renderReferrer();
    expect(screen.getByText("Become a verified referrer")).toBeTruthy();
    expect(screen.getByText("Two quick steps: sign in, then verify your work email.")).toBeTruthy();
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send sign-in code" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
    expect(document.querySelector('[data-skipwait-screen="referrer-sign-in"]')?.className).toContain("h-dvh");
    expect(document.querySelector('[data-skipwait-screen="referrer-sign-in"]')?.className).toContain("overflow-hidden");
    expect(document.querySelector("[data-skipwait-logo-mark='true']")).toBeNull();
    expect(screen.queryByText("skipwait.me")).toBeNull();
    expect(screen.queryByText(/no password, social sign-in, or personal email access/i)).toBeNull();
  });

  it("rejects a personal email before initiating private Referrer authentication", async () => {
    authState.isSignedIn = false;
    renderReferrer();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "Personal email providers cannot access private referral requests. Use your company address." }) })));
    fireEvent.change(screen.getByLabelText("Company email"), { target: { value: "person@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    await screen.findByRole("alert");
    expect(screen.getByText(/personal email providers cannot access private referral requests/i)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("shows an icon-first request mockup and direct voluntary share channels only after company-email enrollment", async () => {
    sessionStorage.setItem("skipwait:employee-sign-in-email", "employee@acme.com");
    renderReferrer();
    await waitFor(() => expect(document.querySelector('[data-skipwait-empty-preview="referrer"]')).toBeTruthy());
    expect(screen.getByRole("link", { name: "Share on WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Share by email" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
    expect(screen.queryByText(/Here is how a request will arrive/i)).toBeNull();
    expect(screen.queryByText(/Example only/i)).toBeNull();
  });

  it("keeps the Referrer approval free and offers a direct private-message handoff after approval", async () => {
    window.history.pushState({}, "", "/referrer?request=901");
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/901") && !init?.method) return { ok: true, json: async () => ({ request: { id: 901, candidateName: "Avery", companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [{ id: "doc-1", fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 8, key: "private/doc-1", url: "https://signed.example/avery-resume.pdf" }] } }) };
      if (url.endsWith("/901/review") && init?.method === "POST") return { ok: true, json: async () => ({ status: "approved" }) };
      return { ok: true, json: async () => ({}) };
    }));
    renderReferrer();
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve referral" })).toBeTruthy());
    expect(screen.getByText("Reviewing is free.")).toBeTruthy();
    expect(screen.queryByText(/token per approved referral/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve referral" }));
    await waitFor(() => expect(screen.getByText("Referral approved.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Message Job Seeker" })).toBeTruthy();
    // The colleague invite is informational, next to the handoff — never a gate.
    expect(screen.getByRole("region", { name: "Strengthen private coverage at acme.com" })).toBeTruthy();
    window.history.pushState({}, "", "/");
  });

  it("explains a company-coverage invitation to the signed-out recipient before sign-in", () => {
    resetReferrerState();
    stubReferrerFetch();
    authState.isSignedIn = false;
    window.history.pushState({}, "", "/referrer?company=acme.com&source=coverage&invite=abc123");
    renderReferrer();
    const banner = screen.getByRole("region", { name: "Strengthen private coverage at acme.com" });
    expect(banner.textContent).toMatch(/verify a work email and choose whether to help/i);
    const emailShare = screen.getByRole("link", { name: "Share by email" });
    expect(emailShare.getAttribute("href")).toContain(encodeURIComponent("/referrer?company=acme.com"));
    expect(emailShare.getAttribute("href")).toContain(encodeURIComponent("invite=abc123"));
    window.history.pushState({}, "", "/");
  });

  it("builds the coverage banner link with the company and invite code only", () => {
    render(<ReferralCoverageInviteBanner companyDomain="acme.com" inviteCode="abc123" />);
    expect(screen.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href")).toContain(encodeURIComponent("invite=abc123"));
    expect(screen.getByText("Strengthen private coverage").tagName).toBe("P");
  });
});

describe("Referrer compat OTP session (no legacy sessionStorage enrollment key)", () => {
  beforeEach(() => {
    resetReferrerState();
    window.history.pushState({}, "", "/");
    stubReferrerFetch();
  });

  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("skips the work-email enrollment card and opens the loaded company inbox when the compat session email is a verified company address", async () => {
    authState.sessionEmail = "employee@acme.com";
    const fetchMock = vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith("/api/company-referrals/inbox")) return { ok: true, json: async () => ({ requests: [{ id: 12, targetRoleUrl: "https://careers.acme.com/jobs/physics", companyDomain: "acme.com", createdAt: "2026-01-01T00:00:00.000Z", attachmentCount: 2 }] }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderReferrer();
    expect(await screen.findByRole("link", { name: "https://careers.acme.com/jobs/physics" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue with work email" })).toBeNull();
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/verify-work-email"))).toBe(false);
    // The redirect effect calls wouter's go("/inbox"), which pushStates the URL.
    await waitFor(() => expect(window.location.pathname).toBe("/inbox"));
  });

  it("surfaces the inbox error verbatim for the compat session without the enrollment card and without signing out", async () => {
    authState.sessionEmail = "employee@acme.com";
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith("/api/company-referrals/inbox")) return { ok: false, status: 403, json: async () => ({ error: "Your company's private referral inbox is paused." }) };
      return { ok: true, json: async () => ({}) };
    }));
    renderReferrer();
    expect(await screen.findByText("Your company's private referral inbox is paused.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Your company's private referral inbox is paused.");
    expect(screen.queryByRole("button", { name: "Continue with work email" })).toBeNull();
    expect(authState.signOut).not.toHaveBeenCalled();
    // The redirect effect is suppressed while inboxError is set.
    expect(window.location.pathname).toBe("/");
  });

  it("shows the illustrative empty-inbox preview when the compat session has no private requests yet", async () => {
    authState.sessionEmail = "employee@acme.com";
    renderReferrer();
    await waitFor(() => expect(document.querySelector('[data-skipwait-empty-preview="referrer"]')).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Continue with work email" })).toBeNull();
  });
});
