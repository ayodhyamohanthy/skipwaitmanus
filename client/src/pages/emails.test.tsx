// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Emails from "./Emails";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

beforeAll(async () => { await import("./goal/system/GoalEmails"); });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NAMES = [
  "Work-email code",
  "Password reset",
  "Welcome",
  "Request claimed",
  "Referral accepted",
  "Referral passed",
  "New message",
  "Waiting for coverage",
  "Slot opened",
  "Review ready",
  "Re-verify reminder",
  "Report outcome",
  "Payment receipt / failed",
];

describe("Public Emails template gallery", () => {
  it("lets readers browse all thirteen templates in order without fetching or sending", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("The reference gallery must not fetch"));
    const send = vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {
      throw new Error("The reference gallery must not send");
    });
    render(<Emails />);
    const templates = within(await screen.findByRole("navigation", { name: "Templates" }));
    const buttons = templates.getAllByRole("button");
    expect(buttons.map(button => button.textContent)).toEqual(NAMES);
    expect(templates.getByRole("button", { pressed: true }).textContent).toBe(NAMES[0]);

    for (const name of NAMES) {
      const button = templates.getByRole("button", { name });
      fireEvent.click(button);
      expect(templates.getAllByRole("button", { pressed: true })).toEqual([button]);
      const article = screen.getByRole("article", { name });
      expect(screen.getAllByRole("article")).toEqual([article]);
      expect(within(article).queryByRole("button")).toBeNull();
      expect(within(article).queryByRole("link")).toBeNull();
    }

    expect(fetch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps code previews masked and switches email templates to in-app messages", async () => {
    render(<Emails />);
    const article = await screen.findByRole("article", { name: "Work-email code" });
    expect(article.textContent).toContain("Your skipwait.me verification code");
    expect(article.textContent).toContain("skipwait.me <noreply@skipwait.me>");
    expect(article.textContent).toMatch(/6 digits/i);
    expect(article.textContent).toMatch(/10-minute expiry/i);
    expect(article.textContent).toMatch(/5 attempts/i);
    const code = within(article).getByRole("img", { name: "Six-digit code" });
    expect(code.textContent).not.toMatch(/\d/);

    fireEvent.click(screen.getByRole("button", { name: "Referral passed" }));
    const passed = screen.getByRole("article", { name: "Referral passed" });
    expect(screen.queryByRole("article", { name: "Work-email code" })).toBeNull();
    expect(passed.textContent).toContain("skipwait.me <noreply@skipwait.me>");
    expect(passed.textContent).toMatch(/request stays active for other employees/i);
    expect(within(passed).getByText("Find another referrer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New message" }));
    const message = screen.getByRole("article", { name: "New message" });
    expect(screen.queryByRole("article", { name: "Referral passed" })).toBeNull();
    expect(message.textContent).toMatch(/in-app:/i);
    expect(message.textContent).not.toContain("noreply@skipwait.me");
    expect(message.textContent).toMatch(/private message arrives in an accepted conversation/i);
    expect(screen.queryByRole("img", { name: "Six-digit code" })).toBeNull();
  });

  it("shows private-review safeguards and the report outcome with its in-app notification", async () => {
    render(<Emails />);
    fireEvent.click(await screen.findByRole("button", { name: "Review ready" }));
    const review = screen.getByRole("article", { name: "Review ready" });
    expect(review.textContent).toContain("Private referral review at ⟨company⟩");
    expect(review.textContent).toMatch(/reviewing is optional and never costs you anything/i);
    expect(review.textContent).toMatch(/sign in with your verified company email before any decision is recorded/i);
    expect(review.textContent).toMatch(/opening this link never records a decision/i);
    expect(within(review).getByText("Open private review")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Report outcome" }));
    expect(screen.queryByRole("article", { name: "Review ready" })).toBeNull();
    const report = screen.getByRole("article", { name: "Report outcome" });
    expect(report.textContent).toMatch(/in-app:/i);
    expect(report.textContent).not.toContain("noreply@skipwait.me");
    expect(report.textContent).toMatch(/safety team reviewed your report and took action/i);
    const notification = screen.getByText("Update on your report");
    expect(report.contains(notification)).toBe(false);
    expect(screen.queryByText("Open private review")).toBeNull();
    expect(screen.queryByRole("img", { name: "Six-digit code" })).toBeNull();
  });
});
