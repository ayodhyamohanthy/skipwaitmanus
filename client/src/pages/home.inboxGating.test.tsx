// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const { go, signedIn } = vi.hoisted(() => ({ go: vi.fn(), signedIn: { value: false } }));

vi.mock("wouter", () => ({
  useLocation: () => ["/", go],
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

vi.mock("@/_core/auth", () => ({
  SignedIn: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SignedOut: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ isSignedIn: signedIn.value }),
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

afterEach(() => { cleanup(); go.mockReset(); });

describe("homepage profile entries", () => {
  it("surfaces the signed-in workspace next to the main referral actions", () => {
    signedIn.value = true;
    render(<Home />);

    expect(screen.getByRole("navigation", { name: "Your workspace" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "My requests" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "My company inbox" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Internal openings" })).toBeTruthy();
    signedIn.value = false;
  });

  it("keeps workspace links off the landing page when signed out", () => {
    render(<Home />);

    // Signed-out visitors use the public role cards; the signed-in workspace
    // appears only after sign-in.
    expect(screen.queryByRole("navigation", { name: "Your workspace" })).toBeNull();
    expect(screen.queryByRole("button", { name: /My requests/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /My company inbox/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Internal openings/i })).toBeNull();
  });

  it("keeps the two role entry points routing to their flows", () => {
    render(<Home />);

    expect(screen.getAllByRole("link", { name: /Become a referrer/ }).every(link => link.getAttribute("href") === "/referrer")).toBe(true);
    expect(screen.getAllByRole("link", { name: /Explore companies/ })[0].getAttribute("href")).toBe("/explore");
  });
});
