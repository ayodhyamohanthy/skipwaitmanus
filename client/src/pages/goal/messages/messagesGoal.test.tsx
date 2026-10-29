// @vitest-environment jsdom
// Goal /messages (D-048-p3-messages; packet docs/plans/D-048-account.md).
// Tier 1 privacy: the composer is replaced by the server's rule whenever the
// server says a referrer has not accepted (the thread's sendBlock or a 403 on
// send), the refusal's own words are shown as they are, a refused draft never
// travels to another chat, and a failed load renders its error, never an
// empty inbox. Flag off, the kit page renders unchanged.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getToken, authState, flagState } = vi.hoisted(() => ({
  getToken: vi.fn().mockResolvedValue("test-token"),
  authState: { isSignedIn: true },
  flagState: { on: true },
}));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.isSignedIn, getToken }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <div data-testid="sign-in-button">{children}</div>,
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/messages", vi.fn()],
  Link: ({ children, href, ...rest }: { children: React.ReactNode; href: string } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/lib/goalSurfaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goalSurfaces")>();
  return { ...actual, goalSurfaceOn: (id: string) => flagState.on && id === "messages" };
});

import Messages from "../../Messages";

const now = new Date().toISOString();
const memberBlock = { reason: "referrer_acceptance_required", error: "Messages with a referrer open after they accept your request.", senderRole: "member" };
const referrerBlock = { reason: "referrer_acceptance_required", error: "You can message this member after you accept their referral request.", senderRole: "referrer" };
const followRule = { reason: "mutual_follow_required", error: "You can message this member once you follow each other." };
const summary = (id: number, label: string, mine: boolean, unread = 0) => ({ counterpartUserId: id, counterpartLabel: label, lastMessageBody: mine ? "Thanks again" : "Happy to help", lastMessageIsMine: mine, lastMessageAt: now, unreadCount: unread });
const thread = (id: number, label: string) => ({ counterpartUserId: id, counterpartLabel: label, messages: [{ id: 1, body: "Happy to help", createdAt: now, isMine: false }] });

type Reply = { status: number; body: unknown } | "network" | (() => Promise<{ status: number; body: unknown }>);
const server = {
  threads: [] as unknown[],
  listReply: null as Reply | null,
  threadReply: {} as Record<number, Reply>,
  sendBlock: {} as Record<number, unknown>,
  postReply: null as Reply | null,
  posts: [] as { url: string; key: string | undefined; body: unknown }[],
  gets: [] as string[],
};
function respond(reply: { status: number; body: unknown }) {
  return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body } as Response;
}
async function resolveReply(reply: Reply) {
  if (reply === "network") throw new TypeError("Failed to fetch");
  return respond(typeof reply === "function" ? await reply() : reply);
}
beforeEach(() => {
  flagState.on = true; authState.isSignedIn = true;
  server.threads = [summary(22, "Referrer · acme.com", true), summary(33, "Member · Asha", false, 2)];
  server.listReply = null; server.threadReply = {}; server.sendBlock = {}; server.postReply = null; server.posts = []; server.gets = [];
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const headers = (init.headers ?? {}) as Record<string, string>;
      server.posts.push({ url, key: headers["Idempotency-Key"], body: JSON.parse(String(init.body)) });
      if (server.postReply) return resolveReply(server.postReply);
      return respond({ status: 201, body: { message: { id: 99 } } });
    }
    server.gets.push(url);
    if (url === "/api/dms/threads") return resolveReply(server.listReply ?? { status: 200, body: { threads: server.threads } });
    const id = Number(/\/api\/dms\/threads\/(\d+)$/.exec(url)?.[1]);
    if (server.threadReply[id]) return resolveReply(server.threadReply[id]);
    const label = (server.threads as { counterpartUserId: number; counterpartLabel: string }[]).find(item => item.counterpartUserId === id)?.counterpartLabel ?? "Member";
    return respond({ status: 200, body: { thread: thread(id, label), sendBlock: server.sendBlock[id] ?? null } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.sessionStorage.clear(); });
// Warm the lazily loaded goal chunk so a cold transform on a busy runner
// never outlasts findBy's timeout.
beforeAll(async () => { await import("./GoalMessages").catch(() => undefined); }, 60_000);

const primaries = () => document.querySelectorAll("[data-g-primary]");
/** Opens a chat from its row in the list (the next-step button names the same person). */
async function openChat(name: RegExp) {
  fireEvent.click(within(await screen.findByRole("list", { name: "Chats" })).getByRole("button", { name }));
  return screen.findByRole("heading", { level: 1 });
}

describe("goal /messages: inbox", () => {
  it("flag off keeps the kit page", async () => {
    flagState.on = false;
    server.threads = [];
    render(<Messages />);
    expect(await screen.findByText("Your chats live here.")).toBeTruthy();
    expect(document.querySelector('[data-goal-page="messages"]')).toBeNull();
  });

  it("opens on the goal with the chat waiting on you first and one black commit to answer it", async () => {
    render(<Messages />);
    expect(await screen.findByRole("heading", { level: 1, name: "Your chats." })).toBeTruthy();
    const rows = await screen.findAllByTestId("goal-chat-row");
    expect(rows[0]?.textContent).toMatch(/Member · Asha/);
    expect(rows[0]?.textContent).toMatch(/Waiting on you/);
    expect(rows[1]?.textContent).toMatch(/Referrer · acme\.com/);
    expect(primaries()).toHaveLength(1);
    expect(primaries()[0]?.textContent).toMatch(/Reply to Member · Asha/);
    fireEvent.click(primaries()[0] as HTMLElement);
    expect(await screen.findByRole("heading", { level: 1, name: "Member · Asha" })).toBeTruthy();
    expect(server.gets).toContain("/api/dms/threads/33");
  });

  it("states the acceptance rule in plain words on the inbox", async () => {
    render(<Messages />);
    await screen.findAllByTestId("goal-chat-row");
    expect(screen.getByText(/Messages with a referrer open after they accept your request\./)).toBeTruthy();
  });

  it("an empty inbox points at a referral request and names where those conversations live", async () => {
    server.threads = [];
    render(<Messages />);
    expect(await screen.findByText("No chats yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "My requests" }).getAttribute("href")).toBe("/requests");
    expect(primaries()).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Ask for a referral/ }).getAttribute("href")).toBe("/ask");
  });

  it("shows loading while the chats are on their way", async () => {
    let release: () => void = () => {};
    server.listReply = () => new Promise(resolve => { release = () => resolve({ status: 200, body: { threads: server.threads } }); });
    render(<Messages />);
    expect(await screen.findByText("Loading your chats…")).toBeTruthy();
    expect(screen.queryByText("No chats yet.")).toBeNull();
    release();
    expect((await screen.findAllByTestId("goal-chat-row")).length).toBe(2);
  });

  it("a failed load renders its error and a retry, never an empty inbox", async () => {
    server.listReply = { status: 500, body: { error: "Chats are down for a moment" } };
    render(<Messages />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Chats are down for a moment/);
    expect(screen.queryByText("No chats yet.")).toBeNull();
    expect(primaries()).toHaveLength(0);
    server.listReply = null;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect((await screen.findAllByTestId("goal-chat-row")).length).toBe(2);
  });

  it("an unreachable server says so in plain words", async () => {
    server.listReply = "network";
    render(<Messages />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not reach skipwait\.me/);
  });

  it("a chat that fails to open says so with a retry instead of staying silent", async () => {
    server.threadReply[33] = { status: 500, body: { error: "We could not open this conversation" } };
    render(<Messages />);
    fireEvent.click(within(await screen.findByRole("list", { name: "Chats" })).getByRole("button", { name: /Member · Asha/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/We could not open this conversation/);
    delete server.threadReply[33];
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Member · Asha" })).toBeTruthy();
  });

  it("signed out: one next step to sign in, the rule stated, nothing fetched", async () => {
    authState.isSignedIn = false;
    render(<Messages />);
    expect(await screen.findByRole("heading", { level: 1, name: "Your chats." })).toBeTruthy();
    expect(screen.getByText("Messages with a referrer open after they accept your request.")).toBeTruthy();
    expect(within(screen.getByTestId("sign-in-button")).getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(server.gets).toHaveLength(0);
  });
});

describe("goal /messages: a chat", () => {
  it("sends through the idempotent path and shows the sent message", async () => {
    render(<Messages />);
    await openChat(/Member · Asha/);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "  Thanks for the help  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Thanks for the help")).toBeTruthy();
    expect(server.posts).toHaveLength(1);
    expect(server.posts[0]?.url).toBe("/api/dms/threads/33");
    expect(server.posts[0]?.body).toEqual({ body: "Thanks for the help" });
    expect(server.posts[0]?.key).toMatch(/^[\x21-\x7E]{16,64}$/);
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("");
    expect(window.sessionStorage.length).toBe(0);
    expect(primaries()).toHaveLength(1);
  });

  it("no message box before acceptance: the server's sendBlock replaces the composer as soon as the chat opens", async () => {
    server.sendBlock[22] = memberBlock;
    render(<Messages />);
    await openChat(/Referrer · acme\.com/);
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
    const rule = screen.getByTestId("goal-dm-rule");
    expect(rule.textContent).toMatch(/Messages open after acceptance/);
    expect(rule.textContent).toMatch(/Messages with a referrer open after they accept your request\. No plan or follow changes this\./);
    expect(within(rule).getByRole("link", { name: "Go to My requests" }).getAttribute("href")).toBe("/requests");
    expect(document.body.textContent).not.toMatch(/upgrade|premium|\bPro\b|\bMax\b/i);
  });

  it("a referrer who has not accepted is pointed at the company inbox", async () => {
    server.sendBlock[22] = referrerBlock;
    render(<Messages />);
    await openChat(/Referrer · acme\.com/);
    const rule = screen.getByTestId("goal-dm-rule");
    expect(rule.textContent).toMatch(/You can message this member after you accept their referral request\./);
    expect(within(rule).getByRole("link", { name: "Open my company inbox" }).getAttribute("href")).toBe("/inbox");
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  it("a sendBlock the server did not shape as the rule keeps the composer", async () => {
    server.sendBlock[22] = { reason: "something_else" };
    render(<Messages />);
    await openChat(/Referrer · acme\.com/);
    expect(screen.getByLabelText("Message")).toBeTruthy();
    expect(screen.queryByTestId("goal-dm-rule")).toBeNull();
  });

  it("a 403 refusal on send replaces the composer with the rule as the server worded it and keeps the text copyable", async () => {
    server.postReply = { status: 403, body: memberBlock };
    render(<Messages />);
    await openChat(/Referrer · acme\.com/);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Can you refer me?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const rule = await screen.findByTestId("goal-dm-rule");
    expect(rule.textContent).toMatch(/Messages with a referrer open after they accept your request\./);
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.getByTestId("goal-dm-unsent").textContent).toMatch(/Can you refer me\?/);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("never carries a refused draft into another chat", async () => {
    server.postReply = { status: 403, body: memberBlock };
    render(<Messages />);
    await openChat(/Referrer · acme\.com/);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Can you refer me?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByTestId("goal-dm-rule");
    fireEvent.click(screen.getByRole("button", { name: "All chats" }));
    await openChat(/Member · Asha/);
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("goal-dm-rule")).toBeNull();
    expect(document.body.textContent).not.toContain("Can you refer me?");
  });

  it("does not show a late refusal in a chat the member already left", async () => {
    let answer: (value: { status: number; body: unknown }) => void = () => {};
    server.postReply = () => new Promise(resolve => { answer = resolve; });
    render(<Messages />);
    await openChat(/Referrer · acme\.com/);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Can you refer me?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(server.posts).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "All chats" }));
    await openChat(/Member · Asha/);
    answer({ status: 403, body: memberBlock });
    await waitFor(() => expect(window.sessionStorage.length).toBe(0));
    expect(screen.queryByTestId("goal-dm-rule")).toBeNull();
    expect(screen.getByLabelText("Message")).toBeTruthy();
  });

  it("the follow rule keeps the draft and offers no upgrade", async () => {
    server.postReply = { status: 403, body: followRule };
    render(<Messages />);
    await openChat(/Member · Asha/);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi there" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const card = await screen.findByTestId("goal-dm-follow-rule");
    expect(card.textContent).toMatch(/Follow each other to message/);
    expect(card.textContent).toMatch(/You can message this member once you follow each other\./);
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("Hi there");
    expect(document.body.textContent).not.toMatch(/upgrade|premium|\bPro\b|\bMax\b/i);
  });

  it("a 429 says when to try again and a 409 keeps the text without a duplicate", async () => {
    server.postReply = { status: 429, body: { error: "You're sending messages too quickly." } };
    render(<Messages />);
    await openChat(/Member · Asha/);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/You're sending messages too quickly\. Try again in a few minutes\./);
    server.postReply = { status: 409, body: {} };
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/did not send a duplicate/);
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("Hi");
  });

  it("a send that fails shows the server's words and keeps the text", async () => {
    server.postReply = { status: 500, body: { error: "Message service is down" } };
    render(<Messages />);
    await openChat(/Member · Asha/);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Message service is down/);
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("Hello");
  });

  it("offline: says so and holds the send", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    render(<Messages />);
    await openChat(/Member · Asha/);
    expect(screen.getByTestId("goal-offline-state").textContent).toMatch(/offline/);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(server.posts).toHaveLength(0);
  });
});
