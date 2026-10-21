// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const flag = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/shareFlags", () => ({ get SHARE_WIN_CARD() { return flag.on; } }));
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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = true; });

const seekerPending = { id: 601, title: "Product Designer", pitch: "I have led two end-to-end redesigns.", targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", status: "pending", referrerId: null, queueStatus: null, referrerMessage: null, unreadMessageCount: 0, createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", attachmentCount: 0 };
const seekerApproved = { ...seekerPending, status: "approved", referrerId: 77 };
const referrerPreview = { id: 601, title: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", candidateName: "Asha R.", candidateMessage: "I have led two end-to-end redesigns.", status: "pending", attachments: [] };

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)));
}
const ok = (json: unknown) => ({ ok: true, json: async () => json });
const fail = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });


const named = { ...seekerApproved, companyName: "Quillmint", companyInitials: "Q", referrerName: "Priya Nair", referrerTitle: "Staff Designer", referrerMessage: "Happy to help, Priya here." };
const mine = (request: unknown) => stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [request] }) : ok({ messages: [] })));
function clipboard() { const writeText = vi.fn(async () => undefined); vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } }); return writeText; }

describe("Seeker win card on the thread", () => {
  it("flag off (shipped state): an accepted seeker thread shows no card", async () => {
    flag.on = false;
    mine(named);
    render(<ReferralConversation />);
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(screen.queryByTestId("share-win-card")).toBeNull();
  });
  it("flag on: an accepted seeker thread offers the card, and copying never includes the referrer", async () => {
    mine(named);
    const writeText = clipboard();
    render(<ReferralConversation />);
    const card = await screen.findByTestId("share-win-card");
    expect(within(card).getByText("Your ask was accepted at Quillmint. Tell people if you want to – it is always your choice.")).toBeTruthy();
    expect(within(card).getByText("Accepted")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Copy card as text" }));
    fireEvent.click(within(card).getByRole("button", { name: "Copy for LinkedIn" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    const [plain, linked] = writeText.mock.calls.map(call => String(call[0]));
    expect(plain).toContain("Quillmint");
    expect(linked.endsWith("https://skipwait.me")).toBe(true);
    for (const text of [plain, linked, card.textContent ?? ""]) expect(text).not.toMatch(/Priya|Nair|Staff Designer|Happy to help/);
  });
  it("flag on: a still-pending ask shows no card", async () => {
    mine({ ...seekerPending, companyName: "Quillmint", companyInitials: "Q" });
    render(<ReferralConversation />);
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(screen.queryByTestId("share-win-card")).toBeNull();
  });
  it("flag on: later steps read Referred", async () => {
    mine({ ...named, status: "intro_made" });
    render(<ReferralConversation />);
    expect(within(await screen.findByTestId("share-win-card")).getByText("Referred")).toBeTruthy();
  });
  it("flag on: the reviewing referrer never sees the card", async () => {
    stubFetch(url => (url.endsWith("/mine") ? ok({ requests: [] }) : url.endsWith("/601/preview") ? ok({ request: { ...referrerPreview, companyName: "Quillmint", companyInitials: "Q" } }) : ok({ messages: [] })));
    render(<ReferralConversation />);
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(screen.queryByTestId("share-win-card")).toBeNull();
  });
});
