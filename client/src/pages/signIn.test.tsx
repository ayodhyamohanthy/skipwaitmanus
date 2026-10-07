// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignIn from "./SignIn";

const { openSignIn } = vi.hoisted(() => ({ openSignIn: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ openSignIn }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeEach(() => openSignIn.mockReset());
afterEach(cleanup);

describe("SignIn — kit v4 /sign-in", () => {
  it("renders the designed heading, intent switch and both methods", () => {
    render(<SignIn />);
    expect(screen.getByText("Welcome to SkipWait.")).toBeTruthy();
    expect(screen.getByText(/One sign-in/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Find a referral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Give a referral/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue with email/ })).toBeTruthy();
  });

  it("delegates credentials to WorkOS and never collects a password", () => {
    // D3 boundary. The kit's preview shipped a local email + password form and
    // a "Forgot password?" link. WorkOS AuthKit owns credentials here, so a
    // second credential surface must not exist on this page.
    const { container } = render(<SignIn />);
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByText(/Forgot password/i)).toBeNull();
  });

  it("never ships the design-preview stop state", () => {
    render(<SignIn />);
    expect(screen.queryByText(/That's the whole flow/)).toBeNull();
    expect(screen.queryByText(/design preview/i)).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW/)).toBeNull();
  });

  it("sends every entry point into the real sign-in", () => {
    render(<SignIn />);
    for (const name of [/Continue with Google/, /Continue with email/, /Create a free account/]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(openSignIn).toHaveBeenCalledTimes(3);
  });

  it("changes the context line with the chosen intent", () => {
    render(<SignIn />);
    expect(screen.getByText(/Explore companies and send a thoughtful request/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.getByText(/Choose who you help and keep your identity private/)).toBeTruthy();
  });

  it("links the terms and privacy it asks the user to accept", () => {
    render(<SignIn />);
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
  });
});
