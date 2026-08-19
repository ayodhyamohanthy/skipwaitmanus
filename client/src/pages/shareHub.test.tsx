// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShareHub from "./ShareHub";

const { authState, go } = vi.hoisted(() => ({ authState: { isLoaded: true, isSignedIn: true }, go: vi.fn() }));

vi.mock("@clerk/react", () => ({ useAuth: () => authState }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <span>Account</span> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <span>skipwait.me</span> }));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/share", go] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

describe("ShareHub personal invites", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); go.mockClear(); authState.isSignedIn = true; });

  it("shows one personal link, reward-safe copy, email invite, and requested social share actions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ invite: { inviteCode: "r7-abcdef12" } }) })));
    render(<ShareHub />);
    await waitFor(() => expect(screen.getByText(/start\?invite=r7-abcdef12/i)).toBeTruthy());
    expect(screen.getByText(/You found an opportunity/i)).toBeTruthy();
    expect(screen.getByText(/you both receive one extra referral credit/i)).toBeTruthy();
    expect(screen.getByText(/Their 3 monthly credits stay included/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy personal invite link" })).toBeTruthy();
    expect(screen.getByLabelText("Friend email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invite" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share invite on X" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share invite on Facebook" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share invite on LinkedIn" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share invite on Medium" })).toBeTruthy();
    expect(screen.getByText(/Self-invites and duplicate accounts are not eligible/i)).toBeTruthy();
  });

  it("asks a signed-out visitor to sign in before creating a personal link", () => {
    authState.isSignedIn = false;
    render(<ShareHub />);
    expect(screen.getByText("Create your invite link.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeTruthy();
  });

  it("shows a visible loading shell instead of a blank page while authentication initializes", () => {
    authState.isLoaded = false;
    render(<ShareHub />);
    expect(screen.getByText("Preparing your invite…")).toBeTruthy();
    authState.isLoaded = true;
  });
});
