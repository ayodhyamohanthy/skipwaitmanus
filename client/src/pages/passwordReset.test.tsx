// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

describe("password reset — WorkOS owns the credential", () => {
  it("never claims to send an email it cannot send", () => {
    // The kit's /forgot-password reports "a reset link is on its way" from a
    // local form. This app has no reset route -- the server exposes only
    // /api/auth/workos/sign-in, /callback, /admin and /logout.
    render(<ForgotPassword />);
    expect(screen.queryByText(/reset link is on its way/i)).toBeNull();
    expect(screen.queryByText(/Check your email/i)).toBeNull();
    expect(screen.queryByLabelText(/Email/i)).toBeNull();
  });

  it("routes the person to the flow that actually works", () => {
    render(<ForgotPassword />);
    expect(screen.getByRole("link", { name: /Continue to reset/ }).getAttribute("href")).toBe("/api/auth/workos/sign-in");
  });

  it("never renders the kit's client-side password rule checklist", () => {
    // A policy that exists only in the browser enforces nothing a server
    // agreed to, and WorkOS is the one that owns the rule.
    render(<ResetPassword />);
    expect(screen.queryByText(/At least 10 characters/)).toBeNull();
    expect(screen.queryByText(/Passwords match/)).toBeNull();
    expect(screen.queryByLabelText(/New password/i)).toBeNull();
    expect(screen.queryByLabelText(/Confirm password/i)).toBeNull();
  });

  it("never renders the kit's preview state switcher", () => {
    render(<ResetPassword />);
    expect(screen.queryByRole("button", { name: "Valid link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Expired link" })).toBeNull();
  });

  it("never reports a password update it did not perform", () => {
    render(<ResetPassword />);
    expect(screen.queryByText(/Password updated/)).toBeNull();
    expect(screen.queryByText(/You're signed in/)).toBeNull();
  });

  it("states where the credential lives, on both screens", () => {
    render(<ForgotPassword />);
    expect(screen.getByText(/SkipWait never sees your password/)).toBeTruthy();
    cleanup();
    render(<ResetPassword />);
    expect(screen.getByText(/WorkOS, which holds your credential/)).toBeTruthy();
  });

  it("gives the expired-link path somewhere to go", () => {
    render(<ResetPassword />);
    expect(screen.getByRole("link", { name: /Send a new link/ }).getAttribute("href")).toBe("/forgot-password");
  });

  it("never ships a design-preview banner", () => {
    render(<ForgotPassword />);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
    cleanup();
    render(<ResetPassword />);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
  });
});
