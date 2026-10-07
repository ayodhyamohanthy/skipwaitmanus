// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import Home from "./Home";
import { LANDING_COMMITMENTS, LANDING_EMPLOYEE_STEPS, LANDING_H1, LANDING_SEEKER_STEPS } from "@shared/landingContent";

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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// The committed direction (surface brief, seed 1abfc6c9) is a broadcast
// scoreboard: one display headline, a wire strip of real counts, two role
// plates, numbered sequences, and the request ledger. These assertions pin the
// composition, not the styling, so a later edit cannot quietly drop a block.
describe("landing Scoreboard composition", () => {
  it("leads with the product headline and an ink masthead carrying the brand", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: LANDING_H1 })).toBeTruthy();
    expect(screen.getByRole("banner").textContent).toContain("skipwait.me");
  });

  it("states the free allowance in the wire strip instead of inventing proof", () => {
    render(<Home />);
    const strip = screen.getByRole("banner");
    expect(strip.textContent).toMatch(/3 free every month/i);
    // No fabricated activity: the strip only carries counts the product returns.
    expect(strip.textContent).not.toMatch(/candidates|placements|hires/i);
  });

  it("keeps both role plates as the first action a visitor meets", () => {
    render(<Home />);
    const plates = within(screen.getByRole("main")).getAllByRole("button", { name: /I need a referral|I can refer someone/i });
    expect(plates).toHaveLength(2);
  });

  it("numbers the seeker and employee sequences 01-03 from the shared copy", () => {
    render(<Home />);
    for (const step of [...LANDING_SEEKER_STEPS, ...LANDING_EMPLOYEE_STEPS]) expect(screen.getByText(step.title)).toBeTruthy();
    const rails = within(screen.getByRole("region", { name: "Referral steps" }));
    expect(rails.getAllByText(/^0[123]$/)).toHaveLength(6);
  });

  it("shows every commitment in the shared contract, never a promise of an outcome", () => {
    render(<Home />);
    for (const commitment of LANDING_COMMITMENTS) expect(screen.getByText(commitment.title)).toBeTruthy();
    expect(document.body.textContent).toMatch(/never guarantees an interview/i);
  });

  it("explains the referral states in the request ledger", () => {
    render(<Home />);
    for (const state of ["Posted", "Reviewed in private", "Decided"]) expect(screen.getByText(state)).toBeTruthy();
  });
});
