// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShareHub from "./ShareHub";

vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <span>Account</span> }));

describe("ShareHub", () => {
  afterEach(() => cleanup());

  it("offers useful, voluntary invitations for both Job Seekers and Referrers without contact import language", () => {
    render(<ShareHub />);
    expect(screen.getByText("Help them arrive prepared.")).toBeTruthy();
    expect(screen.getByText("Give them control, not a public profile.")).toBeTruthy();
    expect(screen.getByText("Their benefit: 3 included referral requests")).toBeTruthy();
    expect(screen.getByText("Their benefit: a private company inbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share job_seeker invite on WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy job_seeker invite for WhatsApp Status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share job_seeker invite by email" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share referrer invite on LinkedIn" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share referrer invite on X" })).toBeTruthy();
    expect(screen.getByText(/No contact imports/i)).toBeTruthy();
    expect(screen.getByText(/Best shared with one person who is actively exploring a role/i)).toBeTruthy();
    expect(screen.getByText(/Best shared with one colleague who may want to help thoughtfully/i)).toBeTruthy();
  });
});
