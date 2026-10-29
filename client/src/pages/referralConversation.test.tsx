// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { REFERRED_DEADLINE_ENABLED } from "@shared/referral";
import { DECLINED_LINE, WITHDRAW_CONFIRM_AWAITING, WITHDRAW_CONFIRM_VISIBLE, seekerTerminalLine, withdrawConfirmLine } from "@shared/conversationCopy";
import ReferralConversation from "./ReferralConversation";

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReferralConversation /></QueryClientProvider>);

const { authState, userState, go } = vi.hoisted(() => ({
  authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") },
  userState: { user: { fullName: "Rahul K." as string | null } },
  go: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, useUser: () => userState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
// The signed-in account (auth.me): the referrer goal page compares its id with
// the ask's referrerId so a colleague's pending ask never offers Accept (#831 F1).
const { meState } = vi.hoisted(() => ({ meState: { data: { id: 9 } as { id: number } | undefined } }));
vi.mock("@/lib/trpc", () => ({ trpc: { profile: { mine: { useQuery: () => ({ data: undefined }) } }, auth: { me: { useQuery: () => meState } } } }));
// D-048-p3-conversation: the referrer branch moves to the goal page behind
// goalSurfaceOn("conversation"). Off by default here, exactly like vitest's
// real flag module (no VITE_GOAL_SURFACES), so every kit case below is unchanged.
const { surfaces, referrerAccessOverride } = vi.hoisted(() => ({
  surfaces: { on: new Set<string>() },
  referrerAccessOverride: { value: null as null | { status: "verified"; access: { verified: true; domain: string; companyName: string | null; companyInitials: string | null } } },
}));
vi.mock("@/lib/goalSurfaces", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/goalSurfaces")>()), goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
vi.mock("@/hooks/useReferrerAccess", async importOriginal => {
  const actual = await importOriginal<typeof import("@/hooks/useReferrerAccess")>();
  return { ...actual, useReferrerAccess: () => referrerAccessOverride.value ?? actual.useReferrerAccess() };
});
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/conversation/601", go],
  useRoute: () => [true, { requestId: "601" }],
}));

beforeEach(() => {
  surfaces.on.clear();
  referrerAccessOverride.value = null;
  authState.isSignedIn = true;
  authState.getToken = vi.fn().mockResolvedValue("test-token");
  go.mockReset();
  meState.data = { id: 9 };
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
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Sign in to see this conversation." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText(/stay private to the two people/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names the company from the server directory fields on the thread", async () => {
    stubFetch(() => ok({ requests: [{ ...seekerPending, companyDomain: "goneutrinos.com", companyName: "Go Neutrinos", companyInitials: "GN" }] }));
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Get referred at Go Neutrinos." })).toBeTruthy();
    expect(screen.getByText("Product Designer", { exact: false })).toBeTruthy();
    expect(screen.getByText(/Waiting for a verified Go Neutrinos referrer/)).toBeTruthy();
    expect(screen.queryByText(/goneutrinos\.com/)).toBeNull();
  });

  it("leads the reviewing referrer's eyebrow with the ask's job function", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [] }) : url.endsWith("/601/preview") ? ok({ request: { ...referrerPreview, companyName: "Wipro", companyInitials: "W", jobFunction: "Data" } }) : ok({ messages: [] })));
    renderPage();
    await screen.findByText(/Product Designer/);
    expect(document.querySelector("header .eyebrow")?.textContent).toBe("Data · Wipro");
  });

  it("never names the platform as the company: unknown company falls back to the role title and neutral copy", async () => {
    stubFetch(() => ok({ requests: [{ ...seekerPending, companyDomain: "skipwait.me", title: "Product Designer" }] }));
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Get referred." })).toBeTruthy();
    expect(screen.getByText("Product Designer", { exact: false })).toBeTruthy();
    expect(screen.getByText(/Waiting for a verified referrer at the company\./)).toBeTruthy();
    expect(within(document.querySelector("[data-skipwait-screen]") as HTMLElement).queryByText(/skipwait\.me/)).toBeNull();
  });

  it("shows no referrer line when the accepted referrer has no display name", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerApproved, referrerName: "priya@acme.com" }] }) : ok({ messages: [] })));
    renderPage();
    await screen.findByText(/through acme\.com’s process/);
    expect(screen.queryByText("Your referrer")).toBeNull();
    expect(screen.queryByText(/priya/)).toBeNull();
  });

  it("shows the seeker status row: Waiting word, stepper and the thread's honesty line", async () => {
    stubFetch(() => ok({ requests: [{ ...seekerPending, companyName: "Wipro", companyInitials: "W" }] }));
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Get referred at Wipro." });
    expect(screen.getByTestId("goal-status").textContent).toContain("Waiting");
    expect(screen.getAllByTestId("goal-mini-stepper").length).toBeGreaterThan(0);
    expect(screen.getByText(/A referral is an introduction\. It never promises an interview or a job\. Companies decide hiring\./)).toBeTruthy();
  });

  it("shows the seeker their ask with waiting state and a working withdraw", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/withdraw")) return ok({ withdrawn: true, requestId: 601, status: "withdrawn" });
      return ok({ requests: [seekerPending] });
    });
    stubFetch(fetchMock);
    renderPage();
    expect(await screen.findByText(/Product Designer/)).toBeTruthy();
    expect(screen.getByText(/I have led two end-to-end redesigns/)).toBeTruthy();
    expect(screen.getByText(/Waiting for a verified acme.com referrer/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Withdraw ask/ }));
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
    renderPage();
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
    renderPage();
    expect(await screen.findByText("Would you refer this person?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Pass privately/ }));
    // D-052: no reason is preselected, and Pass stays off until the referrer picks one.
    const reasons = await screen.findAllByRole("radio");
    expect(reasons).toHaveLength(7);
    expect(reasons.filter(radio => (radio as HTMLInputElement).checked)).toHaveLength(0);
    expect((screen.getByRole("button", { name: /^Pass$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Pass$/ }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/one-click-review"))).toBe(false);
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
    renderPage();
    await waitFor(() => expect(screen.getByText("I accepted your referral request.")).toBeTruthy());
    // The referrer's name is never exposed to the seeker.
    expect(screen.getByText("Referrer")).toBeTruthy();
    expect(screen.queryByText(/Someone at/)).toBeNull();
    const composer = screen.getByLabelText("Message");
    fireEvent.change(composer, { target: { value: "Thank you — what should I prepare next?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText("Thank you — what should I prepare next?")).toBeTruthy());
  });

  it("asks the accepted seeker to confirm the referral email only while part B is on; progress opens once referred (kit v4)", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [seekerApproved] }) : ok({ messages: [] })));
    renderPage();
    await screen.findByText("Product Designer", { exact: false });
    // D-038-reconcile R-2: the confirm route answers 409 while part B is off, so no control is offered.
    if (REFERRED_DEADLINE_ENABLED) {
      expect(screen.getByRole("button", { name: "I got the referral email" })).toBeTruthy();
    } else {
      expect(screen.queryByRole("button", { name: "I got the referral email" })).toBeNull();
    }
    expect(screen.queryByRole("button", { name: /Mark Interviewing/ })).toBeNull();
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
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Mark Interviewing" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/601/progress", expect.objectContaining({ method: "POST" })));
  });

  it("reveals the referrer's name and title to the seeker only after accept", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerApproved, status: "approved", referrerId: 9, referrerName: "Priya Nair", referrerTitle: "Staff Designer" }] }) : ok({ messages: [] })));
    renderPage();
    expect(await screen.findByText("Priya Nair · Staff Designer")).toBeTruthy();
  });

  it("keeps the referrer anonymous to the seeker while the ask is pending", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerPending, referrerName: "Priya Nair" }] }) : ok({ messages: [] })));
    renderPage();
    await screen.findByText(/Waiting for a verified/);
    expect(screen.queryByText(/Priya Nair/)).toBeNull();
  });

  it("shows the referred seeker the reference ID the referrer recorded", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerApproved, status: "intro_made" }] }) : ok({ messages: [], referenceId: "TC-4410" })));
    renderPage();
    expect(await screen.findByText("TC-4410")).toBeTruthy();
    expect(screen.getByText(/Reference ID/)).toBeTruthy();
  });

  it("shows the seeker the kit's kind pass note, never the raw decline text", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerApproved, status: "declined", referrerMessage: "I do not think this role is the right fit for my referral." }] }) : ok({ messages: [] })));
    renderPage();
    expect(await screen.findByText(DECLINED_LINE)).toBeTruthy();
    expect(DECLINED_LINE).toBe(seekerTerminalLine("declined", { claimed: true }));
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
    renderPage();
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
    renderPage();
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
      if (url.endsWith("/mine")) { attempts += 1; if (attempts === 1) throw new TypeError("Failed to fetch"); return ok({ requests: [seekerPending] }); }
      return fail(404, "gone");
    });
    renderPage();
    expect(await screen.findByText("This thread isn’t available.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't reach skipwait.me/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Waiting for a verified/)).toBeTruthy();
  });

  it("treats an unclaimed closed ask as expired, never hired, with no composer", async () => {
    stubFetch(async (url: string) => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerPending, status: "closed", referrerId: null }] }) : fail(404, "gone")));
    renderPage();
    expect(await screen.findByText("Nobody could take it. This referral request is closed.")).toBeTruthy();
    expect(screen.queryByText(/7 days/)).toBeNull();
    expect(screen.queryByText(/slot is free/i)).toBeNull();
    expect(screen.queryByText("Hired. Congratulations.")).toBeNull();
    expect(screen.getByRole("link", { name: /Find another referrer/ }).getAttribute("href")).toBe("/explore");
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  it("shows the Hired thank-you link for the specific referrer on a closed ask (ROW20-CD / D-149)", async () => {
    stubFetch(async (url: string) => (
      url.endsWith("/mine")
        ? ok({ requests: [{ ...seekerApproved, status: "closed", referrerId: 9, referrerName: "Priya Nair", referrerTitle: "Staff Designer" }] })
        : ok({ messages: [] })
    ));
    renderPage();
    const link = await screen.findByRole("link", { name: "Thank Priya" });
    expect(link.getAttribute("href")).toBe("/landed?request=601");
  });

  it("hides withdraw once a verified employee has claimed the pending ask", async () => {
    stubFetch(async (url: string) => (url.endsWith("/mine") ? ok({ requests: [{ ...seekerPending, referrerId: 77 }] }) : fail(404, "gone")));
    renderPage();
    expect(await screen.findByText(/is reviewing your request/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Withdraw ask/ })).toBeNull();
  });

  it("denies a pending seeker the message box at the page level, not just the component's prop (packet item 3)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/withdraw")) return ok({ withdrawn: true, requestId: 601, status: "withdrawn" });
      if (String(url).endsWith("/conversation")) return ok({ messages: [{ id: 1, body: "leak", isMine: false, createdAt: "2026-10-20T10:42:00.000Z" }] });
      return ok({ requests: [{ ...seekerPending, referrerId: 77, companyName: "Wipro", companyInitials: "W" }] });
    });
    stubFetch(fetchMock);
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Get referred at Wipro." });
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    // The page never even asks for the messages a pending seeker may not read.
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/conversation"))).toBe(false);
  });

  it("offers Withdraw on a personal-link ask its employee has not acted on, with truthful waiting copy (D-050)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/withdraw")) return ok({ withdrawn: true, requestId: 601, status: "withdrawn" });
      return ok({ requests: [{ ...seekerPending, referrerId: 77, queueStatus: "available_for_review", heldForReferrer: true, createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }] });
    });
    stubFetch(fetchMock);
    renderPage();
    expect(await screen.findByText(/Sent privately/)).toBeTruthy();
    expect(screen.getByText(/Sent privately to the acme\.com employee whose link you used\. Expires in 5 days if they don't respond/)).toBeTruthy();
    expect(screen.queryByText(/is reviewing your request/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Withdraw ask/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/601/withdraw", expect.objectContaining({ method: "POST" })));
  });

  it("offers Withdraw on a delivered ask nobody picked up (unclaimedAssignment), and its dialog uses the shared visible-withdraw line (P0-allocated-ask-stuck)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/withdraw")) return ok({ withdrawn: true, requestId: 601, status: "withdrawn" });
      return ok({ requests: [{ ...seekerPending, referrerId: 77, queueStatus: "available_for_review", heldForReferrer: false, unclaimedAssignment: true }] });
    });
    stubFetch(fetchMock);
    renderPage();
    expect(await screen.findByText(/is reviewing your request/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Withdraw ask/ }));
    expect(await screen.findByText(WITHDRAW_CONFIRM_VISIBLE)).toBeTruthy();
    expect(WITHDRAW_CONFIRM_VISIBLE).toBe(withdrawConfirmLine("available_for_review"));
    expect(screen.queryByText(WITHDRAW_CONFIRM_AWAITING)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/601/withdraw", expect.objectContaining({ method: "POST" })));
  });

  it("gives the referrer who accepted the candidate, the resume and the note the ask was sent with", async () => {
    stubFetch(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "claimed");
      if (url.endsWith("/conversation")) return ok({ messages: [] });
      return ok({ request: { ...referrerPreview, status: "intro_made", referrerId: 9, attachments: [{ id: 31, fileName: "Resume.pdf", url: "/api/documents/31" }] } });
    });
    renderPage();
    expect(await screen.findByText("Asha R.")).toBeTruthy();
    // Opened straight from the claimed detail, with no preview loaded first: the
    // ask's role title and note come from that response alone (D-019(d)).
    expect(screen.getByText("Product Designer")).toBeTruthy();
    expect(screen.getByText(/I have led two end-to-end redesigns/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Resume.pdf/ }).getAttribute("href")).toBe("/api/documents/31");
    expect(screen.getByText("Rahul K.")).toBeTruthy();
    expect(screen.getByText("Referral submitted")).toBeTruthy();
    expect(screen.getByLabelText("Message")).toBeTruthy();
  });

  // D-019(e): a claimed ask stays anonymous until acceptance, and an accepted
  // referrer whose resume access ended is told so instead of getting a dead link.
  it("keeps a claimed but not yet accepted ask anonymous while counting its locked files", async () => {
    stubFetch(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "claimed");
      return ok({ request: { id: 601, title: "Product Designer", targetRoleUrl: null, companyDomain: "acme.com", status: "pending", referrerId: 9, candidateMessage: "I have led two end-to-end redesigns.", attachments: [{ mimeType: "application/pdf", fileSize: 10, availability: "after_claim" }] } });
    });
    renderPage();
    expect(await screen.findByText("Seeker · identity hidden")).toBeTruthy();
    expect(screen.getByText(/I have led two end-to-end redesigns\./)).toBeTruthy();
    expect(screen.getByText("Resume and profile shared after acceptance")).toBeTruthy();
    expect(screen.queryByText("This thread isn't available.")).toBeNull();
  });

  it("names an accepted referrer's file whose access ended, without a dead link, and says so", async () => {
    stubFetch(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "accepted");
      if (url.endsWith("/conversation")) return ok({ messages: [] });
      return ok({ request: { id: 601, title: "Product Designer", targetRoleUrl: null, companyDomain: "acme.com", status: "approved", referrerId: 9, candidateName: "Asha R.", candidateMessage: "I have led two end-to-end redesigns.", attachments: [{ id: 31, fileName: "Asha_R_Resume.pdf", mimeType: "application/pdf", fileSize: 10, url: null }] } });
    });
    renderPage();
    expect(await screen.findByText("Asha R.")).toBeTruthy();
    expect(screen.getByText("Asha_R_Resume.pdf")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Asha_R_Resume/ })).toBeNull();
    expect(screen.getByText("Resume access has ended. Message the Job Seeker here if you still need it.")).toBeTruthy();
  });

  it("links an accepted referrer's file while access is active, with no access-ended line", async () => {
    stubFetch(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "accepted");
      if (url.endsWith("/conversation")) return ok({ messages: [] });
      return ok({ request: { id: 601, title: "Product Designer", targetRoleUrl: null, companyDomain: "acme.com", status: "approved", referrerId: 9, candidateName: "Asha R.", candidateMessage: "Note.", attachments: [{ id: 31, fileName: "Asha_R_Resume.pdf", mimeType: "application/pdf", fileSize: 10, url: "/api/documents/31" }] } });
    });
    renderPage();
    expect((await screen.findByRole("link", { name: /Asha_R_Resume/ })).getAttribute("href")).toBe("/api/documents/31");
    expect(screen.queryByText(/Resume access has ended/)).toBeNull();
  });

  it("keeps the accept dialog open with the server error when accepting fails", async () => {
    stubFetch(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return ok({ request: referrerPreview });
      if (url.includes("/one-click-review")) return fail(409, "Another verified employee already accepted this request");
      return fail(404, "gone");
    });
    renderPage();
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
    renderPage();
    const composer = await screen.findByLabelText("Message");
    fireEvent.change(composer, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("We could not send this private message")).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("Hello");
  });
});

// D-048-p3-conversation (packet docs/plans/D-048-referrer.md §4-§5): the
// referrer's side of /conversation/:requestId on the goal system, behind
// goalSurfaceOn("conversation"). Seeker cases above are untouched.
describe("ReferralConversation referrer goal page (D-048-p3-conversation)", () => {
  const goalOn = () => { surfaces.on.add("conversation"); };
  const pendingFetch = (extra?: (url: string, init?: RequestInit) => unknown) => vi.fn(async (url: string, init?: RequestInit) => {
    const hit = extra?.(String(url), init);
    if (hit) return hit;
    if (String(url).endsWith("/mine")) return ok({ requests: [] });
    if (String(url).endsWith("/preview")) return ok({ request: referrerPreview });
    return fail(404, "gone");
  });
  const acceptedFetch = (status: string, extra?: (url: string, init?: RequestInit) => unknown) => vi.fn(async (url: string, init?: RequestInit) => {
    const hit = extra?.(String(url), init);
    if (hit) return hit;
    if (String(url).endsWith("/mine")) return ok({ requests: [] });
    if (String(url).endsWith("/preview")) return fail(404, "claimed");
    if (String(url).endsWith("/conversation")) return ok({ messages: [{ id: 1, body: "Thanks for accepting.", createdAt: "Wed 2026-08-19 2:30 PM IST (UTC+05:30)", isMine: false }], referenceId: null });
    return ok({ request: { ...referrerPreview, status, referrerId: 9, candidateName: "Asha R.", attachments: [{ id: 31, fileName: "Asha_R_Resume.pdf", url: "/api/documents/31" }] } });
  });

  it("keeps the kit referrer page while the conversation flag is off (flag-off parity)", async () => {
    stubFetch(pendingFetch());
    renderPage();
    expect(await screen.findByText("Would you refer this person?")).toBeTruthy();
    expect(screen.queryByTestId("goal-referrer-conversation")).toBeNull();
  });

  it("renders the pending ask as a goal page: one next step, one black Accept, identity, resume and composer hidden (D-019)", async () => {
    goalOn();
    stubFetch(pendingFetch());
    renderPage();
    const page = await screen.findByTestId("goal-referrer-conversation");
    expect(within(page).getByRole("heading", { level: 1, name: "Would you refer this person?" })).toBeTruthy();
    expect(within(page).getByText(/Product Designer/)).toBeTruthy();
    expect(within(page).getByRole("heading", { name: "Your next step" })).toBeTruthy();
    expect(page.querySelectorAll("[data-g-primary]")).toHaveLength(1);
    expect(within(page).getByRole("button", { name: /Accept & connect/ }).hasAttribute("data-g-primary")).toBe(true);
    expect(within(page).getByText("Seeker · identity hidden")).toBeTruthy();
    expect(within(page).getByText(/I have led two end-to-end redesigns/)).toBeTruthy();
    expect(within(page).getByText("Resume and profile shared after acceptance")).toBeTruthy();
    expect(screen.queryByText(/Asha R\./)).toBeNull();
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.queryByRole("link", { name: /Resume/ })).toBeNull();
  });

  it("accepts only after the official-process attestation, through one-click review", async () => {
    goalOn();
    const fetchMock = pendingFetch(url => (url.includes("/one-click-review") ? ok({ status: "approved", companyDomain: "acme.com" }) : undefined));
    stubFetch(fetchMock);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Accept & connect/ }));
    const group = await screen.findByRole("group", { name: "Accept this request" });
    expect(within(group).getByText(/both see names, and you.ll get the resume/)).toBeTruthy();
    const accept = within(group).getByRole("button", { name: /^Accept/ });
    expect(accept.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(accept);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/one-click-review"))).toBe(false);
    fireEvent.click(within(group).getByLabelText(/refer only through .+ official process/i));
    fireEvent.click(within(group).getByRole("button", { name: /^Accept/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/company-referrals/601/one-click-review",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "approved", ethicsConfirmed: true }) }),
    ));
  });

  it("renders a server refusal of the accept in plain words and keeps the confirm open", async () => {
    goalOn();
    stubFetch(pendingFetch(url => (url.includes("/one-click-review") ? fail(409, "Another verified employee already accepted this request") : undefined)));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Accept & connect/ }));
    const group = await screen.findByRole("group", { name: "Accept this request" });
    fireEvent.click(within(group).getByLabelText(/official process/i));
    fireEvent.click(within(group).getByRole("button", { name: /^Accept/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Another verified employee already accepted this request");
    expect(screen.getByRole("group", { name: "Accept this request" })).toBeTruthy();
  });

  it("passes privately with an actively picked reason and says the identity stayed hidden (D-052)", async () => {
    goalOn();
    const fetchMock = pendingFetch(url => (url.includes("/one-click-review") ? ok({ status: "passed", companyDomain: "acme.com" }) : undefined));
    stubFetch(fetchMock);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Pass privately/ }));
    const reasons = await screen.findAllByRole("radio");
    expect(reasons).toHaveLength(7);
    expect(reasons.filter(radio => radio.getAttribute("aria-checked") === "true")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /^Pass$/ }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/one-click-review"))).toBe(false);
    fireEvent.click(screen.getByRole("radio", { name: /At capacity right now/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Pass$/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/company-referrals/601/one-click-review",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "timing", passReason: "at_capacity" }) }),
    ));
    expect(await screen.findByText(/You passed privately/)).toBeTruthy();
    expect(screen.getByText(/Your identity was never revealed/)).toBeTruthy();
  });

  it("opens names, resume and messages only after acceptance, and marks Referred with the optional reference", async () => {
    goalOn();
    const bodies: unknown[] = [];
    stubFetch(acceptedFetch("approved", (url, init) => {
      if (url.endsWith("/progress")) { bodies.push(JSON.parse(String(init?.body))); return ok({ progress: { status: "intro_made", changed: true } }); }
      return undefined;
    }));
    renderPage();
    const page = await screen.findByTestId("goal-referrer-conversation");
    expect(within(page).getAllByText("Asha R.").length).toBeGreaterThan(0);
    expect(within(page).getByRole("link", { name: /Asha_R_Resume\.pdf/ }).getAttribute("href")).toBe("/api/documents/31");
    expect(await within(page).findByText("Thanks for accepting.")).toBeTruthy();
    expect(within(page).getByLabelText("Message")).toBeTruthy();
    expect(page.querySelectorAll("[data-g-primary]")).toHaveLength(1);
    fireEvent.click(within(page).getByRole("button", { name: /Mark as referred/ }));
    const group = await screen.findByRole("group", { name: "Mark as referred" });
    fireEvent.change(within(group).getByLabelText(/Reference ID/), { target: { value: " TC-4410 " } });
    fireEvent.click(within(group).getByRole("button", { name: /Confirm/ }));
    await waitFor(() => expect(bodies).toEqual([{ status: "intro_made", referenceId: "TC-4410" }]));
  });

  it("sends a message as the accepted referrer and keeps the draft when the server refuses", async () => {
    goalOn();
    stubFetch(acceptedFetch("approved", (url, init) => (init?.method === "POST" && url.endsWith("/conversation") ? fail(403, "We could not send this private message") : undefined)));
    renderPage();
    const composer = await screen.findByLabelText("Message");
    fireEvent.change(composer, { target: { value: "Submitted today." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("We could not send this private message")).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("Submitted today.");
  });

  it("states the referred outcome without promising a hire", async () => {
    goalOn();
    stubFetch(acceptedFetch("intro_made"));
    renderPage();
    const page = await screen.findByTestId("goal-referrer-conversation");
    expect(within(page).getByText(/Companies decide hiring/)).toBeTruthy();
    expect(within(page).queryByRole("button", { name: /Mark as referred/ })).toBeNull();
  });

  it("keeps a claimed but not yet accepted ask anonymous with no composer", async () => {
    goalOn();
    stubFetch(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "claimed");
      return ok({ request: { id: 601, title: "Product Designer", targetRoleUrl: null, companyDomain: "acme.com", status: "pending", referrerId: 9, candidateName: "Asha R.", candidateMessage: "Note.", attachments: [{ mimeType: "application/pdf", fileSize: 10, availability: "after_claim" }] } });
    });
    renderPage();
    const page = await screen.findByTestId("goal-referrer-conversation");
    expect(within(page).getByText("Seeker · identity hidden")).toBeTruthy();
    expect(screen.queryByText(/Asha R\./)).toBeNull();
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  it("says the referrer is offline instead of failing silently", async () => {
    goalOn();
    stubFetch(pendingFetch());
    renderPage();
    await screen.findByTestId("goal-referrer-conversation");
    const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    onTestFinished(() => onLine.mockRestore());
    fireEvent(window, new Event("offline"));
    expect(await screen.findByText(/You.re offline\. Your decision and messages can send/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Accept & connect/ }).getAttribute("aria-disabled")).toBe("true");
  });

  it("shows a verified referrer no credits pill and no seeker money copy, only the never-paid line (D-055)", async () => {
    goalOn();
    referrerAccessOverride.value = { status: "verified", access: { verified: true, domain: "acme.com", companyName: "Acme", companyInitials: "A" } };
    stubFetch(pendingFetch());
    renderPage();
    const page = await screen.findByTestId("goal-referrer-conversation");
    expect(screen.queryByTestId("goal-credits-pill")).toBeNull();
    expect(within(page).queryByText(/credit/i)).toBeNull();
    expect(within(page).getByText(/Referrers are never paid and never ask you for money\./)).toBeTruthy();
  });
  // #831 review findings (Cline · 4255 on 0da0c28).
  it("never offers Accept on a pending ask a colleague holds; says it is with a colleague (#831 F1)", async () => {
    goalOn();
    meState.data = { id: 9 };
    stubFetch(vi.fn(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "not available");
      return ok({ request: { ...referrerPreview, status: "pending", referrerId: 44, candidateName: null, attachments: [] } });
    }));
    renderPage();
    const page = await screen.findByTestId("goal-referrer-conversation");
    expect(within(page).getByRole("heading", { level: 1, name: "A colleague has this request." })).toBeTruthy();
    expect(within(page).queryByRole("button", { name: /Accept & connect/ })).toBeNull();
    expect(within(page).queryByRole("button", { name: /Pass privately/ })).toBeNull();
    // The back link and the next step's own "All requests" commit.
    expect(within(page).getAllByRole("link", { name: "All requests" })).toHaveLength(2);
    expect(screen.queryByText(/Asha R\./)).toBeNull();
  });

  it("offers no decision until the signed-in account is known when the ask names a referrer (#831 F1)", async () => {
    goalOn();
    meState.data = undefined;
    stubFetch(vi.fn(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return fail(404, "not available");
      return ok({ request: { ...referrerPreview, status: "pending", referrerId: 9, candidateName: null, attachments: [] } });
    }));
    renderPage();
    const page = await screen.findByTestId("goal-referrer-conversation");
    await waitFor(() => expect(within(page).getByText(/Product Designer/)).toBeTruthy());
    expect(within(page).queryByRole("button", { name: /Accept & connect/ })).toBeNull();
  });

  it("shows the server decision-due time on a pending ask assigned to this referrer, even when the preview answers first (#831 F2)", async () => {
    goalOn();
    const due = "2026-11-03T09:00:00.000Z";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/mine")) return ok({ requests: [] });
      if (url.endsWith("/preview")) return ok({ request: referrerPreview });
      if (url.endsWith("/api/company-referrals/601")) return ok({ request: { ...referrerPreview, status: "pending", referrerId: 9, candidateName: null, attachments: [], decisionDueAt: due } });
      return fail(404, "gone");
    });
    stubFetch(fetchMock);
    renderPage();
    const page = await screen.findByTestId("goal-referrer-conversation");
    expect(await within(page).findByText(/^Accept or pass by /)).toBeTruthy();
    expect(within(page).getByRole("button", { name: /Accept & connect/ })).toBeTruthy();
    expect(screen.queryByText(/Asha R\./)).toBeNull();
  });

  it("keeps the preview's pending card when no assignment exists (claimed detail 404s) (#831 F2)", async () => {
    goalOn();
    stubFetch(pendingFetch());
    renderPage();
    const page = await screen.findByTestId("goal-referrer-conversation");
    expect(await within(page).findByRole("button", { name: /Accept & connect/ })).toBeTruthy();
    expect(within(page).queryByText(/^Accept or pass by /)).toBeNull();
  });

  it("opens the pass reasons as a bottom sheet on a phone, so the header and the ask stay unclipped (#831 F3)", async () => {
    goalOn();
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width"), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
    const fetchMock = pendingFetch(url => (url.includes("/one-click-review") ? ok({ status: "passed", companyDomain: "acme.com" }) : undefined));
    stubFetch(fetchMock);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Pass privately/ }));
    const sheet = await screen.findByTestId("goal-sheet");
    expect(screen.queryByTestId("goal-pass-reasons")).toBeNull();
    const reasons = within(sheet).getAllByRole("radio");
    expect(reasons).toHaveLength(7);
    expect(reasons.filter(radio => radio.getAttribute("aria-checked") === "true")).toHaveLength(0);
    const pass = within(sheet).getByRole("button", { name: /^Pass$/ });
    expect(pass.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(reasons[3]!);
    fireEvent.click(within(sheet).getByRole("button", { name: /^Pass$/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/one-click-review") && String((init as RequestInit | undefined)?.body).includes("declined"))).toBe(true));
  });
});
