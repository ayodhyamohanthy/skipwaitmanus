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
  it("lists all thirteen templates with no fabricated live content", () => {
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
});
