// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Messages from "./Messages";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
