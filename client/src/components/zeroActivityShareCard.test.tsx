// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZeroActivityShareCard } from "./ZeroActivityShareCard";

vi.mock("sonner", () => ({ toast: vi.fn() }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ZeroActivityShareCard", () => {
  it("gives a Job Seeker one crisp sharing handoff instead of a dead end", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<ZeroActivityShareCard audience="job_seeker" />);
    expect(screen.getByText("Ask one trusted person.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share job_seeker zero-activity message" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Share job_seeker zero-activity message" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it("gives a Referrer one voluntary availability handoff without promising a referral", () => {
    render(<ZeroActivityShareCard audience="referrer" />);
    expect(screen.getByText("Share when it is relevant.")).toBeTruthy();
    expect(screen.getByText("You always choose whether to help.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share referrer zero-activity message" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
