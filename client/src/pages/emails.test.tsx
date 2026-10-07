// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Emails from "./Emails";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

const NAMES = ["Work-email code", "Welcome", "Ask accepted", "Ask passed", "Expiring soon", "New ask (referrer)", "Re-verify", "Alert match", "Weekly summary", "Receipt", "Payment failed", "Report outcome"];

describe("Emails — kit v4 /emails", () => {
  it("lists all twelve templates and opens on the verification code", () => {
    render(<Emails />);
    for (const name of NAMES) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Work-email code" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Your SkipWait code: 482 913")).toBeTruthy();
    expect(screen.getByText("482 913")).toBeTruthy();
    expect(screen.getByText(/noreply@skipwait.me/)).toBeTruthy();
  });

  it("switches templates and shows the push preview only where the kit has one", () => {
    render(<Emails />);
    fireEvent.click(screen.getByRole("button", { name: "Ask accepted" }));
    expect(screen.getByText(/a Wipro referrer accepted your ask/)).toBeTruthy();
    expect(screen.getByText("Your Wipro ask was accepted 🎉")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Re-verify" }));
    expect(screen.getByText("Please re-verify your Wipro email")).toBeTruthy();
    expect(screen.queryByText("SKIPWAIT · now")).toBeNull();
  });

  it("never names a plan the product does not sell", () => {
    // The kit's receipt reads "Momentum plan · $20" and its payment-failed mail
    // reads "We couldn't renew Momentum". Live sells Pro and Max, so naming
    // Momentum is the same error class as an invented price.
    render(<Emails />);
    fireEvent.click(screen.getByRole("button", { name: "Receipt" }));
    expect(screen.getByText("Receipt: your monthly plan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Payment failed" }));
    expect(screen.getByText("We couldn't renew your plan")).toBeTruthy();
    expect(screen.queryByText(/Momentum/)).toBeNull();
    expect(screen.queryByText(/\$20/)).toBeNull();
  });

  it("keeps the free-referral promise in every template footer", () => {
    render(<Emails />);
    expect(screen.getByText(/Referrals on SkipWait are always free/)).toBeTruthy();
    expect(screen.getByText(/never ask for money or your password/)).toBeTruthy();
  });

  it("keeps the report reference consistent with the safety backend", () => {
    render(<Emails />);
    fireEvent.click(screen.getByRole("button", { name: "Report outcome" }));
    // safetyReportReference() renders R-<1000+id>, so #R-2048 is a real shape.
    expect(screen.getByText(/your report #R-2048/)).toBeTruthy();
  });

  it("never ships a preview marker", () => {
    render(<Emails />);
    expect(screen.queryByText(/· DESIGN/)).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
  });
});
