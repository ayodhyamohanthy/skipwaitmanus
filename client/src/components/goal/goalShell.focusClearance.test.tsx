// @vitest-environment jsdom
// Packet SHELL-focus-clearance (#642): a focused field on a phone is never hidden
// behind the sticky bottom bar. The shell marks the bar with data-goal-bottom-bar
// and index.css adds scroll-padding-bottom scoped to html:has([data-goal-bottom-bar]).
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, describe, expect, it } from "vitest";
import { GoalShell } from "./GoalShell";

afterEach(cleanup);

const SHELL_PROPS = {
  active: "queue" as const,
  pageTitle: "Referral queue",
  credits: null,
  account: { initials: "AB" },
  alertsHref: "/alerts",
};

function renderInRouter(ui: ReactElement) {
  const location = memoryLocation({ path: "/queue", record: true });
  render(<Router hook={location.hook} searchHook={location.searchHook}>{ui}</Router>);
  return location;
}

describe("GoalShell focus clearance (#642)", () => {
  it("marks the phone bottom bar with data-goal-bottom-bar", () => {
    renderInRouter(<GoalShell {...SHELL_PROPS} verifiedReferrer><p>content</p></GoalShell>);
    const primaryNavs = screen.getAllByRole("navigation", { name: /primary/i });
    expect(primaryNavs.some(nav => nav.hasAttribute("data-goal-bottom-bar"))).toBe(true);
  });

  it("marks nothing when the bottom bar is hidden", () => {
    renderInRouter(<GoalShell {...SHELL_PROPS} verifiedReferrer hideBottomBar><p>content</p></GoalShell>);
    expect(document.querySelector("[data-goal-bottom-bar]")).toBeNull();
  });

  it("scopes a scroll-padding-bottom rule to html:has([data-goal-bottom-bar]) in the phone media query", () => {
    const css = readFileSync(join(__dirname, "..", "..", "index.css"), "utf8");
    const media = css.match(/@media\s*\(width\s*<\s*40\.0625rem\)\s*\{([\s\S]*?)\n\}/);
    expect(media, "a (width < 40.0625rem) media query").toBeTruthy();
    expect(media![1]).toMatch(/html:has\(\[data-goal-bottom-bar\]\)\s*\{[^}]*scroll-padding-bottom:/);
  });
});
