// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyCompanyInbox from "./MyCompanyInbox";

const { go } = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: false, getToken: vi.fn() }),
  useUser: () => ({ user: undefined }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/inbox", go],
}));

afterEach(() => { cleanup(); go.mockClear(); });

describe("My Company Inbox employee access", () => {
  it("routes signed-out employees to the dedicated work-email-only sign-in flow", () => {
    render(<MyCompanyInbox />);
    expect(screen.getByRole("button", { name: "Use company email" })).toBeTruthy();
    expect(screen.queryByText("Secure employee sign in")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use company email" }));
    expect(go).toHaveBeenCalledWith("/referrer");
  });
});
