// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UnifiedInbox from "./UnifiedInbox";

const { authState, userState } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() },
  userState: { user: null as unknown },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  useUser: () => userState,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ASKING = [{ id: 11, title: "Product Designer", companyDomain: "wipro.com", status: "approved", referrerId: 9, queueStatus: null, referrerMessage: null, unreadMessageCount: 2, updatedAt: ago(3600000) }];
// candidateName is not part of the real inbox payload; it is here to prove the list never renders seeker identity.
const REFERRING_NEW = [{ id: 21, companyDomain: "wipro.com", status: "pending", unreadMessageCount: 0, updatedAt: ago(7200000), candidateName: "Rahul Kumar" }];
const REFERRING_DONE = [{ id: 22, companyDomain: "wipro.com", status: "approved", unreadMessageCount: 0, updatedAt: ago(9000000) }];

const WORK_USER = { id: "41", emailAddresses: [{ emailAddress: "r@wipro.com", verification: { status: "verified" } }] };
const PERSONAL_USER = { id: "42", emailAddresses: [{ emailAddress: "r@gmail.com", verification: { status: "verified" } }] };

type Reply = { status?: number; body: unknown } | "network";
let replies: { mine: Reply; fresh: Reply; done: Reply };
const fetchMock = vi.fn(async (url: string) => {
  const key = String(url).endsWith("/mine") ? "mine" : String(url).includes("scope=new") ? "fresh" : String(url).includes("scope=completed") ? "done" : null;
  const reply: Reply = key ? replies[key] : { body: {} };
  if (reply === "network") throw new TypeError("Failed to fetch");
  const status = reply.status ?? 200;
  return { ok: status < 400, status, url: String(url), json: async () => reply.body };
});

function stubAll(mine: unknown[], fresh: unknown[], done: unknown[]) {
  replies = { mine: { body: { requests: mine } }, fresh: { body: { requests: fresh } }, done: { body: { requests: done } } };
}

function renderInbox() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(<QueryClientProvider client={client}><UnifiedInbox /></QueryClientProvider>);
}

beforeEach(() => {
  authState.isLoaded = true;
  authState.isSignedIn = true;
  authState.openSignIn.mockReset();
  userState.user = WORK_USER;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("UnifiedInbox", () => {
  it("lists asking threads with unread state linking to the thread", async () => {
    stubAll(ASKING, [], []);
    renderInbox();
    const row = await screen.findByLabelText(/Your referrer · Wipro, Product Designer, Accepted, 2 unread/);
    expect(row.getAttribute("href")).toBe("/conversation/11");
    expect(row.textContent).toContain("2 new messages");
  });

  it("shows referring threads with hidden seeker identity, never names", async () => {
    stubAll([], REFERRING_NEW, []);
    renderInbox();
    expect(await screen.findByText("Seeker · identity hidden")).toBeTruthy();
    expect(screen.getByText("Requested")).toBeTruthy();
    expect(screen.getByText(/New ask for you to review/)).toBeTruthy();
    expect(screen.getByLabelText(/Seeker · identity hidden/).getAttribute("href")).toBe("/conversation/21?from=inbox");
    expect(document.body.textContent).not.toContain("Rahul");
  });

  it("marks accepted referring threads as identity shared without inventing a name", async () => {
    stubAll([], [], REFERRING_DONE);
    renderInbox();
    expect(await screen.findByText("Seeker · identity shared")).toBeTruthy();
    expect(screen.getByText("Accepted")).toBeTruthy();
  });

  it("filters by side and searches without inventing results", async () => {
    stubAll(ASKING, REFERRING_NEW, []);
    renderInbox();
    await screen.findByText("Your referrer · Wipro");
    fireEvent.click(screen.getByRole("tab", { name: "Referring" }));
    expect(screen.queryByText("Your referrer · Wipro")).toBeNull();
    expect(screen.getByText("Seeker · identity hidden")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "tcs" } });
    expect(screen.getByText("No matching conversations.")).toBeTruthy();
    expect(screen.queryByText("No conversations yet.")).toBeNull();
  });

  it("renders an honest empty state pointing at explore", async () => {
    stubAll([], [], []);
    renderInbox();
    expect(await screen.findByText("No conversations yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find a referrer" }).getAttribute("href")).toBe("/explore");
    expect(screen.queryByText(/Review queue/)).toBeNull();
  });

  it("links verified referrers with new asks to the review queue", async () => {
    stubAll([], REFERRING_NEW, REFERRING_DONE);
    renderInbox();
    const queue = await screen.findByRole("link", { name: /Review queue · 1 new ask waiting/ });
    expect(queue.getAttribute("href")).toBe("/queue");
  });

  it("never asks the referrer inbox for a personal-email account", async () => {
    userState.user = PERSONAL_USER;
    stubAll(ASKING, REFERRING_NEW, []);
    renderInbox();
    await screen.findByText("Your referrer · Wipro");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/company-referrals/mine"]);
    expect(screen.queryByText(/Review queue/)).toBeNull();
    expect(screen.queryByText("Seeker · identity hidden")).toBeNull();
  });

  it("shows a load error instead of an empty inbox, then recovers on retry", async () => {
    stubAll([], [], []);
    replies.mine = { status: 500, body: { error: "We could not load your referral requests" } };
    renderInbox();
    expect(await screen.findByText("We couldn't load your inbox.")).toBeTruthy();
    expect(screen.getByText("We could not load your referral requests")).toBeTruthy();
    expect(screen.queryByText("No conversations yet.")).toBeNull();
    replies.mine = { body: { requests: ASKING } };
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Your referrer · Wipro")).toBeTruthy();
    expect(screen.queryByText("We couldn't load your inbox.")).toBeNull();
  });

  it("keeps loaded rows visible when only one source fails", async () => {
    stubAll(ASKING, [], []);
    replies.fresh = "network";
    renderInbox();
    expect(await screen.findByText("Your referrer · Wipro")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Some conversations could not load."));
  });

  it("rejects a malformed list payload rather than rendering it", async () => {
    stubAll([{ id: "x", companyDomain: 3 }], [], []);
    renderInbox();
    expect(await screen.findByText("We couldn't load your inbox.")).toBeTruthy();
  });

  it("keeps the list behind sign-in", () => {
    authState.isSignedIn = false;
    stubAll(ASKING, [], []);
    renderInbox();
    expect(screen.getByRole("heading", { name: "Inbox." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(authState.openSignIn).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
