// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

vi.mock("@/_core/auth", () => ({
  SignedIn: ({ children }: { children?: React.ReactNode }) => null,
  SignedOut: ({ children }: { children?: React.ReactNode }) => children,
  useAuth: () => ({ isSignedIn: false }),
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

afterEach(() => cleanup());

describe("landing discovery entry", () => {
  it("keeps the mobile menu on public entries while workspace links stay signed-in only", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const nav = screen.getByRole("navigation", { name: "Website navigation" });
    expect(within(nav).getByText("Explore companies")).toBeTruthy();
    expect(within(nav).getByText("For referrers")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /My requests/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /My company inbox/i })).toBeNull();
  });
});
