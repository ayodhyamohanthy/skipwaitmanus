// @vitest-environment jsdom
// D-057-session-gate: the direct /email-review route preserves the in-session
// work-email proof, same-link retry and retryable access failure.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { GOAL_PAGE } from "./GoalEmailReviewAction";
import EmailReviewAction from "../../EmailReviewAction";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true, isLoaded: true } }));
const getToken = vi.fn().mockResolvedValue("test-token");
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ ...authState, getToken }) }));
vi.mock("wouter", () => ({
  useRoute: () => [true, { linkToken: "g".repeat(48) }],
  useLocation: () => ["/email-review", vi.fn()],
}));

const ACCESS = "/api/company-referrals/access";
const LINK = "/api/referrer-review-links/" + "g".repeat(48);
const CODE_REQUIRED = { ok: false, status: 403, json: async () => ({ error: "Confirm your work email with a code to continue.", code: "work_email_code_required" }) };
const ACCESS_REQUIRED = { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "A", codeRequired: true };
const ACCESS_VERIFIED = { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "A" };
const READY = { ok: true, status: 200, json: async () => ({ review: { ready: true } }) };
const SENT = { ok: true, status: 200, json: async () => ({ sent: true, challengeId: "c".repeat(43), expiresAt: "2026-11-09T10:10:00.000Z" }) };
const VERIFIED = { ok: true, status: 200, json: async () => ({ verified: true, expiresAt: "2026-11-09T22:00:00.000Z" }) };
let accessCodeRequired = true;
let reviewLinkReplies: Array<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const fetchMock = vi.fn(async (input: string | URL | Request) => {
  const url = String(input);
  if (url === ACCESS) return { ok: true, status: 200, json: async () => accessCodeRequired ? ACCESS_REQUIRED : ACCESS_VERIFIED };
  if (url === LINK) return reviewLinkReplies.length > 1 ? reviewLinkReplies.shift()! : reviewLinkReplies[0] ?? { ok: false, status: 404, json: async () => ({ error: "not found" }) };
  if (url.endsWith("/api/referrer/step-up/send")) return SENT;
  if (url.endsWith("/api/referrer/step-up/verify")) { accessCodeRequired = false; return VERIFIED; }
  return { ok: false, status: 404, json: async () => ({ error: "not found" }) };
});
function renderPage() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><EmailReviewAction /></QueryClientProvider>); }
async function stepUp() { fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "ref@acme.com" } }); fireEvent.click(screen.getByRole("button", { name: "Send code" })); await screen.findByLabelText("Code"); fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } }); fireEvent.click(screen.getByRole("button", { name: "Confirm" })); }
beforeEach(() => { authState.isSignedIn = true; accessCodeRequired = true; reviewLinkReplies = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); getToken.mockClear(); fetchMock.mockClear(); });

describe("direct email-review step-up", () => {
  it("shows the goal step-up on code_required, without offering standalone sign-in", async () => {
    reviewLinkReplies = [CODE_REQUIRED];
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderPage();
    await screen.findByText(/Confirm your work email/);
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in with work email" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept & connect" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(LINK, expect.objectContaining({ credentials: "include" }));
  });

  it("retries the same review link for the same account after a verified step-up", async () => {
    reviewLinkReplies = [CODE_REQUIRED, READY];
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderPage();
    await screen.findByText(/Confirm your work email/);
    await stepUp();
    await screen.findByText(/Decide on this referral/);
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === LINK)).toHaveLength(2);
  });

  it("keeps signed-out work-email sign-in canonical and sends no private reads", async () => {
    authState.isSignedIn = false;
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderPage();
    const signIn = await screen.findByRole("link", { name: "Sign in with work email" });
    expect(signIn.getAttribute("href")).toBe(referrerSignInHref("/email-review/" + "g".repeat(48)));
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an unavailable review link in plain language", async () => {
    reviewLinkReplies = [{ ok: false, status: 409, json: async () => ({ error: "This private review link is unavailable" }) }];
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    expect(await screen.findByText("Review link unavailable")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("keeps a failed work-email access read retryable", async () => {
    reviewLinkReplies = [CODE_REQUIRED];
    let accessReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input) === ACCESS && accessReads++ < 2) return { ok: false, status: 500, json: async () => ({ error: "Server error" }) };
      return fetchMock(input);
    }));
    renderPage();
    await screen.findByRole("alert");
    expect(screen.queryByText("Checking your work email…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText(/Confirm your work email/)).toBeTruthy());
  });
});
