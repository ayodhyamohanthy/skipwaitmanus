// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const { go } = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock("wouter", () => ({
  useLocation: () => ["/", go],
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

vi.mock("@/_core/auth", () => ({
  SignedIn: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SignedOut: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

afterEach(() => { cleanup(); go.mockReset(); });

describe("homepage profile entries", () => {
  it("keeps workspace links out of the homepage for signed-in users", () => {
    render(<Home />);

    // Profile destinations live in the account menu on inner pages, never on
    // the landing page.
    expect(screen.queryByRole("button", { name: /My requests/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /My company inbox/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Internal openings/i })).toBeNull();
  });

  it("keeps the two role entry points routing to their flows", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /I need a referral/i }));
    expect(go).toHaveBeenCalledWith("/start");
    fireEvent.click(screen.getByRole("button", { name: /I can refer someone/i }));
    expect(go).toHaveBeenCalledWith("/referrer");
  });
});
