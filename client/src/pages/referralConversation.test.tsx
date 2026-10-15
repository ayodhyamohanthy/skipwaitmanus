// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReferralConversation from "./ReferralConversation";

const { authState, userState, go } = vi.hoisted(() => ({
  authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") },
  userState: { user: { fullName: "Rahul K." as string | null } },
  go: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, useUser: () => userState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/trpc", () => ({ trpc: { profile: { mine: { useQuery: () => ({ data: undefined }) } } } }));
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

  it("names the company from the server directory fields on the thread", async () => {
    stubFetch(() => ok({ requests: [{ ...seekerPending, companyDomain: "goneutrinos.com", companyName: "Go Neutrinos", companyInitials: "GN" }] }));
    render(<ReferralConversation />);
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(screen.getByText(/Waiting for a verified Go Neutrinos referrer/)).toBeTruthy();
    expect(document.querySelector("header .company-mark")?.textContent).toBe("GN");
    expect(screen.queryByText(/goneutrinos\.com/)).toBeNull();
  });

  it("leads the eyebrow with the ask's job function, for the seeker and the reviewing referrer", async () => {
    stubFetch(() => ok({ requests: [{ ...seekerPending, companyName: "Wipro", companyInitials: "W", jobFunction: "Design" }] }));
    render(<ReferralConversation />);
    await screen.findByText("Product Designer");
    expect(document.querySelector("header .eyebrow")?.textContent).toBe("Design · Wipro");
    cleanup();
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [] }) : url.endsWith("/601/preview") ? ok({ request: { ...referrerPreview, companyName: "Wipro", companyInitials: "W", jobFunction: "Data" } }) : ok({ messages: [] })));
    render(<ReferralConversation />);
    await screen.findByText("Product Designer");
    expect(document.querySelector("header .eyebrow")?.textContent).toBe("Data · Wipro");
  });

  it("shows the company alone when the ask has no known function", async () => {
    stubFetch(() => ok({ requests: [{ ...seekerPending, companyName: "Wipro", companyInitials: "W", jobFunction: "Astrology" }] }));
    render(<ReferralConversation />);
    await screen.findByText("Product Designer");
    expect(document.querySelector("header .eyebrow")?.textContent).toBe("Wipro");
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
    // Seeker identity stays hidden pre-accept even though the preview payload carries a name.
    expect(screen.getByText("Seeker · identity hidden")).toBeTruthy();
    expect(screen.queryByText(/Asha R\./)).toBeNull();
    expect(screen.getByText(/Resume and profile shared after acceptance/)).toBeTruthy();
    // No referrer question primitive exists, so the kit's "Ask one question" is not offered.
    expect(screen.queryByRole("button", { name: /Ask one question/ })).toBeNull();

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
      expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "timing", passReason: "at_capacity" }) }),
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
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText("Thank you — what should I prepare next?")).toBeTruthy());
  });

  it("gives the accepted seeker only the coordinate note; progress opens once referred (kit v4)", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [seekerApproved] }) : ok({ messages: [] })));
    render(<ReferralConversation />);
    expect(await screen.findByText(/Use messages to coordinate/)).toBeTruthy();
    expect(screen.queryByText("Update your progress")).toBeNull();
    expect(screen.queryByRole("button", { name: "Interviewing" })).toBeNull();
  });

  it("lets the referred seeker record the next factual progress milestone", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/progress")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ status: "interview" });
        return ok({ progress: { status: "interview", changed: true } });
      }
      if (url.endsWith("/mine")) return ok({ requests: [{ ...seekerApproved, status: "intro_made" }] });
      return ok({ messages: [] });
    });
    stubFetch(fetchMock);
    render(<ReferralConversation />);
    expect(await screen.findByText("Update your progress")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Interviewing" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/601/progress", expect.objectContaining({ method: "POST" })));
  });

  it("reveals the referrer's name and title to the seeker only after accept", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerApproved, status: "approved", referrerId: 9, referrerName: "Priya Nair", referrerTitle: "Staff Designer" }] }) : ok({ messages: [] })));
    render(<ReferralConversation />);
    expect(await screen.findByText("Priya Nair · Staff Designer")).toBeTruthy();
  });

  it("keeps the referrer anonymous to the seeker while the ask is pending", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerPending, referrerName: "Priya Nair" }] }) : ok({ messages: [] })));
    render(<ReferralConversation />);
    expect(await screen.findByText(/Someone at/)).toBeTruthy();
    expect(screen.queryByText(/Priya Nair/)).toBeNull();
  });

  it("shows the referred seeker the reference ID the referrer recorded", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerApproved, status: "intro_made" }] }) : ok({ messages: [], referenceId: "TC-4410" })));
    render(<ReferralConversation />);
    expect(await screen.findByText("Referred! Reference ID TC-4410")).toBeTruthy();
  });

  it("shows the seeker the kit's kind pass note, never the raw decline text", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerApproved, status: "declined", referrerMessage: "I do not think this role is the right fit for my referral." }] }) : ok({ messages: [] })));
    render(<ReferralConversation />);
    expect(await screen.findByText("This referrer passed.")).toBeTruthy();
    expect(screen.getByText("It's not a judgment of you. Your slot is open again — try another verified referrer at acme.com.")).toBeTruthy();
    expect(screen.queryByText(/right fit for my referral/)).toBeNull();
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

  it("sends the optional portal reference ID with Mark as referred", async () => {
    const bodies: unknown[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/progress")) { bodies.push(JSON.parse(String(init?.body))); return ok({ progress: { status: "intro_made", changed: true } }); }
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "claimed");
      return ok({ request: { ...referrerPreview, status: "approved", referrerId: 9, candidateName: "Asha R.", attachments: [] } });
    });
    stubFetch(fetchMock);
    render(<ReferralConversation />);
    expect(await screen.findByText("Submit through your company.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Mark as referred/ }));
    expect(await screen.findByText(/Optional: add your portal/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Reference ID/), { target: { value: " TC-4410 " } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm/ }));
    await waitFor(() => expect(bodies).toEqual([{ status: "intro_made", referenceId: "TC-4410" }]));
  });
  it("shows a retryable error when the network fails, then recovers", async () => {
    let attempts = 0;
    stubFetch(async (url: string) => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("Failed to fetch");
      if (url.endsWith("/mine")) return ok({ requests: [seekerPending] });
      return fail(404, "gone");
    });
    render(<ReferralConversation />);
    expect(await screen.findByText("This thread isn't available.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't reach SkipWait/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Nothing to do yet.")).toBeTruthy();
  });

  it("treats an unclaimed closed ask as expired, never hired, with no composer", async () => {
    stubFetch(async (url: string) => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerPending, status: "closed", referrerId: null }] }) : fail(404, "gone")));
    render(<ReferralConversation />);
    expect(await screen.findByText("This request expired.")).toBeTruthy();
    expect(screen.queryByText("Hired. Congratulations.")).toBeNull();
    expect(screen.getByRole("link", { name: /Find another referrer/ }).getAttribute("href")).toBe("/explore");
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  it("hides withdraw once a verified employee has claimed the pending ask", async () => {
    stubFetch(async (url: string) => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerPending, referrerId: 77 }] }) : fail(404, "gone")));
    render(<ReferralConversation />);
    expect(await screen.findByText("Nothing to do yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Withdraw request/ })).toBeNull();
    expect(screen.getByText(/is reviewing your request/)).toBeTruthy();
  });

  it("reveals the candidate and resume only to the referrer who accepted", async () => {
    stubFetch(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "claimed");
      if (url.endsWith("/conversation")) return ok({ messages: [] });
      return ok({ request: { ...referrerPreview, status: "intro_made", referrerId: 9, attachments: [{ id: 31, fileName: "Resume.pdf", url: "/api/documents/31" }] } });
    });
    render(<ReferralConversation />);
    expect(await screen.findByText("Asha R.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Resume.pdf/ }).getAttribute("href")).toBe("/api/documents/31");
    expect(screen.getByText("Rahul K.")).toBeTruthy();
    expect(screen.getByText("Referral submitted")).toBeTruthy();
    expect(screen.getByLabelText("Message")).toBeTruthy();
  });

  it("shows an accepted referrer the seeker's note from the thread detail alone, naming a file whose access ended without linking it", async () => {
    stubFetch(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "accepted");
      if (url.endsWith("/conversation")) return ok({ messages: [] });
      return ok({ request: { id: 601, title: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", status: "approved", referrerId: 9, candidateName: "Asha R.", candidateMessage: "I have led two end-to-end redesigns.", attachments: [{ id: 31, fileName: "Asha_R_Resume.pdf", mimeType: "application/pdf", fileSize: 10, url: null }] } });
    });
    render(<ReferralConversation />);
    expect(await screen.findByText("Asha R.")).toBeTruthy();
    expect(screen.getByText(/I have led two end-to-end redesigns\./)).toBeTruthy();
    expect(screen.getByText("Asha_R_Resume.pdf")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Asha_R_Resume/ })).toBeNull();
  });

  it("keeps a claimed but not yet accepted ask anonymous while counting its locked files", async () => {
    stubFetch(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "claimed");
      return ok({ request: { id: 601, title: "Product Designer", targetRoleUrl: null, companyDomain: "acme.com", status: "pending", referrerId: 9, candidateMessage: "I have led two end-to-end redesigns.", attachments: [{ id: 31, mimeType: "application/pdf", fileSize: 10, availability: "after_claim" }] } });
    });
    render(<ReferralConversation />);
    expect(await screen.findByText("Seeker · identity hidden")).toBeTruthy();
    expect(screen.getByText(/I have led two end-to-end redesigns\./)).toBeTruthy();
    expect(screen.getByText("Resume and profile shared after acceptance")).toBeTruthy();
    expect(screen.queryByText("This thread isn't available.")).toBeNull();
  });

  it("keeps the accept dialog open with the server error when accepting fails", async () => {
    stubFetch(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return ok({ request: referrerPreview });
      if (url.includes("/one-click-review")) return fail(409, "Another verified employee already accepted this request");
      return fail(404, "gone");
    });
    render(<ReferralConversation />);
    fireEvent.click(await screen.findByRole("button", { name: /Accept & connect/ }));
    fireEvent.click(screen.getByLabelText(/I'll refer only through/));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Another verified employee already accepted this request")).toBeTruthy();
  });

  it("surfaces a failed message send without losing the draft", async () => {
    stubFetch(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return fail(403, "We could not send this private message");
      if (url.endsWith("/mine")) return ok({ requests: [seekerApproved] });
      return ok({ messages: [] });
    });
    render(<ReferralConversation />);
    const composer = await screen.findByLabelText("Message");
    fireEvent.change(composer, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("We could not send this private message")).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("Hello");
  });
});
