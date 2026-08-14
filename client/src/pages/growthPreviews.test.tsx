// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpportunityPostPreview, OpportunityWallPreview, RequestSharePreview } from "./GrowthPreviews";

vi.mock("sonner", () => ({ toast: vi.fn() }));

afterEach(() => cleanup());

describe("growth-feature design previews", () => {
  it("keeps employee identity private on the public Opportunity Wall preview", () => {
    render(<OpportunityWallPreview />);
    expect(screen.getByText("Find an opening. Keep the people behind it private.")).toBeTruthy();
    expect(screen.getByText(/No employee names, emails, or public profiles appear here/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /use product designer opportunity/i })).toBeTruthy();
  });

  it("shows the employee post as a compact hiring-or-walk-in composer", () => {
    render(<OpportunityPostPreview />);
    expect(screen.getByRole("button", { name: "Hiring now" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    expect(screen.getByLabelText("Date")).toBeTruthy();
    expect(screen.getByText(/secure sign-in and work-email verification wait until Publish/i)).toBeTruthy();
  });

  it("keeps the company share card invitation separate from private candidate materials", () => {
    render(<RequestSharePreview />);
    expect(screen.getByText("Know someone at Company X?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /WhatsApp/i })).toBeTruthy();
    expect(screen.getByText(/does not reveal the candidate, role documents, or request details/i)).toBeTruthy();
  });
});
