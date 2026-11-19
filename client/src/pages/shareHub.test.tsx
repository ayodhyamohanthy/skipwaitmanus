// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShareHub from "./ShareHub";
import "./goal/seeker-small/GoalShareHub";

const { authState, go } = vi.hoisted(() => ({ authState: { isLoaded: true, isSignedIn: true }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState }));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/share", go] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

describe("ShareHub personal invites", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); go.mockClear(); authState.isSignedIn = true; });

  it("shows one personal link, reward-safe copy, email invite, and requested social share actions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ invite: { inviteCode: "r7-abcdef12" } }) })));
    render(<ShareHub />);
    await waitFor(() => expect(screen.getByText(/start\?invite=r7-abcdef12/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(screen.getByLabelText("Friend email")).toBeTruthy();
    expect(screen.getByText("Invite")).toBeTruthy();
    expect(screen.getByRole("button", { name: "X" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Facebook" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "LinkedIn" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Telegram" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Medium" })).toBeTruthy();
    expect(screen.getByText(/Self-invites and duplicate accounts are not eligible/i)).toBeTruthy();
  });

  it("shows the Unavailable state with the exact unlock line before the first paid invoice (D-155)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ invite: null, locked: true }) })));
    render(<ShareHub />);
    await screen.findByText("Referrals unlock after your first paid invoice. Once you've made a payment, come back here to get your referral link.");
    expect(screen.getByText("Referrals unlock after your first paid invoice. Once you've made a payment, come back here to get your referral link.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(screen.queryByLabelText("Friend email")).toBeNull();
    expect(screen.queryByRole("button", { name: "X" })).toBeNull();
  });

  it("treats a legacy response without the locked flag as unlocked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ invite: { inviteCode: "r9-legacy99" } }) })));
    render(<ShareHub />);
    await waitFor(() => expect(screen.getByText(/start\?invite=r9-legacy99/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Copy link" }).getAttribute("aria-disabled")).not.toBe("true");
  });

  it("opens a native prefilled mailto invite only after a valid recipient email is entered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ invite: { inviteCode: "r7-abcdef12" } }) })));
    render(<ShareHub />);
    await waitFor(() => expect(screen.getByText(/start\?invite=r7-abcdef12/i)).toBeTruthy());
    expect(screen.queryByRole("link", { name: "Invite" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Friend email"), { target: { value: "friend@example.com" } });
    const invite = screen.getByRole("link", { name: "Invite" });
    expect(invite.getAttribute("href")).toContain("mailto:friend@example.com?subject=");
    expect(invite.getAttribute("href")).toContain("start%3Finvite%3Dr7-abcdef12");
  });

  it("asks a signed-out visitor to sign in before creating a personal link", async () => {
    authState.isSignedIn = false;
    render(<ShareHub />);
    expect(await screen.findByText("Create your invite link.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeTruthy();
  });

  it("shows an inline retryable error when the personal invite link fails to load", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      attempts += 1;
      return attempts === 1 ? { ok: false, status: 503, json: async () => ({ error: "temporarily unavailable" }) } : { ok: true, json: async () => ({ invite: { inviteCode: "r7-abcdef12" } }) };
    }));
    render(<ShareHub />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("temporarily unavailable");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText(/start\?invite=r7-abcdef12/i)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(attempts).toBe(2);
  });

  it("shows a usable sign-in state instead of an unbounded loading shell while authentication initializes", async () => {
    authState.isLoaded = false;
    authState.isSignedIn = false;
    render(<ShareHub />);
    expect(await screen.findByText("Create your invite link.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeTruthy();
    expect(screen.queryByText("Preparing your invite…")).toBeNull();
    authState.isLoaded = true;
  });
});
