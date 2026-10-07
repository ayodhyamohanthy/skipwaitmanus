// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppStates from "./AppStates";
import Emails from "./Emails";
import Developers from "./Developers";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/app-states"],
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("System galleries", () => {
  it("walks every app state with real install and push behavior", async () => {
    render(<AppStates />);
    expect(screen.getByText("Every edge, designed")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Payment failed" }));
    expect(screen.getByText("Payment didn't go through")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Try again/ }).getAttribute("href")).toBe("/premium");
    fireEvent.click(screen.getByRole("tab", { name: "Push permission" }));
    fireEvent.click(screen.getByRole("button", { name: "Allow push" }));
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("documents the real transactional templates, never sample mail", () => {
    render(<Emails />);
    expect(screen.getByText(/Every email we send/)).toBeTruthy();
    expect(screen.getByText("Work-email code")).toBeTruthy();
    expect(screen.getByText("Ask passed")).toBeTruthy();
    expect(screen.queryByText(/123456/)).toBeNull();
    expect(screen.queryByText(/Design Preview/i)).toBeNull();
  });

  it("states the assistant backend as pending instead of faking flows", () => {
    render(<Developers />);
    expect(screen.getByText(/Build on real referrals/)).toBeTruthy();
    expect(screen.getByText(/Availability\./)).toBeTruthy();
    expect(screen.queryByText(/Land plans/)).toBeNull();
  });
});
