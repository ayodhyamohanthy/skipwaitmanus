// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReferralConversation from "./ReferralConversation";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/conversation/601", go],
  useRoute: () => [true, { requestId: "601" }],
}));

beforeEach(() => {
  authState.isSignedIn = true;
  authState.getToken = vi.fn().mockResolvedValue("test-token");
  go.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const seekerPending = { id: 601, title: "Product Designer", pitch: "I have led two end-to-end redesigns.", targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", status: "pending", referrerId: null, queueStatus: null, referrerMessage: null, unreadMessageCount: 0, createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", attachmentCount: 0 };
const seekerApproved = { ...seekerPending, status: "approved", referrerId: 77 };
const referrerPreview = { id: 601, title: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", candidateName: "Asha R.", candidateMessage: "I have led two end-to-end redesigns.", status: "pending", attachments: [] };

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}
const ok = (json: unknown) => ({ ok: true, json: async () => json });
const fail = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });

describe("ReferralConversation thread", () => {
  it("keeps the thread behind sign-in", () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReferralConversation />);
    expect(screen.getByText("Continue securely.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Secure sign in" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the seeker their ask with waiting state and a working withdraw", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/withdraw")) return ok({ withdrawn: true, requestId: 601, status: "withdrawn" });
      return ok({ requests: [seekerPending] });
    });
    stubFetch(fetchMock);
    render(<ReferralConversation />);
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(screen.getByText(/I have led two end-to-end redesigns/)).toBeTruthy();
    expect(screen.getByText(/Waiting for a verified acme.com referrer/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Withdraw request/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/601/withdraw", expect.objectContaining({ method: "POST" })));
  });

  it("gives the referrer accept and pass decisions backed by one-click review", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/one-click-review")) {
        const body = JSON.parse(String(init?.body));
        if (body.decision === "approved") return ok({ status: "approved", companyDomain: "acme.com" });
        expect(body).toEqual({ decision: "declined", declineReason: "timing" });
        return ok({ status: "passed", companyDomain: "acme.com", declineReason: "timing" });
      }
      if (String(url).endsWith("/mine")) return ok({ requests: [] });
      if (String(url).endsWith("/preview")) return ok({ request: referrerPreview });
      return fail(404, "This private request is not assigned to your verified employee account");
    });
    stubFetch(fetchMock);
    render(<ReferralConversation />);
    expect(await screen.findByText("Would you refer this person?")).toBeTruthy();
    // Seeker identity stays hidden pre-accept (ask bubble + counterpart card).
    expect(screen.getAllByText("Seeker · identity hidden").length).toBe(2);
    expect(screen.getByText(/Resume and profile shared after acceptance/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Accept & connect/ }));
    const acceptButton = await screen.findByRole("button", { name: "Accept" });
    expect(acceptButton.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText(/I'll refer only through/));
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/601/one-click-review", expect.objectContaining({ method: "POST" })));
  });

  it("passes privately with the chosen reason and never reveals identity", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/mine")) return ok({ requests: [] });
      if (String(url).endsWith("/preview")) return ok({ request: referrerPreview });
      if (String(url).includes("/one-click-review")) return ok({ status: "passed", companyDomain: "acme.com" });
      return fail(404, "gone");
    });
    stubFetch(fetchMock);
    render(<ReferralConversation />);
    expect(await screen.findByText("Would you refer this person?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Pass privately/ }));
    fireEvent.click(await screen.findByLabelText("At capacity right now"));
    fireEvent.click(screen.getByRole("button", { name: /^Pass$/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/company-referrals/601/one-click-review",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "timing" }) }),
    ));
    expect(await screen.findByText("You passed privately.")).toBeTruthy();
  });

  it("renders the approved conversation and sends a message through the request-scoped endpoint", async () => {
    let messageCount = 1;
    stubFetch(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        expect(url).toBe("/api/company-referrals/601/conversation");
        expect(JSON.parse(String(init.body))).toEqual({ body: "Thank you — what should I prepare next?" });
        messageCount = 2;
        return ok({ message: { id: 2 } });
      }
      if (url.endsWith("/mine")) return ok({ requests: [seekerApproved] });
      return ok({ messages: messageCount === 1 ? [{ id: 1, body: "I accepted your referral request.", createdAt: "2026-08-19T09:00:00.000Z", isMine: false }] : [{ id: 1, body: "I accepted your referral request.", createdAt: "2026-08-19T09:00:00.000Z", isMine: false }, { id: 2, body: "Thank you — what should I prepare next?", createdAt: "2026-08-19T09:01:00.000Z", isMine: true }] });
    });
    render(<ReferralConversation />);
    await waitFor(() => expect(screen.getByText("I accepted your referral request.")).toBeTruthy());
    // The referrer's name is never exposed to the seeker.
    expect(screen.getByText("Someone at acme.com")).toBeTruthy();
    const composer = screen.getByLabelText("Message");
    fireEvent.change(composer, { target: { value: "Thank you — what should I prepare next?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByText("Thank you — what should I prepare next?")).toBeTruthy());
  });

  it("lets the seeker record the next factual progress milestone", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/progress")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ status: "interview" });
        return ok({ progress: { status: "interview", changed: true } });
      }
      if (url.endsWith("/mine")) return ok({ requests: [seekerApproved] });
      return ok({ messages: [] });
    });
    stubFetch(fetchMock);
    render(<ReferralConversation />);
    expect(await screen.findByText("Update your progress")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Interviewing" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/601/progress", expect.objectContaining({ method: "POST" })));
  });

  it("marks the referral submitted through the referrer's Mark as referred", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/progress")) {
        expect(JSON.parse(String(init?.body))).toEqual({ status: "intro_made" });
        return ok({ progress: { status: "intro_made", changed: true } });
      }
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "claimed");
      return ok({ request: { ...referrerPreview, status: "approved", referrerId: 9, candidateName: "Asha R.", attachments: [] } });
    });
    stubFetch(fetchMock);
    render(<ReferralConversation />);
    expect(await screen.findByText("Submit through your company.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Mark as referred/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirm/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/601/progress", expect.objectContaining({ method: "POST" })));
  });
});
