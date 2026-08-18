// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZeroActivityShareCard } from "./ZeroActivityShareCard";

vi.mock("sonner", () => ({ toast: vi.fn() }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ZeroActivityShareCard", () => {
  it("gives a Job Seeker one visual sharing handoff instead of empty-state copy", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<ZeroActivityShareCard audience="job_seeker" />);
    expect(screen.getByRole("button", { name: "Share with someone who can help" })).toBeTruthy();
    expect(screen.queryByText(/trusted person/i)).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Share with someone who can help" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it("gives a Referrer one visual availability handoff without promising a referral", () => {
    render(<ZeroActivityShareCard audience="referrer" />);
    expect(screen.getByRole("button", { name: "Share with a job seeker" })).toBeTruthy();
    expect(screen.queryByText(/always choose/i)).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
