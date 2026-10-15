// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Messages from "./Messages";

const { getToken, authState } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("test-token"), authState: { isSignedIn: true } }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.isSignedIn, getToken }),
  SignInButton: ({ children, className }: { children?: React.ReactNode; className?: string }) => <button type="button" className={className}>{children}</button>,
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); authState.isSignedIn = true; window.sessionStorage.clear(); });

describe("Direct messages inbox", () => {
  it("renders the empty state when there are no threads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ threads: [] }) })));
    render(<Messages />);
    expect(await screen.findByText("Your chats live here.")).toBeTruthy();
    expect(screen.getByText(/Referral-request conversations stay in/)).toBeTruthy();
  });

  it("lists threads with label, you-prefix preview, and opens the thread view", async () => {
    const threadPayload = { thread: { counterpartUserId: 22, counterpartLabel: "Referrer · acme.com", messages: [{ id: 1, body: "Happy to help", createdAt: new Date().toISOString(), isMine: false }] } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/dms/threads"
      ? { ok: true, json: async () => ({ threads: [{ counterpartUserId: 22, counterpartLabel: "Referrer · acme.com", lastMessageBody: "Happy to help", lastMessageIsMine: false, lastMessageAt: new Date().toISOString(), unreadCount: 1 }] }) }
      : { ok: true, json: async () => threadPayload }));
    render(<Messages />);
    fireEvent.click(await screen.findByRole("button", { name: /Referrer · acme\.com/ }));
    expect(await screen.findByText("Happy to help")).toBeTruthy();
    expect(screen.getByPlaceholderText("Write a message")).toBeTruthy();
  });

  it("shows the paywall card when sending is rejected with 402", async () => {
    const threadPayload = { thread: { counterpartUserId: 22, counterpartLabel: "Referrer · acme.com", messages: [{ id: 1, body: "Hello", createdAt: new Date().toISOString(), isMine: false }] } };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/dms/threads") return { ok: true, json: async () => ({ threads: [{ counterpartUserId: 22, counterpartLabel: "Referrer · acme.com", lastMessageBody: "Hello", lastMessageIsMine: false, lastMessageAt: new Date().toISOString(), unreadCount: 0 }] }) };
      if (typeof init?.method === "string" && init.method === "POST") return { ok: false, status: 402, json: async () => ({ error: "Direct messaging is a premium feature. Upgrade to Pro to message referrers directly.", upgrade: true }) };
      return { ok: true, json: async () => threadPayload };
    }));
    render(<Messages />);
    fireEvent.click(await screen.findByRole("button", { name: /Referrer · acme\.com/ }));
    fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Hi there" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getAllByText(/Direct messaging is for members/).length).toBeGreaterThan(0));
    expect(screen.getAllByRole("link", { name: "Upgrade to Pro" })[0].getAttribute("href")).toBe("/premium?role=job_seeker");
  });
});

describe("Direct messages with a referrer before acceptance (D-012 item 3)", () => {
  const referrerThread = { counterpartUserId: 22, counterpartLabel: "Referrer · acme.com", messages: [{ id: 1, body: "Hello", createdAt: new Date().toISOString(), isMine: true }] };
  const threadList = { threads: [{ counterpartUserId: 22, counterpartLabel: "Referrer · acme.com", lastMessageBody: "Hello", lastMessageIsMine: true, lastMessageAt: new Date().toISOString(), unreadCount: 0 }] };
  const memberBlock = { reason: "referrer_acceptance_required", error: "Messages with a referrer open after they accept your request.", senderRole: "member" };

  it("replaces the composer with the rule, not an upgrade, when a send is refused with 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/dms/threads") return { ok: true, json: async () => threadList };
      if (init?.method === "POST") return { ok: false, status: 403, json: async () => memberBlock };
      return { ok: true, json: async () => ({ thread: referrerThread, sendBlock: null }) };
    }));
    render(<Messages />);
    fireEvent.click(await screen.findByRole("button", { name: /Referrer · acme\.com/ }));
    fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Can you refer me?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Messages open after acceptance")).toBeTruthy();
    expect(screen.getByText(/Messages with a referrer open after they accept your request\. No plan or follow changes this\./)).toBeTruthy();
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.queryByRole("link", { name: "Upgrade to Pro" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to My requests" }).getAttribute("href")).toBe("/requests");
    expect(window.sessionStorage.length).toBe(0);
    // The refused text stays visible and copyable, not hidden in the draft.
    expect(document.querySelector("[data-skipwait-unsent='draft']")?.textContent).toContain("Can you refer me?");
  });

  it("never carries a blocked draft into another conversation", async () => {
    const memberThread = { counterpartUserId: 33, counterpartLabel: "Member", messages: [{ id: 2, body: "Hey", createdAt: new Date().toISOString(), isMine: false }] };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/dms/threads") return { ok: true, json: async () => ({ threads: [threadList.threads[0], { ...threadList.threads[0], counterpartUserId: 33, counterpartLabel: "Member" }] }) };
      if (init?.method === "POST") return { ok: false, status: 403, json: async () => memberBlock };
      if (url === "/api/dms/threads/33") return { ok: true, json: async () => ({ thread: memberThread, sendBlock: null }) };
      return { ok: true, json: async () => ({ thread: referrerThread, sendBlock: null }) };
    }));
    render(<Messages />);
    fireEvent.click(await screen.findByRole("button", { name: /Referrer · acme\.com/ }));
    fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Can you refer me?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Messages open after acceptance")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All chats" }));
    fireEvent.click(await screen.findByRole("button", { name: /Member/ }));
    const composer = await screen.findByLabelText("Message");
    expect((composer as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Messages open after acceptance")).toBeNull();
    expect(document.body.textContent).not.toContain("Can you refer me?");
  });

  it("does not show a late refusal for a conversation the member already left", async () => {
    let answerPost: (value: { ok: boolean; status: number; json: () => Promise<typeof memberBlock> }) => void = () => undefined;
    const memberThread = { counterpartUserId: 33, counterpartLabel: "Member", messages: [] };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/dms/threads") return { ok: true, json: async () => ({ threads: [threadList.threads[0], { ...threadList.threads[0], counterpartUserId: 33, counterpartLabel: "Member" }] }) };
      if (init?.method === "POST") return new Promise(resolve => { answerPost = resolve; });
      if (url === "/api/dms/threads/33") return { ok: true, json: async () => ({ thread: memberThread, sendBlock: null }) };
      return { ok: true, json: async () => ({ thread: referrerThread, sendBlock: null }) };
    }));
    render(<Messages />);
    fireEvent.click(await screen.findByRole("button", { name: /Referrer · acme\.com/ }));
    fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Can you refer me?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "All chats" }));
    fireEvent.click(await screen.findByRole("button", { name: /Member/ }));
    await screen.findByLabelText("Message");
    answerPost({ ok: false, status: 403, json: async () => memberBlock });
    await waitFor(() => expect(window.sessionStorage.length).toBe(0));
    expect(screen.queryByText("Messages open after acceptance")).toBeNull();
    expect(screen.getByLabelText("Message")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Can you refer me?");
  });

  it("offers no New chat entry, since no direct message can start from scratch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => threadList })));
    render(<Messages />);
    await screen.findByRole("button", { name: /Referrer · acme\.com/ });
    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();
    expect(screen.queryByRole("link", { name: "New chat" })).toBeNull();
    expect(document.querySelector("a[href='/wall']")).toBeNull();
  });

  it("shows the rule as soon as a pre-acceptance thread opens", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/dms/threads"
      ? { ok: true, json: async () => threadList }
      : { ok: true, json: async () => ({ thread: referrerThread, sendBlock: memberBlock }) }));
    render(<Messages />);
    fireEvent.click(await screen.findByRole("button", { name: /Referrer · acme\.com/ }));
    expect(await screen.findByText("Messages open after acceptance")).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  it("points a referrer who has not accepted yet at their company inbox", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/dms/threads"
      ? { ok: true, json: async () => threadList }
      : { ok: true, json: async () => ({ thread: referrerThread, sendBlock: { reason: "referrer_acceptance_required", error: "You can message this member after you accept their referral request.", senderRole: "referrer" } }) }));
    render(<Messages />);
    fireEvent.click(await screen.findByRole("button", { name: /Referrer · acme\.com/ }));
    expect((await screen.findByRole("link", { name: "Open my company inbox" })).getAttribute("href")).toBe("/inbox");
  });

  it("keeps the composer when the thread has no block", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/dms/threads"
      ? { ok: true, json: async () => threadList }
      : { ok: true, json: async () => ({ thread: referrerThread, sendBlock: { reason: "something_else" } }) }));
    render(<Messages />);
    fireEvent.click(await screen.findByRole("button", { name: /Referrer · acme\.com/ }));
    expect(await screen.findByLabelText("Message")).toBeTruthy();
    expect(screen.queryByText("Messages open after acceptance")).toBeNull();
  });

  it("never promises messaging referrers directly or faster answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/dms/threads") return { ok: true, json: async () => ({ threads: [{ ...threadList.threads[0], counterpartLabel: "Member" }] }) };
      if (init?.method === "POST") return { ok: false, status: 402, json: async () => ({ error: "Direct messaging is a premium feature.", upgrade: true }) };
      return { ok: true, json: async () => ({ thread: { ...referrerThread, counterpartLabel: "Member" }, sendBlock: null }) };
    }));
    render(<Messages />);
    fireEvent.click(await screen.findByRole("button", { name: /Member/ }));
    fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getAllByText(/Direct messaging is for members/).length).toBeGreaterThan(0));
    expect(document.body.textContent).not.toMatch(/message (verified )?referrers directly|answers faster/i);
  });

  it("points an empty inbox at asking for a referral, since referrers message after they accept", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ threads: [] }) })));
    render(<Messages />);
    expect(await screen.findByText(/Messages with a referrer open after they accept your request\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ask for a referral/ }).getAttribute("href")).toBe("/ask");
    expect(screen.queryByRole("link", { name: /Find referrers/ })).toBeNull();
  });

  it("asks a signed-out visitor to sign in and states the rule without an upgrade prompt", () => {
    authState.isSignedIn = false;
    render(<Messages />);
    expect(screen.getByText("Sign in to see your messages")).toBeTruthy();
    expect(screen.getByText("Messages with a referrer open after they accept your request.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Upgrade to Pro" })).toBeNull();
  });
});
