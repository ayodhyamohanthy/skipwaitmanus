// @vitest-environment jsdom
// Receiver proof for "Preserve the job link from start through the ask form":
// the /start hand-off (referral draft + company confirmation binding written by
// Onboarding.begin, routed via /request) must fill the real ask form's link
// field. Lowest precedence, confirmation-bound, one-hour freshness, and stale
// or mismatched hand-offs are cleaned up instead of applied.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_PREFILL_KEY } from "@/lib/askPrefill";
import { clearPrivateReferralBrowserData } from "@/lib/logoutPrivacy";
import Ask from "./Ask";

const { go, authState, signIn } = vi.hoisted(() => ({
  go: vi.fn(),
  authState: { isLoaded: true, isSignedIn: true },
  signIn: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/ask", go],
  useSearch: () => "",
  useRoute: () => [true, {}],
}));
vi.mock("./explore/signInHandoff", async importOriginal => ({
  ...await importOriginal<typeof import("./explore/signInHandoff")>(),
  goToSeekerSignIn: signIn,
}));

const LINK = "https://careers.wipro.com/jobs/1234567-product-designer";
const DRAFT_KEY = "skipwait-pwa-referral-draft";
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/companies") return json(200, { companies: [], openCount: 0 });
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 4 } });
    if (path === "/api/profile/setup") return json(200, { goal: "", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "", resume: { id: 77, fileName: "ada-resume.pdf" } });
    if (path === "/api/ask-drafts" && (init?.method ?? "GET") === "GET") return json(200, { draft: null });
    return json(404, { error: "not found" });
  }));
}

function writeHandoff(updatedAt: number, canonicalUrl: string | null = LINK) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: "Ada", targetUrl: LINK, updatedAt }));
  localStorage.setItem("bridge-target-url", LINK);
  if (canonicalUrl !== null) localStorage.setItem("bridge-company-confirmation", JSON.stringify({ canonicalUrl, confirmedDomain: "wipro.com" }));
}

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Ask /></QueryClientProvider>);
const linkInput = () => screen.getByLabelText("Job link") as HTMLInputElement;

beforeEach(() => {
  window.history.pushState({}, "", "/ask");
  stubFetch();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("the /start hand-off into the real ask form", () => {
  it("fills the job link the seeker began with", async () => {
    writeHandoff(Date.now());
    renderPage();
    await waitFor(() => expect(linkInput().value).toBe(LINK));
  });

  it("keeps the session prefill ahead of the start draft", async () => {
    writeHandoff(Date.now());
    sessionStorage.setItem(ASK_PREFILL_KEY, JSON.stringify({ companySlug: null, targetRoleUrl: "https://jobs.infosys.com/role/42", note: "", savedAt: Date.now() }));
    renderPage();
    await waitFor(() => expect(linkInput().value).toBe("https://jobs.infosys.com/role/42"));
  });

  it("never applies a stale draft and cleans the hand-off up", async () => {
    writeHandoff(Date.now() - 2 * 60 * 60 * 1000);
    renderPage();
    await waitFor(() => expect(linkInput()).toBeTruthy());
    expect(linkInput().value).toBe("");
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem("bridge-target-url")).toBeNull();
    expect(localStorage.getItem("bridge-company-confirmation")).toBeNull();
  });

  it("never applies a hand-off that crossed a sign-out boundary (account binding)", async () => {
    writeHandoff(Date.now());
    await clearPrivateReferralBrowserData();
    renderPage();
    await waitFor(() => expect(linkInput()).toBeTruthy());
    expect(linkInput().value).toBe("");
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem("bridge-target-url")).toBeNull();
    expect(localStorage.getItem("bridge-company-confirmation")).toBeNull();
  });

  it("never applies a draft whose confirmation binding names another link", async () => {
    writeHandoff(Date.now(), "https://evil.example/role/9");
    renderPage();
    await waitFor(() => expect(linkInput()).toBeTruthy());
    expect(linkInput().value).toBe("");
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
