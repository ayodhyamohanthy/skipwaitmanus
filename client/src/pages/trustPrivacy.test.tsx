// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TrustPrivacy from "./TrustPrivacy";

describe("TrustPrivacy", () => {
  it("explains private referral safeguards and links users to their account controls", () => {
    render(<TrustPrivacy />);
    expect(screen.getByRole("heading", { name: /private handoff/i })).toBeTruthy();
    expect(screen.getByText(/Conversation opens after acceptance/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /open privacy controls/i }).getAttribute("href")).toBe("/settings");
  });
});
