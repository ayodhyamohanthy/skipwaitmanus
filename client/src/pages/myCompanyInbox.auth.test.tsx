// @vitest-environment jsdom
// The queue's access and flow intents, on the goal surface (D-048 phase 3): the
// work-email-only sign-in route, the empty queue's one capacity action, the
// function and company vocabulary, new-then-saved order, pass and accept, the
// ?request= deep link, and the privacy line before acceptance.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyCompanyInbox from "./MyCompanyInbox";

const { go, authState, search } = vi.hoisted(() => ({ go: vi.fn(), authState: { signedIn: false }, search: { value: "" } }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.signedIn, isLoaded: true, getToken: vi.fn().mockResolvedValue("test-token") }),
  useUser: () => ({ user: authState.signedIn ? { emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] } : undefined }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/queue", go],
  useSearch: () => search.value,
}));
// The verified-referrer gate itself is covered in myCompanyInbox.serverAccess.test.tsx; these cases start verified.
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "verified", access: { verified: true, domain: "acme.com", companyName: null, companyInitials: null } }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const inboxRow = (id: number, extra: Record<string, unknown> = {}) => ({ id, companyDomain: "acme.com", status: "pending", targetRoleUrl: `https://careers.acme.com/jobs/design-${id}`, attachmentCount: 1, savedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", isClaimedByYou: false, unreadMessageCount: 0, ...extra });

beforeEach(() => { authState.signedIn = false; search.value = ""; });
afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

describe("My Company Inbox employee access", () => {
  it("routes signed-out employees to the dedicated work-email-only sign-in flow", () => {
    render(<MyCompanyInbox />);
    expect(screen.getByRole("button", { name: "Use company email" })).toBeTruthy();
    expect(screen.queryByText("Secure employee sign in")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use company email" }));
    // ?setup=work-email opens the work-email OTP dialog on the referrer workspace directly.
    expect(go).toHaveBeenCalledWith("/referrer?setup=work-email");
  });

  it("gives a verified employee a one-tap private capacity action when the queue is empty", async () => {
    authState.signedIn = true;
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("availability/open") ? { availability: { allocatedCount: 1 } } : { requests: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Open referral capacity" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/availability/open", expect.objectContaining({ method: "POST", body: JSON.stringify({ slotCount: 1 }) })));
    expect(await screen.findByText("1 waiting request is now available for your review.")).toBeTruthy();
    expect(screen.queryByText("No new requests.")).toBeNull();
  });

  it("labels each row with the role from its job link and its function, and the detail with function · company", async () => {
    authState.signedIn = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes("/preview")
        ? { request: { id: 1, candidateName: null, candidateMessage: "A note.", companyDomain: "wipro.com", targetRoleUrl: "https://wipro.com/careers/senior-product-manager", attachments: [] } }
        : { requests: url.includes("scope=new") ? [inboxRow(1, { companyName: "Wipro", jobFunction: "Product", targetRoleUrl: "https://wipro.com/careers/senior-product-manager" })] : [] },
    })));
    render(<MyCompanyInbox />);
    const row = await screen.findByRole("button", { name: /Senior Product Manager/ });
    expect(row.textContent).toContain("Product");
    fireEvent.click(row);
    // The comp's eyebrow: job function, then the company.
    expect(await screen.findByText("Product · Wipro")).toBeTruthy();
  });

  it("lists routed new requests, then saved ones, without scope tabs or a pager", async () => {
    authState.signedIn = true;
    const titled = (id: number, slug: string, extra: Record<string, unknown> = {}) => inboxRow(id, { targetRoleUrl: `https://careers.acme.com/careers/${slug}`, ...extra });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ requests: url.includes("scope=saved") ? [titled(3, "site-reliability-engineer", { savedAt: "2026-01-02T00:00:00.000Z" }), titled(1, "senior-data-analyst")] : [titled(1, "senior-data-analyst"), titled(2, "android-engineer")] }),
    })));
    render(<MyCompanyInbox />);
    await waitFor(() => expect(screen.getAllByTestId("goal-list-row")).toHaveLength(3));
    // New first, then saved; ask 1 appears once even though it came in both scopes.
    expect(screen.getAllByTestId("goal-list-row").map(row => row.textContent)).toEqual([
      expect.stringContaining("Senior Data Analyst"),
      expect.stringContaining("Android Engineer"),
      expect.stringContaining("Site Reliability Engineer"),
    ]);
    expect(screen.queryByRole("tablist", { name: "Company inbox views" })).toBeNull();
    expect(screen.queryByLabelText("Request navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: /Save for later/ })).toBeNull();
  });

  it("passes privately with one confirmed reason, then moves on to the next request", async () => {
    authState.signedIn = true;
    let decided = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("one-click-review")) { decided = true; return { ok: true, json: async () => ({ status: "declined", declineReason: "timing" }) }; }
      if (url.includes("/preview")) return { ok: true, json: async () => ({ request: { id: 7, candidateName: null, candidateMessage: "A note.", companyDomain: "acme.com", targetRoleUrl: null, attachments: [] } }) };
      return { ok: true, json: async () => ({ requests: url.includes("scope=new") ? (decided ? [inboxRow(8, { targetRoleUrl: "https://careers.acme.com/careers/android-engineer" })] : [inboxRow(7, { targetRoleUrl: "https://careers.acme.com/careers/senior-data-analyst" }), inboxRow(8, { targetRoleUrl: "https://careers.acme.com/careers/android-engineer" })]) : [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /Senior Data Analyst/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Pass privately/ }));
    const group = screen.getByRole("radiogroup");
    // D-052: the shared reason list, and nothing picked until the referrer picks.
    expect(within(group).getAllByRole("radio").map(radio => radio.textContent?.replace(/\d$/, ""))).toEqual(["Not my team or function", "Role needs more experience", "Not enough context", "At capacity right now", "Role is closed", "I only refer people I know", "Prefer not to say"]);
    expect(within(group).queryAllByRole("radio", { checked: true })).toHaveLength(0);
    fireEvent.click(within(group).getByRole("radio", { name: /At capacity right now/ }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("one-click-review"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Pass" }));
    // The picked code plus the legacy reason the server routes on.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/7/one-click-review", expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "timing", passReason: "at_capacity" }) })));
    expect(await screen.findByText(/Passed privately/)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId("goal-list-row")).toHaveLength(1));
  });

  it("opens the request named in ?request= straight into its ask", async () => {
    authState.signedIn = true;
    search.value = "request=7";
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/7/preview") ? { request: { id: 7, candidateName: null, candidateMessage: "Happy to share more.", companyDomain: "acme.com", targetRoleUrl: null, attachments: [] } } : { requests: [inboxRow(7)] } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MyCompanyInbox />);
    expect(await screen.findByText("Happy to share more.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/7/preview", expect.anything());
  });

  it("shows the note and role link but never the seeker's name or resume file before acceptance", async () => {
    authState.signedIn = true;
    const inboxRequest = inboxRow(7, { targetRoleUrl: "https://careers.acme.com/jobs/design" });
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes("/preview")
        ? { request: { id: 7, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: inboxRequest.targetRoleUrl, attachments: [{ id: 4, fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 42, url: "https://signed.example/avery-resume.pdf" }] } }
        : url.includes("one-click-review") ? { status: "approved" } : { requests: [inboxRequest] },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /Referral request/ }));
    expect(await screen.findByText("I led a measurable product design launch.")).toBeTruthy();
    // D-019(e): before acceptance the ask stays anonymous even if a payload carried the name, file name or a link.
    expect(screen.queryByText(/Avery/)).toBeNull();
    expect(screen.queryByText(/avery-resume/)).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector('a[href*="avery-resume"]')).toBeNull();
    expect(screen.getByTestId("goal-locked-panel").textContent).toContain("1");
    fireEvent.click(screen.getByRole("button", { name: /Accept & connect/ }));
    // The server refuses an unconfirmed accept: what sharing means comes first.
    const sheet = await screen.findByTestId("goal-sheet");
    fireEvent.click(within(sheet).getByRole("button", { name: /Accept & connect/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/7/one-click-review", expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "approved", ethicsConfirmed: true }) })));
  });

  it("hands an acceptance to the conversation and keeps decided requests out of the queue", async () => {
    authState.signedIn = true;
    let accepted = false;
    const inboxRequest = inboxRow(11, { updatedAt: "2026-01-02T00:00:00.000Z" });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/preview")) return { ok: true, json: async () => ({ request: { id: 11, candidateName: "Avery", candidateMessage: "Note", companyDomain: "acme.com", targetRoleUrl: null, attachments: [{ id: 1, fileName: "cv.pdf", mimeType: "text/plain", fileSize: 1, url: "/api/files/1" }] } }) };
      if (url.includes("one-click-review")) { accepted = true; return { ok: true, json: async () => ({ status: "approved" }) }; }
      return { ok: true, json: async () => ({ requests: url.includes("scope=new") && !accepted ? [inboxRequest] : [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /Referral request/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Accept & connect/ }));
    fireEvent.click(within(await screen.findByTestId("goal-sheet")).getByRole("button", { name: /Accept & connect/ }));
    expect(await screen.findByText("Request accepted. You can now message the Job Seeker privately.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("scope=completed"))).toBe(false);
    expect(screen.getByRole("link", { name: "Open conversation" }).getAttribute("href")).toBe("/conversation/11?from=inbox");
  });
});
