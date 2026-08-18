// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZeroActivityShareCard } from "./ZeroActivityShareCard";

vi.mock("sonner", () => ({ toast: vi.fn() }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ZeroActivityShareCard", () => {
  it("gives a Job Seeker a truthful, one-person ask instead of a dead end", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<ZeroActivityShareCard audience="job_seeker" />);
    expect(screen.getByText(/Know one person who may have a useful lead/i)).toBeTruthy();
    expect(screen.getByText(/do not need to ask them to join skipwait.me/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Share job_seeker zero-activity message on WhatsApp" }));
    expect(open).toHaveBeenCalledWith(expect.stringContaining("wa.me/?text="), "_blank", "noopener,noreferrer");
  });

  it("gives a Referrer a voluntary availability message without promising a referral", () => {
    render(<ZeroActivityShareCard audience="referrer" />);
    expect(screen.getByText(/Know one person who may need a referral/i)).toBeTruthy();
    expect(screen.getByText(/always decide whether to help/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share referrer zero-activity message by email" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share referrer zero-activity message on LinkedIn" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share referrer zero-activity message on X" })).toBeTruthy();
  });
});
