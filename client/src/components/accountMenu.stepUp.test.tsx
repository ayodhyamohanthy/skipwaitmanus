// @vitest-environment jsdom
// D-057-session-gate (§0b.8c; red first): a server-verified referrer whose
// session is code_required keeps their navigation in the account menu — the
// surfaces themselves show the in-place step-up, never a standalone sign-in.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountMenu";

const { accessState } = vi.hoisted(() => ({
  accessState: {
    status: "code_required" as "code_required" | "verified" | "unverified",
    access: { verified: true, domain: "acme.com", companyName: "Acme", companyInitials: "AC", codeRequired: true },
  },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "12", signOut: vi.fn().mockResolvedValue(undefined) }),
  useUser: () => ({ user: { fullName: "Ada Lovelace", primaryEmailAddress: { emailAddress: "ada@gmail.com" }, imageUrl: null } }),
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => accessState }));
vi.mock("@/components/NotificationBell", () => ({ NotificationBell: () => <div data-testid="bell" /> }));
vi.mock("wouter", () => ({
  useLocation: () => ["/requests", vi.fn()],
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
}

afterEach(() => cleanup());

describe("AccountMenu with a code_required verified referrer (D-057)", () => {
  it("keeps the referrer navigation when the session needs the step-up", () => {
    accessState.status = "code_required";
    render(<AccountMenu />);
    openMenu();
    expect(screen.getByRole("menuitem", { name: "My Company Inbox" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "My impact" })).toBeTruthy();
  });

  it("never offers the standalone work-email code sign-in to a signed-in person", () => {
    accessState.status = "code_required";
    render(<AccountMenu />);
    openMenu();
    expect(screen.queryByRole("menuitem", { name: /verify|work email|sign in with/i })).toBeNull();
    expect(document.querySelector('a[href*="/api/auth/otp"], a[href*="referrer-setup"]')).toBeNull();
  });

  it("still hides the referrer navigation from an unverified account", () => {
    accessState.status = "unverified";
    render(<AccountMenu />);
    openMenu();
    expect(screen.queryByRole("menuitem", { name: "My Company Inbox" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "My impact" })).toBeNull();
  });
});
