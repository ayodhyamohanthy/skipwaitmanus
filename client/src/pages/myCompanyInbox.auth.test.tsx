// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyCompanyInbox from "./MyCompanyInbox";

const { go, authState, search } = vi.hoisted(() => ({ go: vi.fn(), authState: { signedIn: false }, search: { value: "" } }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.signedIn, getToken: vi.fn().mockResolvedValue("test-token") }),
  useUser: () => ({ user: authState.signedIn ? { emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] } : undefined }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/queue", go],
  useSearch: () => search.value,
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

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

  it("heads each card with the ask's function and the company name (kit 'PRODUCT · WIPRO')", async () => {
    authState.signedIn = true;
    const row = (id: number, jobFunction: string | null) => ({ id, companyDomain: "wipro.com", companyName: "Wipro", companyInitials: "W", jobFunction, status: "pending", targetRoleUrl: null, attachmentCount: 1, savedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", isClaimedByYou: false });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ requests: url.includes("scope=new") ? [row(1, "Product"), row(2, null), row(3, "Astrology")] : [] }) })));
    render(<MyCompanyInbox />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
    expect(screen.getAllByRole("article").map(card => card.querySelector(".eyebrow")?.textContent)).toEqual(["Product · Wipro", "Wipro", "Wipro"]);
  });

  it("lists routed new requests, then saved ones, as kit cards without scope tabs or a pager", async () => {
    authState.signedIn = true;
    const row = (id: number, savedAt: string | null = null) => ({ id, companyDomain: "acme.com", status: "pending", targetRoleUrl: `https://careers.acme.com/jobs/${id}`, attachmentCount: 1, savedAt, createdAt: "2026-01-01", updatedAt: "2026-01-01", isClaimedByYou: false });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ requests: url.includes("scope=saved") ? [row(3, "2026-01-02"), row(1)] : url.includes("scope=new") ? [row(1), row(2)] : [] }) })));
    render(<MyCompanyInbox />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
    expect(screen.getAllByRole("article").map(card => card.getAttribute("aria-label"))).toEqual(["Private request Ref-1001", "Private request Ref-1002", "Private request Ref-1003"]);
    expect(screen.queryByRole("tablist", { name: "Company inbox views" })).toBeNull();
    expect(screen.queryByLabelText("Request navigation")).toBeNull();
    // Kit card: "Requested" pill, Pass privately + Open request, no raw role URL or detail paragraph.
    expect(screen.getAllByText("Requested")).toHaveLength(3);
    expect(document.querySelector(".status-requested")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Pass privately" })).toHaveLength(3);
    expect(screen.queryByText("https://careers.acme.com/jobs/1")).toBeNull();
    expect(screen.queryByText(/Review the candidate’s note/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Save for later/ })).toBeNull();
  });

  it("passes privately with one confirmed reason, then moves on to the next request", async () => {
    authState.signedIn = true;
    let decided = false;
    const row = (id: number) => ({ id, companyDomain: "acme.com", status: "pending", targetRoleUrl: null, attachmentCount: 1, savedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", isClaimedByYou: false });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("one-click-review")) { decided = true; return { ok: true, json: async () => ({ status: "declined", declineReason: "timing" }) }; }
      return { ok: true, json: async () => ({ requests: url.includes("scope=new") ? (decided ? [row(8)] : [row(7), row(8)]) : [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyCompanyInbox />);
    const [first] = await screen.findAllByRole("button", { name: "Pass privately" });
    fireEvent.click(first);
    const group = screen.getByRole("group", { name: "Pass privately" });
    expect(screen.queryByRole("button", { name: "Confirm pass" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(group.textContent).toContain("Pass as “Not now”?");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("one-click-review"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm pass" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/7/one-click-review", expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "timing" }) })));
    expect(await screen.findByText(/Passed privately/)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("article").map(card => card.getAttribute("aria-label"))).toEqual(["Private request Ref-1008"]));
  });

  it("opens the request named in ?request= straight into its preview", async () => {
    authState.signedIn = true;
    search.value = "request=7";
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/7/preview") ? { request: { id: 7, candidateName: null, candidateMessage: "Happy to share more.", companyDomain: "acme.com", targetRoleUrl: null, attachments: [] } } : { requests: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MyCompanyInbox />);
    expect(await screen.findByText("Happy to share more.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/7/preview", expect.anything());
  });

  it("shows the matching candidate note, role link, and resume before direct acceptance or a concise one-click decline", async () => {
    authState.signedIn = true;
    const inboxRequest = { id: 7, companyDomain: "acme.com", status: "pending", targetRoleUrl: "https://careers.acme.com/jobs/design", attachmentCount: 1, savedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", isClaimedByYou: false };
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/preview") ? { request: { id: 7, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: inboxRequest.targetRoleUrl, attachments: [{ id: 4, fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 42, url: "https://signed.example/avery-resume.pdf" }] } } : url.includes("one-click-review") ? { status: "approved" } : { requests: [inboxRequest] } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MyCompanyInbox />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open request" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Open request" }));
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

  it("keeps decided requests out of the queue and hands an acceptance straight to the conversation", async () => {
    authState.signedIn = true;
    let accepted = false;
    const inboxRequest = { id: 11, companyDomain: "acme.com", status: "pending", targetRoleUrl: null, attachmentCount: 1, savedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-02", isClaimedByYou: false };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/preview")) return { ok: true, json: async () => ({ request: { id: 11, candidateName: "Avery", candidateMessage: "Note", companyDomain: "acme.com", targetRoleUrl: null, attachments: [{ id: 1, fileName: "cv.pdf", mimeType: "text/plain", fileSize: 1, url: "/api/files/1" }] } }) };
      if (url.includes("one-click-review")) { accepted = true; return { ok: true, json: async () => ({ status: "approved" }) }; }
      return { ok: true, json: async () => ({ requests: url.includes("scope=new") && !accepted ? [inboxRequest] : [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Open request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Accept & submit referral" }));
    expect(await screen.findByText("Referral accepted. You can now message the Job Seeker privately.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("scope=completed"))).toBe(false);
    expect(screen.queryByRole("tab", { name: "Done" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open conversation" }));
    expect(go).toHaveBeenCalledWith("/conversation/11?from=inbox");
  });
});
