// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UnifiedInbox from "./UnifiedInbox";

const { authState, userState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, userState: { user: null as unknown }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  useUser: () => userState,
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/inbox", go],
}));

const ASKING = [{ id: 11, title: "Product Designer", companyDomain: "wipro.com", status: "approved", referrerId: 9, queueStatus: null, referrerMessage: null, unreadMessageCount: 2, updatedAt: new Date(Date.now() - 3600000).toISOString() }];
const REFERRING_NEW = [{ id: 21, companyDomain: "wipro.com", status: "pending", unreadMessageCount: 0, updatedAt: new Date(Date.now() - 7200000).toISOString() }];

const WORK_USER = { emailAddresses: [{ emailAddress: "r@wipro.com", verification: { status: "verified" } }] };

beforeEach(() => { authState.isSignedIn = true; (userState as { user: unknown }).user = WORK_USER; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stubAll(mine: unknown[], inboxNew: unknown[], inboxDone: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).endsWith("/mine")) return { ok: true, json: async () => ({ requests: mine }) };
    if (String(url).includes("scope=new")) return { ok: true, json: async () => ({ requests: inboxNew }) };
    if (String(url).includes("scope=completed")) return { ok: true, json: async () => ({ requests: inboxDone }) };
    return { ok: true, json: async () => ({}) };
  }));
}

describe("UnifiedInbox", () => {
  it("lists asking threads with unread state linking to the thread", async () => {
    stubAll(ASKING, [], []);
    render(<UnifiedInbox />);
    const row = await screen.findByLabelText(/wipro.com conversation/);
    expect(row.getAttribute("href")).toBe("/conversation/11");
    expect(row.textContent).toContain("2 new messages");
  });

  it("shows referring threads with hidden seeker identity, never names", async () => {
    stubAll([], REFERRING_NEW, []);
    render(<UnifiedInbox />);
    expect(await screen.findByText("Seeker · identity hidden")).toBeTruthy();
    expect(screen.getByText("Needs your decision")).toBeTruthy();
    expect(screen.queryByText("Rahul")).toBeNull();
  });

  it("filters by side and searches without inventing results", async () => {
    stubAll(ASKING, REFERRING_NEW, []);
    render(<UnifiedInbox />);
    await screen.findByText("Product Designer");
    fireEvent.click(screen.getByRole("tab", { name: "Referring" }));
    expect(screen.queryByText("Product Designer")).toBeNull();
    expect(screen.getByText("Seeker · identity hidden")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "tcs" } });
    expect(screen.getByText("No conversations yet.")).toBeTruthy();
  });

  it("renders an honest empty state pointing at explore", async () => {
    stubAll([], [], []);
    render(<UnifiedInbox />);
    expect(await screen.findByText("No conversations yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find a referrer" }).getAttribute("href")).toBe("/explore");
  });

  it("keeps the list behind sign-in", () => {
    authState.isSignedIn = false;
    render(<UnifiedInbox />);
    expect(screen.getByText("Inbox.")).toBeTruthy();
  });
});
