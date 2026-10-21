// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GoalClock } from "./GoalClock";

afterEach(() => { cleanup(); });

describe("GoalClock", () => {
  it("turns amber at two days or fewer and stays quiet otherwise", () => {
    const { rerender } = render(<GoalClock label="2 days left" urgent />);
    expect(screen.getByText("2 days left").className).toContain("text-g-amber");
    rerender(<GoalClock label="6 days left" />);
    expect(screen.getByText("6 days left").className).toContain("text-g-ink-3");
    expect(screen.getByText("6 days left").className).not.toContain("text-g-amber");
  });

  it("renders as a mono numeral, never as prose", () => {
    render(<GoalClock label="Expired" />);
    expect(screen.getByTestId("goal-num").textContent).toBe("Expired");
  });
});
