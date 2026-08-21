// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyCompanyInbox from "./MyCompanyInbox";

const { go, authState } = vi.hoisted(() => ({ go: vi.fn(), authState: { signedIn: false } }));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: authState.signedIn, getToken: vi.fn().mockResolvedValue("test-token") }),
  useUser: () => ({ user: authState.signedIn ? { emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] } : undefined }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/inbox", go],
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

beforeEach(() => { authState.signedIn = false; });
afterEach(() => { cleanup(); go.mockClear(); vi.unstubAllGlobals(); });

describe("My Company Inbox employee access", () => {
  it("routes signed-out employees to the dedicated work-email-only sign-in flow", () => {
    render(<MyCompanyInbox />);
    expect(screen.getByRole("button", { name: "Use company email" })).toBeTruthy();
    expect(screen.queryByText("Secure employee sign in")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use company email" }));
    expect(go).toHaveBeenCalledWith("/referrer");
  });

  it("gives a verified employee a one-tap private capacity action when the New inbox is empty", async () => {
    authState.signedIn = true;
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("availability/open") ? { availability: { allocatedCount: 1 } } : { requests: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MyCompanyInbox />);
    await waitFor(() => expect(document.querySelector('[aria-label="Open referral capacity"]')).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Open referral capacity" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/availability/open", expect.objectContaining({ method: "POST", body: JSON.stringify({ slotCount: 1 }) })));
    expect(await screen.findByText("1 waiting request is now available for your review.")).toBeTruthy();
    expect(screen.queryByText("No new requests.")).toBeNull();
  });

  it("shows the server-filtered New request count and keeps it visible across inbox tabs", async () => {
    authState.signedIn = true;
    const newRequests = [
      { id: 1, companyDomain: "acme.com", status: "pending", targetRoleUrl: "https://careers.acme.com/jobs/one", attachmentCount: 1, savedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", isClaimedByYou: false },
      { id: 2, companyDomain: "acme.com", status: "pending", targetRoleUrl: "https://careers.acme.com/jobs/two", attachmentCount: 1, savedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", isClaimedByYou: false },
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ requests: url.includes("scope=saved") ? [] : newRequests }) })));
    render(<MyCompanyInbox />);
    await waitFor(() => expect(screen.getByLabelText("2 new private requests")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Saved" }));
    await waitFor(() => expect(screen.getByLabelText("2 new private requests")).toBeTruthy());
  });

  it("shows the matching candidate note, role link, and resume before direct acceptance or a concise one-click decline", async () => {
    authState.signedIn = true;
    const inboxRequest = { id: 7, companyDomain: "acme.com", status: "pending", targetRoleUrl: "https://careers.acme.com/jobs/design", attachmentCount: 1, savedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", isClaimedByYou: false };
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/preview") ? { request: { id: 7, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: inboxRequest.targetRoleUrl, attachments: [{ id: 4, fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 42, url: "https://signed.example/avery-resume.pdf" }] } } : url.includes("one-click-review") ? { status: "approved" } : { requests: [inboxRequest] } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MyCompanyInbox />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Review candidate" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Review candidate" }));
    await waitFor(() => expect(screen.getByText("Avery")).toBeTruthy());
    expect(screen.getByText("I led a measurable product design launch.")).toBeTruthy();
    expect(screen.getByText("avery-resume.pdf")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept & submit referral" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not a fit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Can’t support" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept & submit referral" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/7/one-click-review", expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "approved" }) })));
  });

  it("shows a genuine unread conversation cue only for the Referrer's accepted request", async () => {
    authState.signedIn = true;
    const completedRequest = { id: 11, companyDomain: "acme.com", status: "approved", targetRoleUrl: "https://careers.acme.com/jobs/design", attachmentCount: 1, unreadMessageCount: 1, savedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-02", isClaimedByYou: true };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ requests: url.includes("scope=completed") ? [completedRequest] : [] }) })));
    render(<MyCompanyInbox />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "Done" })).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Done" }));
    await waitFor(() => expect(screen.getByText("The Job Seeker sent 1 new private message.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Open conversation · 1 new" })).toBeTruthy();
  });
});
