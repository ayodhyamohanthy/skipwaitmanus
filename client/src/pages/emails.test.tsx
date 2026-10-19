// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Emails from "./Emails";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(() => cleanup);

const NAMES = [
  "Work-email code",
  "Password reset",
  "Set your password",
  "Welcome",
  "Request claimed",
  "Ask accepted",
  "Ask passed",
  "New message",
  "Waiting for coverage",
  "Slot opened",
  "Review ready",
  "Re-verify reminder",
  "Report outcome",
  "Payment receipt / failed",
];

describe("Emails template gallery", () => {
  it("lists all fourteen templates with no fabricated live content", () => {
    const view = render(<Emails />);
    try {
      for (const name of NAMES) expect(screen.getByRole("button", { name })).toBeTruthy();
      expect(screen.queryByText(/482 913/)).toBeNull();
      expect(screen.queryByText(/Wipro|Merkle|TCS/)).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it("shows the verified work-email code subject with a masked code block", () => {
    const view = render(<Emails />);
    try {
      const article = screen.getByRole("article", { name: "Work-email code" });
      expect(article.textContent).toContain("Your skipwait.me verification code");
      expect(screen.getByRole("img", { name: "Six-digit code" }).textContent).not.toMatch(/\d/);
    } finally {
      view.unmount();
    }
  });

  it("shows exact server copy for review-ready and report-outcome templates", () => {
    const view = render(<Emails />);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Review ready" }));
      expect(screen.getByText("Private referral review at ⟨company⟩")).toBeTruthy();
      expect(screen.getByText("Open private review")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Report outcome" }));
      expect(screen.getByText("Update on your report")).toBeTruthy();
      expect(screen.getByText(/took action. Thank you for flagging it/)).toBeTruthy();
    } finally {
      view.unmount();
    }
  });

  // D-049 / D-078 rulings 2 and 6: SkipWait sends the seeker's password links itself, to its own reset page, and
  // there is no sign-up code. The page quotes the server copy (shared/passwordEmails.ts) with the link masked.
  it("quotes the password-link emails SkipWait sends, with no code and no fixed lifetime", () => {
    const view = render(<Emails />);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Password reset" }));
      const reset = screen.getByRole("article", { name: "Password reset" });
      expect(reset.textContent).toContain("Set or reset your SkipWait password");
      expect(reset.textContent).toContain("⟨reset link⟩");
      expect(reset.textContent).not.toMatch(/1 hour|WorkOS \(our sign-in provider\)/);
      fireEvent.click(screen.getByRole("button", { name: "Set your password" }));
      const set = screen.getByRole("article", { name: "Set your password" });
      expect(set.textContent).toContain("Finish signing in to SkipWait");
      expect(set.textContent).toContain("⟨reset link⟩");
      expect(screen.queryByRole("button", { name: "Sign-up verification code" })).toBeNull();
    } finally {
      view.unmount();
    }
  });
});
