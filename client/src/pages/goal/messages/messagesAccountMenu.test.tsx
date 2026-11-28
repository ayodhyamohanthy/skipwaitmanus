// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Messages from "../../Messages";

const { auth, view, signOut, clearPrivate, openSignIn, getToken } = vi.hoisted(() => ({
  auth: { loaded: true, signedIn: true as boolean | undefined },
  view: { state: "empty" },
  signOut: vi.fn(),
  clearPrivate: vi.fn(),
  openSignIn: vi.fn(),
  getToken: vi.fn(async () => "test-token"),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: auth.loaded, isSignedIn: auth.signedIn, getToken, openSignIn, signOut }),
  useUser: () => ({ user: auth.signedIn ? { fullName: "Demo Seeker", imageUrl: null, primaryEmailAddress: { emailAddress: "seeker@example.test" } } : null }),
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("@/hooks/useCreditBalance", () => ({ useCreditBalance: () => null }));
vi.mock("@/components/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/lib/logoutPrivacy", () => ({ clearPrivateReferralBrowserData: clearPrivate }));
vi.mock("wouter", () => ({
  useLocation: () => ["/messages", () => undefined],
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const chat = { counterpartUserId: 33, counterpartLabel: "Member at demo", lastMessageBody: "Hello", lastMessageIsMine: false, lastMessageAt: "2026-11-28T00:00:00Z", unreadCount: 1 };
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn(async (url: string) => {
  if (url === "/api/dms/threads") {
    if (view.state === "loading") return new Promise<Response>(() => {});
    if (view.state === "failed") return response({ error: "Chats are unavailable" }, 500);
    return response({ threads: view.state === "chat" ? [chat] : [] });
  }
  if (url === "/api/dms/threads/33") return response({ thread: { counterpartUserId: 33, counterpartLabel: chat.counterpartLabel, messages: [] } });
  throw new Error(`Unexpected request: ${url}`);
});

beforeEach(() => {
  auth.loaded = true; auth.signedIn = true; view.state = "empty";
  signOut.mockReset(); signOut.mockResolvedValue(undefined);
  clearPrivate.mockReset(); clearPrivate.mockResolvedValue(undefined);
  openSignIn.mockReset(); getToken.mockClear(); fetchMock.mockClear();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.sessionStorage.clear(); });

async function openMenu() {
  const trigger = screen.getAllByRole("button", { name: "Account menu" })[0];
  trigger.focus();
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  expect(await screen.findByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  return trigger;
}

describe("Messages shared account menu", () => {
  it.each(["loading", "empty", "failed", "offline", "chat"])("keeps the menu usable in the %s state", async state => {
    view.state = state;
    if (state === "offline") Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    render(<Messages />);
    if (state === "loading") await screen.findByText("Loading your chats…");
    else if (state === "failed") await screen.findByText("Chats are unavailable");
    else if (state === "chat") {
      fireEvent.click(within(await screen.findByRole("list", { name: "Chats" })).getByRole("button", { name: /Member at demo/ }));
      await screen.findByLabelText("Message");
    } else await screen.findByText("No chats yet.");
    expect(screen.getAllByRole("main")).toHaveLength(1);

    const trigger = await openMenu();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(signOut).not.toHaveBeenCalled();
    expect(clearPrivate).not.toHaveBeenCalled();
  });

  it("clears private browser data before signing out once", async () => {
    render(<Messages />);
    await screen.findByText("No chats yet.");
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(clearPrivate).toHaveBeenCalledTimes(1);
    expect(clearPrivate.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });

  it.each([false, undefined])("preserves the sign-in boundary when signedIn is %s", signedIn => {
    auth.loaded = signedIn === false; auth.signedIn = signedIn;
    render(<Messages />);
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(openSignIn.mock.calls).toEqual([[]]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
  });
});
