// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Landed from "./Landed";
import { UNDELIVERED_ERROR } from "@/components/landed/landedModel";
import "./goal/seeker-small/GoalLanded";

const { authState, go, search } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true, userId: "user-1", getToken: vi.fn().mockResolvedValue("test-token") },
  go: vi.fn(),
  search: { value: "" },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/landed", go],
  useSearch: () => search.value,
}));

// Real-shaped fixture data on purpose: nothing here is the kit sample (Rahul / Wipro /
// Product Designer), so those names ever appearing in the DOM is always fabricated data.
const closedAsk = { id: 12, title: "Data Analyst", companyDomain: "zensar.com", companyName: "Zensar", status: "closed", referrerId: 88, referrerName: "Nikhil Rao", referrerTitle: "Analytics Lead", referrerMessage: null, targetRoleUrl: null, compensation: null, queueStatus: null, unreadMessageCount: 0, attachmentCount: 0, expiresAt: null, createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-10-02T09:00:00.000Z" };
const olderAsk = { ...closedAsk, id: 7, title: "Support Lead", companyName: "Infosys BPM", companyDomain: "infosysbpm.example", referrerId: 91, referrerName: "Meera Iyer", updatedAt: "2026-08-01T09:00:00.000Z" };

type FetchReply = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (body: unknown): FetchReply => ({ ok: true, status: 200, json: async () => body });
const mine = (requests: unknown[]) => ok({ requests, slots: null });
const journey = (overrides: Record<string, unknown> = {}) => ok({ state: { referralRequestId: closedAsk.id, thankYouMessage: "Thanks.", shareOnWall: true, payForward: null, delivered: true, ...overrides } });

const sent: unknown[] = [];
function stubFetch(replies: Record<string, FetchReply>) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    if (init?.method === "POST") sent.push(JSON.parse(String(init.body)));
    const reply = Object.entries(replies).find(([path]) => url.startsWith(path))?.[1];
    if (!reply) throw new Error(`unstubbed fetch ${url}`);
    return reply;
  }));
}

function renderLanded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Landed /></QueryClientProvider>);
}

/** The asks have loaded and the celebrate step is on screen (past the skeleton's hold). */
const arrive = async () => screen.findByRole("button", { name: /Thank your referrer/ });

beforeEach(() => {
  authState.isLoaded = true; authState.isSignedIn = true; authState.userId = "user-1";
  search.value = ""; sent.length = 0;
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Landed journey (live data)", () => {
  it("celebrates the real hire without preview scaffolding or sample people", async () => {
    stubFetch({ "/api/company-referrals/mine": mine([closedAsk]) });
    const { container } = renderLanded();
    await arrive();
    expect(screen.getByRole("heading", { name: "You did it." })).toBeTruthy();
    expect(screen.getByText("Data Analyst · Zensar")).toBeTruthy();
    for (const scaffold of [/EXAMPLE/i, /Illustrative outcome/i, /Replay preview/i, /Wipro|Rahul|Product Designer/]) expect(container.textContent).not.toMatch(scaffold);
  });

  it("asks a signed-out visitor to sign in before it names anyone", async () => {
    authState.isSignedIn = false;
    stubFetch({ "/api/company-referrals/mine": mine([]) });
    renderLanded();
    expect(await screen.findByRole("button", { name: /Secure sign in/ })).toBeTruthy();
  });

  it("shows an honest zero state when no ask has been marked hired", async () => {
    stubFetch({ "/api/company-referrals/mine": mine([{ ...closedAsk, status: "interview" }]) });
    renderLanded();
    await waitFor(() => expect(screen.getByText("No hires to thank yet.")).toBeTruthy());
    expect(screen.queryByText("You did it.")).toBeNull();
  });

  it("opens the newest hire and honours ?request= for an older one", async () => {
    stubFetch({ "/api/company-referrals/mine": mine([closedAsk, olderAsk]) });
    renderLanded();
    await arrive();
    fireEvent.click(screen.getByRole("button", { name: /Thank your referrer/ }));
    expect(screen.getByRole("heading", { name: "Say thanks to Nikhil." })).toBeTruthy();
    cleanup();
    search.value = "request=7";
    renderLanded();
    await arrive();
    fireEvent.click(screen.getByRole("button", { name: /Thank your referrer/ }));
    expect(screen.getByRole("heading", { name: "Say thanks to Meera." })).toBeTruthy();
  });

  it("sends the edited thanks with the wall choice, then moves to paying it forward", async () => {
    stubFetch({ "/api/company-referrals/mine": mine([closedAsk]), "/api/landed/journey": journey() });
    renderLanded();
    await arrive();
    fireEvent.click(screen.getByRole("button", { name: /Thank your referrer/ }));
    expect(screen.getByRole("heading", { name: "Say thanks to Nikhil." })).toBeTruthy();
    expect(screen.getByText("The single message referrers remember most.")).toBeTruthy();
    const textarea = screen.getByLabelText("Thank-you message");
    const wall = screen.getByRole("button", { name: /private thank-you wall/ });
    expect(wall.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/That wall is visible only to them/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Copy thanks/ })).toBeNull();
    fireEvent.change(textarea, { target: { value: "Thank you, truly." } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send thanks" })); });
    expect(sent[0]).toMatchObject({ referralRequestId: 12, message: "Thank you, truly.", shareOnWall: true });
    expect(screen.getByRole("heading", { name: "Hold the door for the next person." })).toBeTruthy();
  });

  it("keeps the note on the page and says so when the server could not deliver it", async () => {
    stubFetch({ "/api/company-referrals/mine": mine([closedAsk]), "/api/landed/journey": journey({ delivered: false }) });
    renderLanded();
    await arrive();
    fireEvent.click(screen.getByRole("button", { name: /Thank your referrer/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send thanks" })); });
    expect(screen.getByRole("alert").textContent).toBe(UNDELIVERED_ERROR);
    expect(screen.getByRole("heading", { name: "Say thanks to Nikhil." })).toBeTruthy();
  });

  it("unticks the wall without dropping the note", async () => {
    stubFetch({ "/api/company-referrals/mine": mine([closedAsk]), "/api/landed/journey": journey({ shareOnWall: false }) });
    renderLanded();
    await arrive();
    fireEvent.click(screen.getByRole("button", { name: /Thank your referrer/ }));
    fireEvent.click(screen.getByRole("button", { name: /private thank-you wall/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send thanks" })); });
    expect(sent[0]).toMatchObject({ shareOnWall: false });
  });

  it("records pay-it-forward consent and finishes on real routes", async () => {
    stubFetch({ "/api/company-referrals/mine": mine([closedAsk]), "/api/landed/journey": journey() });
    renderLanded();
    await arrive();
    fireEvent.click(screen.getByRole("button", { name: /Thank your referrer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByText(/30 days after you start/i)).toBeNull();
    expect(screen.queryByText(/his private thank-you wall/i)).toBeNull();
    const back = screen.getByRole("link", { name: "Back to skipwait.me" });
    expect(back.getAttribute("href")).toBe("/explore");
    fireEvent.click(screen.getByRole("button", { name: "Yes, I will pay it forward" }));
    await waitFor(() => expect(sent[0]).toMatchObject({ referralRequestId: 12, payForward: "yes" }));
    expect(await screen.findByRole("heading", { name: "Welcome to the other side of the door." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Close my other referral requests" }).getAttribute("href")).toBe("/requests");
    expect(screen.getByRole("link", { name: /Verify work email/ }).getAttribute("href")).toBe("/verify");
  });

  it("offers an honest done state for the later choice", async () => {
    stubFetch({ "/api/company-referrals/mine": mine([closedAsk]), "/api/landed/journey": journey() });
    renderLanded();
    await arrive();
    fireEvent.click(screen.getByRole("button", { name: /Thank your referrer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Maybe later" }));
    await waitFor(() => expect(sent[0]).toMatchObject({ payForward: "later" }));
    expect(await screen.findByRole("heading", { name: "Done." })).toBeTruthy();
    expect(screen.getByText(/No reminders from us/)).toBeTruthy();
  });
});
