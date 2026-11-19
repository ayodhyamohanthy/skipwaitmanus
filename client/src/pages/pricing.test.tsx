// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Pricing from "./Pricing";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLocation: () => ["/pricing"],
}));

describe("Pricing (D-095 item 4)", () => {
  it("a signed-out reader gets a call to action", () => {
    render(<Pricing />);
    const cta = screen.getByRole("link", { name: /see plans and prices/i });
    expect(cta).toBeTruthy();
    expect(cta.getAttribute("href")).toBe("/plans");
  });
});
