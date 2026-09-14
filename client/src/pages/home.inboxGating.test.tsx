// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const { go } = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock("wouter", () => ({
  useLocation: () => ["/", go],
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

let mockedUser: { emailAddresses: Array<{ emailAddress: string; verification: { status: string } }> } | null = null;

vi.mock("@/_core/auth", () => ({
  SignedIn: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SignedOut: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useUser: () => ({ user: mockedUser }),
}));

afterEach(() => { cleanup(); mockedUser = null; });

describe("signed-in company inbox entry", () => {
  it("shows My company inbox only for a verified work email", () => {
    mockedUser = { emailAddresses: [{ emailAddress: "priya@acme.com", verification: { status: "verified" } }] };
    const { unmount } = render(<Home />);
    expect(screen.getByRole("button", { name: /My company inbox/i })).toBeTruthy();
    unmount();

    mockedUser = { emailAddresses: [{ emailAddress: "seeker@gmail.com", verification: { status: "verified" } }] };
    render(<Home />);
    expect(screen.queryByRole("button", { name: /My company inbox/i })).toBeNull();
  });

  it("hides My company inbox when the company email is unverified", () => {
    mockedUser = { emailAddresses: [{ emailAddress: "priya@acme.com", verification: { status: "unverified" } }] };
    render(<Home />);
    expect(screen.queryByRole("button", { name: /My company inbox/i })).toBeNull();
  });
});
