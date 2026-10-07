// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Guidelines from "./Guidelines";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

describe("Guidelines — kit v4 /guidelines", () => {
  it("renders every rule the kit specifies", () => {
    render(<Guidelines />);
    expect(screen.getByText(/How we treat each other here/)).toBeTruthy();
    for (const section of ["Referrals are free", "For seekers", "For referrers", "Respect", "Scams and impersonation", "What happens if rules are broken"]) {
      expect(screen.getByText(section)).toBeTruthy();
    }
  });

  it("keeps the 14-day appeal promise the safety backend actually honours", () => {
    render(<Guidelines />);
    expect(screen.getByText(/appealed within 14 days/)).toBeTruthy();
  });

  it("links the free-referral rule to the real reporting flow", () => {
    render(<Guidelines />);
    expect(screen.getByRole("link", { name: /report it/i }).getAttribute("href")).toBe("/report");
  });

  it("never ships a design-preview marker", () => {
    render(<Guidelines />);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
  });
});
