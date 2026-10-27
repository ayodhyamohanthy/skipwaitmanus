// @vitest-environment jsdom
// The harness proves itself here: a surface renders inside the real
// GoalAppShell with the network impossible (D-048 phase 3, F-harness row).
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  goalHarnessFetch,
  goalHarnessNetwork,
  renderGoalSurface,
  resetGoalHarness,
} from "./goalShellHarness";

beforeEach(() => resetGoalHarness());
afterEach(() => cleanup());

describe("goal shell harness", () => {
  it("renders a surface inside GoalAppShell and fetch is never called", async () => {
    await renderGoalSurface(<p>Surface body</p>, { signedIn: true });
    expect(goalHarnessFetch).not.toHaveBeenCalled();
    const shell = screen.getByTestId("goal-shell");
    expect(within(shell).getByText("Surface body")).toBeTruthy();
  });

  it("shows the persona's credit count to a seeker", async () => {
    await renderGoalSurface(<p>Body</p>, { signedIn: true, credits: 7 });
    expect(goalHarnessFetch).not.toHaveBeenCalled();
    // The pill renders once in the rail and once in the bar; both carry the count.
    for (const pill of screen.getAllByTestId("goal-credits-pill")) {
      expect(pill.getAttribute("aria-label")).toContain("7 referrals");
    }
  });

  it("shows no credits pill to a verified referrer (D-055)", async () => {
    await renderGoalSurface(<p>Body</p>, { signedIn: true, referrer: "verified", credits: 7 });
    expect(goalHarnessFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("goal-credits-pill")).toBeNull();
  });

  it("surfaces a balance error that says so and never shows 0", async () => {
    await renderGoalSurface(<p>Body</p>, { signedIn: true, credits: "error" });
    for (const pill of screen.getAllByTestId("goal-credits-pill")) {
      expect(pill.textContent).toContain("Retry");
      expect(pill.textContent).not.toMatch(/0/);
    }
  });

  it("makes the network impossible by default and records registered answers", async () => {
    await expect(goalHarnessFetch("/api/anything")).rejects.toThrow("unexpected network call");
    goalHarnessNetwork(url => (url.includes("/api/rows") ? { rows: [] } : { __status: 404, error: "no" }));
    const ok = await goalHarnessFetch("/api/rows");
    expect(await ok.json()).toEqual({ rows: [] });
    const missing = await goalHarnessFetch("/api/missing");
    expect(missing.ok).toBe(false);
    expect(goalHarnessFetch).toHaveBeenCalledTimes(3);
  });
});
