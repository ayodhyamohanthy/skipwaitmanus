// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

vi.mock("@/_core/auth", () => ({ SignedIn: ({ children }: { children?: React.ReactNode }) => null, SignedOut: ({ children }: { children?: React.ReactNode }) => children, useUser: () => ({ user: null }) }));

afterEach(() => cleanup());

describe("landing discovery entry", () => {
  it("keeps the mobile menu to public entries while workspace links live in the account menu", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Internal openings$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /My requests/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /My company inbox/i })).toBeNull();
    expect(screen.getByRole("button", { name: "I give referrals" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sign in/i })).toBeNull();
    expect(screen.queryByText(/Use saved device sign-in/i)).toBeNull();
  });
});
