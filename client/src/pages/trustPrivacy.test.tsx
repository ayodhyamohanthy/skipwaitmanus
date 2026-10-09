// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TrustPrivacy from "./TrustPrivacy";

afterEach(cleanup);

describe("TrustPrivacy", () => {
  it("explains private referral safeguards and links users to their account controls", () => {
    render(<TrustPrivacy />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Privacy.");
    expect(screen.getByText(/A private handoff, not a public marketplace\./)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The short version" })).toBeTruthy();
    expect(screen.getByText(/Resumes and identities stay private/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Conversation opens after acceptance/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /open privacy controls/i }).getAttribute("href")).toBe("/settings");
  });

  it("keeps every live disclosure as a numbered section and never ships the kit draft banner", () => {
    const { container } = render(<TrustPrivacy />);
    for (const text of [
      /visible only to verified employees at the company behind the role link/,
      /available only to you and the Referrer assigned to your request/,
      /message only after the Referrer accepts that specific request/,
      /Referral decisions are always free for Referrers/,
      /referral content you submit \(job links, notes, resumes\)/,
      /never sees, touches, or stores card numbers/,
      /No advertising cookies and no cross-site tracking/,
      /kept while your account is active/,
      /Requests are reviewed rather than silently deleting records/,
      /not a substitute for jurisdiction-specific legal notices/,
    ]) expect(screen.getByText(text)).toBeTruthy();
    const anchors = Array.from(screen.getByRole("navigation", { name: "On this page" }).querySelectorAll("a"));
    expect(anchors).toHaveLength(9);
    for (const anchor of anchors) expect(container.querySelector(anchor.getAttribute("href") ?? "#missing")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Refunds & cancellation policy" }).getAttribute("href")).toBe("/refunds");
    expect(document.body.textContent).not.toMatch(/DRAFT FOR DESIGN|placeholder address/i);
  });
});
