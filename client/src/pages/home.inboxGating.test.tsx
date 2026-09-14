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
}));

afterEach(() => { cleanup(); go.mockReset(); });

describe("signed-in quick actions", () => {
  it("shows My requests, My company inbox, and Internal openings once the user is signed in", () => {
    render(<Home />);

    const requests = screen.getByRole("button", { name: /My requests/i });
    const inbox = screen.getByRole("button", { name: /My company inbox/i });
    // The desktop header also links to Internal openings; pick the rounded
    // quick-action card like the mobile-first referral choices do.
    const openings = screen.getAllByRole("button", { name: /Internal openings/i }).find(element => element.className.includes("rounded-xl"));
    expect(openings).toBeTruthy();

    fireEvent.click(requests);
    expect(go).toHaveBeenCalledWith("/requests");
    fireEvent.click(inbox);
    expect(go).toHaveBeenCalledWith("/inbox");
    fireEvent.click(openings!);
    expect(go).toHaveBeenCalledWith("/wall");
  });
});
