// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

vi.mock("@/_core/auth", () => ({ SignedIn: ({ children }: { children?: React.ReactNode }) => null, SignedOut: ({ children }: { children?: React.ReactNode }) => children, useUser: () => ({ user: null }) }));

afterEach(() => cleanup());

describe("landing discovery entry", () => {
  it("keeps a concise public path to browse shared opportunities alongside the core role choices", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Internal openings$/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sign in/i })).toBeNull();
    expect(screen.queryByText(/Use saved device sign-in/i)).toBeNull();
  });
});
