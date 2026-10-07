// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Safety from "./Safety";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

describe("Safety — kit v4 /safety", () => {
  it("renders the designed heading and every trust answer", () => {
    render(<Safety />);
    expect(screen.getByText(/Help & safety/)).toBeTruthy();
    expect(screen.getByText(/Clear boundaries\. Real people\./)).toBeTruthy();
    for (const question of ["Are referrals really free?", "Who can see a referrer's name?", "Does a referral guarantee an interview?", "What does work-email verification mean?", "When is my resume shared?", "What if someone asks me to pay?"]) {
      expect(screen.getByText(question)).toBeTruthy();
    }
  });

  it("points a payment request at the reporting flow instead of disclaiming it", () => {
    // The kit's preview copy says reporting "must be connected before launch".
    // Shipping that sentence now would tell users a working safety channel
    // does not exist, so the page must not carry it.
    render(<Safety />);
    expect(screen.queryByText(/must be connected before/i)).toBeNull();
    expect(screen.getByText(/report it/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Report something/ }).getAttribute("href")).toBe("/report");
  });

  it("never ships the design-preview footnote", () => {
    render(<Safety />);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
    expect(screen.queryByText(/APPROVED LEGAL POLICIES/i)).toBeNull();
  });
});
