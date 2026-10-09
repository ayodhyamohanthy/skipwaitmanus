// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Kit v4 launch composition (owner order, Oct 2026): door hero, trust strip,
// launch companies, three-step journey, referrer band, privacy, FAQ, final
// CTA. These assertions pin the composition and its honesty rules — free
// positioning with no fabricated people, counts, or outcomes.
describe("landing kit composition", () => {
  it("leads with the product headline and a brand header", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: /Free job referrals/ })).toBeTruthy();
    expect(screen.getByRole("banner").textContent).toContain("SkipWait");
  });

  it("states free referrals as assurances instead of inventing proof", () => {
    render(<Home />);
    expect(screen.getByText("Referrals are free")).toBeTruthy();
    expect(screen.getByText("Explore before signing in")).toBeTruthy();
    // No fabricated activity anywhere on the page.
    expect(document.body.textContent).not.toMatch(/candidates placed|hires|success stories|testimonials/i);
  });

  it("lists the five launch companies with links to their doors", () => {
    render(<Home />);
    const section = screen.getByText("Start somewhere real.").closest("section") as HTMLElement;
    for (const [name, slug] of [["SkipWait", "skipwait"], ["Wipro", "wipro"], ["Go Neutrinos", "go-neutrinos"], ["TCS", "tcs"], ["Merkle", "merkle"]]) {
      const link = within(section).getByText(name).closest("a");
      expect(link?.getAttribute("href")).toBe(`/explore/${slug}`);
    }
    expect(screen.getByRole("link", { name: /Explore all open doors/ }).getAttribute("href")).toBe("/explore");
  });

  it("numbers the three journey steps with selectable guidance", () => {
    render(<Home />);
    const journey = screen.getByRole("region", { name: "How referrals work" });
    expect(within(journey).getAllByText(/^0[123]$/)).toHaveLength(3);
    for (const title of ["Find a company", "Ask for a referral", "Connect privately"]) expect(within(journey).getByText(title)).toBeTruthy();
    const ask = within(journey).getByRole("button", { name: /Ask for a referral/ });
    expect(ask.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(ask);
    expect(ask.getAttribute("aria-pressed")).toBe("true");
    expect(ask.className).toContain("is-selected");
    expect(within(journey).getByText(/The referrer chooses whether to accept\. No payments, no paid priority\./)).toBeTruthy();
  });

  it("shows every referrer commitment, never a promise of an outcome", () => {
    render(<Home />);
    for (const commitment of ["Your name is never public.", "You choose every connection.", "No money changes hands.", "Always on your terms."]) expect(screen.getByText(commitment)).toBeTruthy();
    expect(document.body.textContent).toMatch(/not a promise of an interview/i);
  });

  it("closes with the free-forever final call to action", () => {
    render(<Home />);
    expect(screen.getByText("What’s on the other side?")).toBeTruthy();
    expect(screen.getByText("Referrals are free. Always.")).toBeTruthy();
  });
});
