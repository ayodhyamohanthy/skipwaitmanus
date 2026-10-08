// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Approve from "./Approve";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

describe("Approve — kit v4 /approve", () => {
  it("never renders the kit's preview state switcher", () => {
    // The kit puts a StateChips row across the top so a designer can page
    // through the six states. It is design chrome, not product.
    render(<Approve />);
    for (const label of ["Send an ask", "Spend credits", "Editing", "Slots full"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("never invents a request, a company or a credit balance", () => {
    // The kit hard-codes "Wipro", "Senior Product Designer", "req #44120",
    // "uses 1 of your 30 open slots" and "You have 112 - 109 after this".
    render(<Approve />);
    expect(screen.queryByText(/Wipro/)).toBeNull();
    expect(screen.queryByText(/req #44120/)).toBeNull();
    expect(screen.queryByText(/112/)).toBeNull();
    expect(screen.queryByText(/30 open slots/)).toBeNull();
  });

  it("shows the kit's empty state when nothing is pending", () => {
    render(<Approve />);
    expect(screen.getByText("Nothing waiting for approval")).toBeTruthy();
    expect(screen.getByText(/Nothing is sent and no credits are spent until you approve it/)).toBeTruthy();
  });

  it("states the expiry rule and where approvals surface", () => {
    render(<Approve />);
    expect(screen.getByText(/Unanswered approvals expire after 24 hours/)).toBeTruthy();
    expect(screen.getByText(/push notification and in Alerts/)).toBeTruthy();
  });

  it("links to the assistant surface rather than dead-ending", () => {
    render(<Approve />);
    expect(screen.getByRole("link", { name: /Manage assistants/ }).getAttribute("href")).toBe("/assistants");
  });

  it("never ships a design-preview banner", () => {
    render(<Approve />);
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
  });
});
