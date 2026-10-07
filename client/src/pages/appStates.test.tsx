// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppStates from "./AppStates";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

const STATES = ["Install (Android)", "Install (iPhone)", "Push permission", "Offline", "Slow connection", "Not found", "Something went wrong", "Payment failed", "Loading"];

describe("AppStates — kit v4 /app-states", () => {
  it("renders every designed system state as a reachable chip", () => {
    render(<AppStates />);
    expect(screen.getByText("Every edge, designed")).toBeTruthy();
    for (const name of STATES) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Install (Android)" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the Android install sheet by default", () => {
    render(<AppStates />);
    expect(screen.getByText("Install SkipWait")).toBeTruthy();
    expect(screen.getByText(/Know the moment a referrer replies/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Install app/ })).toBeTruthy();
  });

  it("walks the iPhone add-to-home-screen steps", () => {
    render(<AppStates />);
    fireEvent.click(screen.getByRole("button", { name: "Install (iPhone)" }));
    expect(screen.getByText("Add SkipWait to your Home Screen")).toBeTruthy();
    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy();
  });

  it("moves from offline into loading on retry", () => {
    render(<AppStates />);
    fireEvent.click(screen.getByRole("button", { name: "Offline" }));
    expect(screen.getByText(/You're offline/)).toBeTruthy();
    expect(screen.getByText("No connection.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(screen.getByRole("button", { name: "Loading" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the not-found and payment states wired to real routes", () => {
    render(<AppStates />);
    fireEvent.click(screen.getByRole("button", { name: "Not found" }));
    expect(screen.getByText(/doesn't lead anywhere/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Explore companies/ }).getAttribute("href")).toBe("/explore");
    fireEvent.click(screen.getByRole("button", { name: "Payment failed" }));
    expect(screen.getByText(/Payment didn't go through/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Try another card/ }).getAttribute("href")).toBe("/plans");
    expect(screen.getByRole("button", { name: /Pay with UPI/ })).toBeTruthy();
  });

  it("never invents an error reference and never ships the preview label", () => {
    // The kit prints "Error ref: SW-5F2A" -- a hard-coded identifier an
    // operator would quote and find nothing against.
    render(<AppStates />);
    fireEvent.click(screen.getByRole("button", { name: "Something went wrong" }));
    expect(screen.queryByText(/SW-5F2A/)).toBeNull();
    expect(screen.getByText(/assigned at runtime/)).toBeTruthy();
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
  });
});
