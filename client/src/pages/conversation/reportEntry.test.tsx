// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SeekerConversation } from "./SeekerConversation";
import type { ThreadRequest } from "@/lib/threadApi";

const VIEWER_ID = 6603;
const REQUEST_ID = 731;
const REFERRER_ID = 5502;
const REFERENCE_ID = "ACME-9917";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: VIEWER_ID,
    getToken: vi.fn().mockResolvedValue("test-token"),
    openSignIn: vi.fn(),
  }),
  useUser: () => ({
    user: { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] },
  }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => [`/conversation/${REQUEST_ID}`, vi.fn()],
}));

function makeRequest(overrides: Partial<ThreadRequest> = {}): ThreadRequest {
  return {
    id: REQUEST_ID,
    title: "Senior Software Engineer",
    pitch: "Experienced backend engineer.",
    candidateName: null,
    targetRoleUrl: "https://careers.acme.com/jobs/swe",
    companyDomain: "acme.com",
    companyName: "Acme",
    companyInitials: "A",
    jobFunction: null,
    status: "pending",
    referrerId: null,
    referrerMessage: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    attachments: [],
    attachmentCount: 0,
    queueStatus: null,
    ...overrides,
  };
}

function renderSeekerConversation(request: ThreadRequest) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    request,
    failure: "",
    loading: false,
    onReload: vi.fn(),
    returnPath: "/requests",
    referrerLabel: "Your referrer",
    referrerName: null,
    messages: [],
    messageError: "",
    referenceId: REFERENCE_ID,
    canMessage: false,
    draft: "",
    setDraft: vi.fn(),
    sending: false,
    onSend: vi.fn(),
    onWithdraw: vi.fn().mockResolvedValue(undefined),
    onProgress: vi.fn().mockResolvedValue(undefined),
    onConfirmReferredEmail: vi.fn().mockResolvedValue(undefined),
  };
  return render(
    <QueryClientProvider client={client}>
      <SeekerConversation {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 4 } }) })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CONV-report-entry: Seeker conversation Report or block link (D-278)", () => {
  it("C1: Seeker, accepted ask (approved, referrerId 5502) carries /report?request=731", () => {
    const request = makeRequest({ status: "approved", referrerId: REFERRER_ID });
    renderSeekerConversation(request);
    const link = screen.getByRole("link", { name: "Report or block" });
    expect(link.getAttribute("href")).toBe(`/report?request=${REQUEST_ID}`);
  });

  it("C1b: Seeker, a second post-approval status (intro_made, referrerId 5502) carries /report?request=731", () => {
    const request = makeRequest({ status: "intro_made", referrerId: REFERRER_ID });
    renderSeekerConversation(request);
    const link = screen.getByRole("link", { name: "Report or block" });
    expect(link.getAttribute("href")).toBe(`/report?request=${REQUEST_ID}`);
  });

  it("C2: Seeker, unassigned / waiting (pending, referrerId null) stays bare /report", () => {
    const request = makeRequest({ status: "pending", referrerId: null });
    renderSeekerConversation(request);
    const link = screen.getByRole("link", { name: "Report or block" });
    expect(link.getAttribute("href")).toBe("/report");
  });

  it("C3: Seeker, pre-approval status with non-null referrerId 5502 (allocated / claimed-not-accepted) stays bare /report", () => {
    const request = makeRequest({ status: "pending", referrerId: REFERRER_ID });
    renderSeekerConversation(request);
    const link = screen.getByRole("link", { name: "Report or block" });
    expect(link.getAttribute("href")).toBe("/report");
  });

  it("C4: Seeker, pass / step-back / lapse (referrerId null after server cleared it) stays bare /report", () => {
    const request = makeRequest({ status: "closed", referrerId: null });
    renderSeekerConversation(request);
    const link = screen.getByRole("link", { name: "Report or block" });
    expect(link.getAttribute("href")).toBe("/report");
  });

  it("C5: In every case href matches ^/report(\\?request=731)?$ and never contains 5502, 6603, or ACME-9917", () => {
    const cases: ThreadRequest[] = [
      makeRequest({ status: "approved", referrerId: REFERRER_ID }),
      makeRequest({ status: "intro_made", referrerId: REFERRER_ID }),
      makeRequest({ status: "interview", referrerId: REFERRER_ID }),
      makeRequest({ status: "pending", referrerId: null }),
      makeRequest({ status: "pending", referrerId: REFERRER_ID }),
      makeRequest({ status: "closed", referrerId: null }),
      makeRequest({ status: "declined", referrerId: null }),
      makeRequest({ status: "withdrawn", referrerId: null }),
    ];

    for (const req of cases) {
      cleanup();
      renderSeekerConversation(req);
      const link = screen.getByRole("link", { name: "Report or block" });
      const href = link.getAttribute("href") || "";
      expect(href).toMatch(/^\/report(\?request=731)?$/);
      expect(href).not.toContain(String(REFERRER_ID));
      expect(href).not.toContain(String(VIEWER_ID));
      expect(href).not.toContain(REFERENCE_ID);
    }
  });
});
