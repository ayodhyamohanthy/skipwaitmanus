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

afterEach(() => cleanup());

describe("landing discovery entry", () => {
  it("keeps the mobile menu to public entries while workspace links live in the account menu", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Internal openings$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /My requests/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /My company inbox/i })).toBeNull();
    const menu = within(screen.getByRole("dialog", { name: "Menu" }));
    expect(menu.getByText("How it works")).toBeTruthy();
    expect(menu.getByText("Privacy")).toBeTruthy();
    expect(menu.getByRole("button", { name: /Sign in/i })).toBeTruthy();
    expect(screen.queryByText(/Use saved device sign-in/i)).toBeNull();
  });
});
