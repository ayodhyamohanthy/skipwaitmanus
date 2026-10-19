// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Referrer, { ReferralCoverageInviteBanner } from "./Referrer";
import { REFERRER_OTP_LANDING_KEY } from "@/components/referrer/ReferrerSignInDialog";

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

const renderWithQuery = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
const preferences = (preferAreas: string[] = []) => ({ preferences: { referralCapacity: 3, preferAreas, preferLevels: [], referrerVisibility: "anon", notifyNewAsk: true, paused: false } });

function stubReferrerFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = String(input);
    if (url.endsWith("/inbox")) return { ok: true, json: async () => ({ requests: [] }) };
    if (url.endsWith("/verify-work-email")) return { ok: true, json: async () => ({ verified: true, workEmailDomain: "acme.com" }) };
    return { ok: true, json: async () => ({}) };
  }));
}

describe("Referrer work-email OTP verification", () => {
  beforeEach(() => {
    resetReferrerState();
    stubReferrerFetch();
  });

  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("sends a signed-in personal account to /verify from the setup dialog instead of adding a potentially taken company address", async () => {
    authState.sessionEmail = "employee@gmail.com";
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith("/inbox")) return { ok: false, status: 403, json: async () => ({ error: "Verify your company email" }) };
      if (url.endsWith("/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: false, workEmailDomain: null }) };
      if (url.endsWith("/referrer-preferences")) return { ok: true, json: async () => preferences() };
      return { ok: true, json: async () => ({}) };
    }));
    renderWithQuery(<Referrer />);
    // Kit overview only: no enrollment card, and an unverified personal session is not an error.
    expect(screen.queryByRole("button", { name: "Continue with work email" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Set up as a referrer/ }));
    expect(screen.getByRole("dialog", { name: "Your private profile." }).textContent).toContain("REFERRER SETUP · 1 OF 3");
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect((await screen.findByRole("link", { name: /Verify with a one-time code/ })).getAttribute("href")).toBe("/verify");
    expect(screen.queryByText(/DESIGN PREVIEW/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(authState.createEmailAddress).not.toHaveBeenCalled();
    expect(authState.signOut).not.toHaveBeenCalled();
  });

  it("shows verification as done and saves the chosen lane through the real preferences contract", async () => {
    authState.sessionEmail = "employee@acme.com";
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/inbox")) return { ok: true, json: async () => ({ requests: [] }) };
      if (url.endsWith("/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
      if (url.endsWith("/referrer-preferences") && init?.method === "PUT") return { ok: true, json: async () => preferences(JSON.parse(String(init.body)).preferAreas) };
      if (url.endsWith("/referrer-preferences")) return { ok: true, json: async () => preferences(["Design", "Data"]) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Referrer />);
    fireEvent.click(screen.getByRole("button", { name: /Set up as a referrer/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("Verified · acme.com")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Verify with a one-time code/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    const select = screen.getByRole("combobox", { name: "Function" }) as HTMLSelectElement;
    expect(select.value).toBe("Design");
    fireEvent.change(select, { target: { value: "Data" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/referrer-preferences", expect.objectContaining({ method: "PUT", body: JSON.stringify({ preferAreas: ["Data", "Design"] }) })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("opens the work-email OTP login first for signed-out visitors, with the overview behind it", async () => {
    authState.isSignedIn = false;
    render(<Referrer />);
    // /referrer is the employee login door: the OTP step greets visitors
    // directly instead of waiting behind the workspace overview.
    expect(screen.getByRole("dialog", { name: "Verify work email." })).toBeTruthy();
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Send sign-in code" })).toHaveLength(1);
    expect(document.querySelector("[data-skipwait-logo-mark='true']")).toBeNull();
    expect(screen.queryByText("skipwait.me")).toBeNull();
    expect(screen.queryByText(/no password, social sign-in, or personal email access/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close setup" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // Dismissed stays dismissed: the overview remains reachable.
    expect(screen.getByRole("button", { name: /Set up as a referrer/ })).toBeTruthy();
  });

  it("opens the work-email step directly for ?setup=work-email links", () => {
    authState.isSignedIn = false;
    window.history.pushState({}, "", "/referrer?setup=work-email");
    render(<Referrer />);
    expect(screen.getByRole("dialog", { name: "Verify work email." })).toBeTruthy();
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    window.history.pushState({}, "", "/");
  });

  it("rejects a personal email before initiating private Referrer authentication", async () => {
    authState.isSignedIn = false;
    render(<Referrer />);
    fireEvent.click(screen.getByRole("button", { name: /Set up as a referrer/ }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "Personal email providers cannot access private referral requests. Use your company address." }) })));
    fireEvent.change(screen.getByLabelText("Company email"), { target: { value: "person@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    await screen.findByRole("alert");
    expect(screen.getByText(/personal email providers cannot access private referral requests/i)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("enrolls the legacy company-email sign-in, then lands in the inbox without an example request on the overview", async () => {
    window.history.pushState({}, "", "/referrer");
    sessionStorage.setItem("skipwait:employee-sign-in-email", "employee@acme.com");
    const fetchMock = vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith("/inbox")) return { ok: true, json: async () => ({ requests: [] }) };
      if (url.endsWith("/verify-work-email")) return { ok: true, json: async () => ({ verified: true, workEmailDomain: "acme.com" }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Referrer />);
    expect(screen.queryByText(/Here is how a request will arrive/i)).toBeNull();
    expect(screen.queryByText(/Example only/i)).toBeNull();
    expect(document.querySelector('[data-skipwait-empty-preview="referrer"]')).toBeNull();
    await waitFor(() => expect(window.location.pathname).toBe("/inbox"));
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/verify-work-email"))).toBe(true);
    window.history.pushState({}, "", "/");
  });

  it("never tells a referrer who joined from a coverage invite that they earned a credit (D-055)", async () => {
    window.history.pushState({}, "", "/referrer");
    sessionStorage.setItem("skipwait:employee-sign-in-email", "employee@acme.com");
    sessionStorage.setItem("skipwait:company-coverage-invite", "cov-acme-1");
    const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/inbox")) return { ok: true, json: async () => ({ requests: [] }) };
      if (url.endsWith("/verify-work-email")) return { ok: true, json: async () => ({ verified: true, workEmailDomain: "acme.com", reward: { rewarded: true, tokenCount: 1 } }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Referrer />);
    expect(await screen.findByText("You joined from an invite. The person who invited you gets one referral credit after their next ask. SkipWait never pays referrers.")).toBeTruthy();
    expect(screen.queryByText(/each received one referral credit|Welcome credit added/)).toBeNull();
    const enroll = fetchMock.mock.calls.find(call => String(call[0]).endsWith("/verify-work-email"));
    expect(JSON.parse(String(enroll?.[1]?.body))).toEqual({ email: "employee@acme.com", inviteCode: "cov-acme-1" });
    window.history.pushState({}, "", "/");
  });

  it("keeps the Referrer approval free and offers a direct private-message handoff after approval", async () => {
    window.history.pushState({}, "", "/referrer?request=901");
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/901") && !init?.method) return { ok: true, json: async () => ({ request: { id: 901, candidateName: "Avery", companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [{ id: "doc-1", fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 8, key: "private/doc-1", url: "https://signed.example/avery-resume.pdf" }] } }) };
      if (url.endsWith("/901/review") && init?.method === "POST") return { ok: true, json: async () => ({ status: "approved" }) };
      return { ok: true, json: async () => ({}) };
    }));
    render(<Referrer />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve referral" })).toBeTruthy());
    expect(screen.getByText("Reviewing costs you nothing.")).toBeTruthy();
    expect(screen.queryByText(/token per approved referral/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve referral" }));
    await waitFor(() => expect(screen.getByText("Referral approved.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Message Job Seeker" })).toBeTruthy();
    // The colleague invite is informational, next to the handoff — never a gate.
    expect(screen.getByRole("region", { name: "Strengthen private coverage at acme.com" })).toBeTruthy();
    window.history.pushState({}, "", "/");
  });

  // D-021: declining a claimed request passes privately and reopens the ask for
  // the rest of the company, so the recorded state must never read as "ended".
  it("records a decline as a private pass and tells the referrer the ask stays open to colleagues", async () => {
    window.history.pushState({}, "", "/referrer?request=901");
    const posts: Array<{ url: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/901") && !init?.method) return { ok: true, json: async () => ({ request: { id: 901, candidateName: "Avery", companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [{ id: "doc-1", fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 8, key: "private/doc-1", url: "https://signed.example/avery-resume.pdf" }] } }) };
      if (url.endsWith("/901/review") && init?.method === "POST") { posts.push({ url, body: String(init.body) }); return { ok: true, json: async () => ({ status: "passed", reopened: true }) }; }
      return { ok: true, json: async () => ({}) };
    }));
    render(<Referrer />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Decline respectfully" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Decline respectfully" }));
    await waitFor(() => expect(screen.getByText("You passed privately.")).toBeTruthy());
    expect(posts).toEqual([{ url: "/api/company-referrals/901/review", body: JSON.stringify({ decision: "declined" }) }]);
    expect(screen.getByText("Your name was never shown. Their ask is open again to other verified employees.")).toBeTruthy();
    expect(screen.queryByText("Request declined.")).toBeNull();
    window.history.pushState({}, "", "/");
  });

  it("explains a company-coverage invitation to the signed-out recipient before sign-in", () => {
    resetReferrerState();
    stubReferrerFetch();
    authState.isSignedIn = false;
    window.history.pushState({}, "", "/referrer?company=acme.com&source=coverage&invite=abc123");
    render(<Referrer />);
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
    // ReferrerOtpSignIn reloads after verification; the dialog left this one-shot landing marker.
    sessionStorage.setItem(REFERRER_OTP_LANDING_KEY, "1");
    render(<Referrer />);
    // The redirect effect calls wouter's go("/inbox"), which pushStates the URL.
    await waitFor(() => expect(window.location.pathname).toBe("/inbox"));
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/api/company-referrals/inbox"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Continue with work email" })).toBeNull();
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/verify-work-email"))).toBe(false);
    expect(sessionStorage.getItem(REFERRER_OTP_LANDING_KEY)).toBeNull();
  });

  it("keeps later signed-in visits on the kit overview; the request list lives in the queue tab", async () => {
    authState.sessionEmail = "employee@acme.com";
    const fetchMock = vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith("/api/company-referrals/inbox")) return { ok: true, json: async () => ({ requests: [{ id: 12, targetRoleUrl: "https://careers.acme.com/jobs/physics", companyDomain: "acme.com", createdAt: "2026-01-01T00:00:00.000Z", attachmentCount: 2 }] }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Referrer />);
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/api/company-referrals/inbox"))).toBe(true));
    expect(screen.getByRole("button", { name: /Preview incoming asks/ })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Private requests at your company" })).toBeNull();
    expect(screen.queryByRole("link", { name: "https://careers.acme.com/jobs/physics" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review candidate" })).toBeNull();
    expect(window.location.pathname).toBe("/");
  });

  it("surfaces the inbox error verbatim for the compat session without the enrollment card and without signing out", async () => {
    authState.sessionEmail = "employee@acme.com";
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith("/api/company-referrals/inbox")) return { ok: false, status: 403, json: async () => ({ error: "Your company's private referral inbox is paused." }) };
      return { ok: true, json: async () => ({}) };
    }));
    render(<Referrer />);
    expect(await screen.findByText("Your company's private referral inbox is paused.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Your company's private referral inbox is paused.");
    expect(screen.queryByRole("button", { name: "Continue with work email" })).toBeNull();
    expect(authState.signOut).not.toHaveBeenCalled();
    // The redirect effect is suppressed while inboxError is set.
    expect(window.location.pathname).toBe("/");
  });

  it("keeps the overview to the kit sections when the company has no private requests yet", async () => {
    authState.sessionEmail = "employee@acme.com";
    render(<Referrer />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Preview incoming asks/ })).toBeTruthy());
    expect(document.querySelector('[data-skipwait-empty-preview="referrer"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Share on WhatsApp" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue with work email" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens setup at its verify step for a signed-in ?setup=work-email link", async () => {
    authState.sessionEmail = "employee@gmail.com";
    window.history.pushState({}, "", "/referrer?setup=work-email");
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith("/access")) return { ok: true, json: async () => ({ verifiedCompanyAccess: false, workEmailDomain: null }) };
      if (url.endsWith("/referrer-preferences")) return { ok: true, json: async () => preferences() };
      return { ok: false, status: 403, json: async () => ({ error: "Verify your company email" }) };
    }));
    renderWithQuery(<Referrer />);
    expect(await screen.findByRole("dialog", { name: "Verify work email." })).toBeTruthy();
    expect(screen.getByText("REFERRER SETUP · 2 OF 3")).toBeTruthy();
    expect((await screen.findByRole("link", { name: /Verify with a one-time code/ })).getAttribute("href")).toBe("/verify");
    window.history.pushState({}, "", "/");
  });
});
