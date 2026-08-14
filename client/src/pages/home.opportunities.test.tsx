// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: false }), useUser: () => ({ isLoaded: true, user: null }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));

afterEach(() => cleanup());

describe("landing discovery entry", () => {
  it("keeps a concise public path to browse shared opportunities alongside the core role choices", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /^Explore employee-shared openings$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Employee-shared openings$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sign in/i })).toBeTruthy();
    expect(screen.queryByText(/Use saved device sign-in/i)).toBeNull();
  });
});
