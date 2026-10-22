// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GoalLandingV9 from "./GoalLandingV9";

afterEach(cleanup);

describe("GoalLandingV9", () => {
  it("mounts the cookie consent banner when no choice is stored", () => {
    window.localStorage.removeItem("skipwait:cookie-consent");
    render(<GoalLandingV9 />);
    expect(screen.getByRole("dialog", { name: /cookie choices/i })).toBeTruthy();
  });
});
