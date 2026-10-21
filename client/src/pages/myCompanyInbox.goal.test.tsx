// @vitest-environment jsdom
// D-048 phase 3: the referral queue on the goal triage desk. These cases pin the
// surface itself: the comp's list and detail vocabulary, the checks the payload
// proves, and the privacy line the surface may not cross before acceptance.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyCompanyInbox from "./MyCompanyInbox";

const { go } = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, getToken: vi.fn().mockResolvedValue("t") }),
  useUser: () => ({ user: { emailAddresses: [{ emailAddress: "employee@kestrelpay.com", verification: { status: "verified" } }] } }),
}));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/queue", go], useSearch: () => "" }));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "verified", access: { verified: true, domain: "kestrelpay.com", companyName: "Kestrel Pay", companyInitials: "KP" } }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const day = 24 * 60 * 60 * 1000;
// Two whole days plus an hour, so the day-level clock reads "2 days left" whenever the test runs.
const soon = new Date(Date.now() + 2 * day + 3_600_000).toISOString();

const ask = {
  id: 41,
  companyDomain: "kestrelpay.com",
  companyName: "Kestrel Pay",
  companyInitials: "KP",
  jobFunction: "Design",
  targetRoleUrl: "https://kestrelpay.com/careers/product-designer-merchant-onboarding",
  status: "pending",
  savedAt: null,
  createdAt: new Date(Date.now() - day).toISOString(),
  updatedAt: new Date(Date.now() - day).toISOString(),
  attachmentCount: 2,
  isClaimedByYou: false,
  unreadMessageCount: 0,
  expiresAt: soon,
};

const preview = {
  id: 41,
  candidateName: null,
  candidateMessage: "Redesigned KYC onboarding for two million merchants.\nRan 40 merchant interviews in Hindi and Tamil.\nI maintain a 300-component Figma library.",
  companyDomain: "kestrelpay.com",
  targetRoleUrl: "https://kestrelpay.com/careers/product-designer-merchant-onboarding",
  attachments: [
    { fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 1200, availability: "after_claim" },
    { fileName: "portfolio.pdf", mimeType: "application/pdf", fileSize: 900, availability: "after_claim" },
  ],
};

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, status: 200, json: async () => handler(url, init) ?? {} }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

describe("referral queue on the goal triage desk", () => {
  it("draws the comp's list: the waiting count, the verified company, and one row per ask", async () => {
    stubFetch(url => url.includes("scope=new") ? { requests: [ask] } : { requests: [] });
    render(<MyCompanyInbox />);
    expect(await screen.findByText("Verified · Kestrel Pay")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Product Designer Merchant Onboarding/ })).toBeTruthy();
    // The count is the server's waiting asks, in mono, and appears only once the list is in.
    expect(screen.getAllByTestId("goal-num").map(node => node.textContent)).toContain("1");
    expect(screen.getByText("waiting")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
    expect(screen.getByText("2 days left")).toBeTruthy();
    expect(screen.getByText("Referrers are never charged.")).toBeTruthy();
    // Impact is reached from the queue header, never a nav item (D-077(2)).
    expect(screen.getByRole("link", { name: /Impact/ }).getAttribute("href")).toBe("/referrer/impact");
    // The shell is the goal shell and shows no credits pill on a referrer surface (D-055).
    expect(document.querySelector('[data-testid="goal-shell"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="goal-credits-pill"]')).toBeNull();
  });

  it("opens the ask with its own reasons, the checks the payload proves, and a locked document count", async () => {
    stubFetch(url => url.includes("/preview") ? { request: preview } : url.includes("scope=new") ? { requests: [ask] } : { requests: [] });
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /Product Designer Merchant Onboarding/ }));
    expect(await screen.findByText("Redesigned KYC onboarding for two million merchants.")).toBeTruthy();
    // Three reasons, numbered, exactly as the seeker wrote them.
    expect(screen.getByText("Ran 40 merchant interviews in Hindi and Tamil.")).toBeTruthy();
    expect(screen.getByText("I maintain a 300-component Figma library.")).toBeTruthy();
    // Ask quality: only what the payload proves, never a score of the person.
    expect(screen.getByText("Official job link")).toBeTruthy();
    expect(screen.getByText("A note with the ask")).toBeTruthy();
    expect(screen.getByText("Documents attached")).toBeTruthy();
    expect(screen.queryByText(/Ask strength/)).toBeNull();
    expect(screen.queryByText(/Strong/)).toBeNull();
    expect(screen.getByText("Checks on the ask, never a score of the person.")).toBeTruthy();
    // The locked panel counts documents and names neither file (D-019(e)).
    expect(screen.getByTestId("goal-locked-panel").textContent).toContain("2");
    expect(screen.queryByText(/avery-resume|portfolio\.pdf/)).toBeNull();
    expect(screen.queryByText(/Avery/)).toBeNull();
    // One primary action on the screen: Accept & connect.
    expect(screen.getByRole("button", { name: /Accept & connect/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pass privately/ })).toBeTruthy();
  });

  it("keeps the job posting link but never the raw URL as text", async () => {
    stubFetch(url => url.includes("/preview") ? { request: preview } : url.includes("scope=new") ? { requests: [ask] } : { requests: [] });
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /Product Designer Merchant Onboarding/ }));
    const link = await screen.findByRole("link", { name: /kestrelpay\.com\/careers\/product-designer-merchant-onboarding/ });
    expect(link.getAttribute("href")).toBe(preview.targetRoleUrl);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("asks for one confirmation before an accept is sent, and sends ethicsConfirmed with it", async () => {
    const fetchMock = stubFetch(url => url.includes("/preview") ? { request: preview } : url.includes("one-click-review") ? { status: "approved" } : url.includes("scope=new") ? { requests: [ask] } : { requests: [] });
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /Product Designer Merchant Onboarding/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Accept & connect/ }));
    // The server refuses an unconfirmed accept, so the surface states what it shares first.
    const sheet = await screen.findByTestId("goal-sheet");
    expect(sheet.textContent).toContain("shares your name and their name");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("one-click-review"))).toBe(false);
    fireEvent.click(within(sheet).getByRole("button", { name: /Accept & connect/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/41/one-click-review", expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "approved", ethicsConfirmed: true }) })));
    expect(await screen.findByText("Request accepted. You can now message the Job Seeker privately.")).toBeTruthy();
  });

  it("passes with one actively picked reason, never a preselected one", async () => {
    const fetchMock = stubFetch(url => url.includes("/preview") ? { request: preview } : url.includes("one-click-review") ? { status: "declined", declineReason: "timing" } : url.includes("scope=new") ? { requests: [ask] } : { requests: [] });
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /Product Designer Merchant Onboarding/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Pass privately/ }));
    const group = await screen.findByRole("radiogroup");
    expect(within(group).queryAllByRole("radio", { checked: true })).toHaveLength(0);
    const pass = within(document.body).getByRole("button", { name: "Pass" }) as HTMLButtonElement;
    expect(pass.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(within(group).getByRole("radio", { name: /At capacity right now/ }));
    fireEvent.click(within(document.body).getByRole("button", { name: "Pass" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/41/one-click-review", expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "timing", passReason: "at_capacity" }) })));
    expect(await screen.findByText(/Passed privately/)).toBeTruthy();
  });

  it("falls back to the job function when the job link names no role", async () => {
    stubFetch(url => url.includes("scope=new") ? { requests: [{ ...ask, targetRoleUrl: "https://kestrelpay.com/jobs/8f3a91c2" }] } : { requests: [] });
    render(<MyCompanyInbox />);
    expect(await screen.findByRole("button", { name: /Design role/ })).toBeTruthy();
  });
});
