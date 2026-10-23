// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import GoalLandingV9 from "./GoalLandingV9";
import { landingSnapshot } from "../../../scripts/prerender-public-pages";
import { askCostLanding } from "@shared/moneyCopy";
import {
  GOAL_LANDING_BAND_H2,
  GOAL_LANDING_BAND_LEAD,
  GOAL_LANDING_EMPLOYEE_H2,
  GOAL_LANDING_EMPLOYEE_LEAD,
  GOAL_LANDING_H1,
  GOAL_LANDING_HERO_LEAD,
  GOAL_LANDING_QUOTE,
  goalLandingFairRules,
  goalLandingSteps,
  goalLandingTrust,
} from "@shared/landingContent";

const flat = (text: string | null) => (text ?? "").replace(/\s+/g, "");

// The prerendered snapshot is the first paint on a slow or blocked bundle
// (the 2500ms failsafe reveals it): if it shows the pre-goal landing, visitors
// watch the old page swap out - the reported flash bug. These assertions pin
// the snapshot to the copy the released goal landing (GoalLandingV9) renders.
describe("landing first paint matches the goal page (D-048-fix-landing-load-flash)", () => {
  afterEach(() => cleanup());

  it("the snapshot's hero, band, quote and employee copy are the goal landing's", () => {
    const { container } = render(<GoalLandingV9 />);
    const doc = new DOMParser().parseFromString(landingSnapshot([]), "text/html");
    const page = flat(container.textContent);
    const snap = flat(doc.querySelector("main")?.textContent ?? null);

    expect(flat(doc.querySelector("h1")?.textContent ?? null)).toBe(flat(GOAL_LANDING_H1));
    expect(flat(container.querySelector("h1")?.textContent ?? null)).toBe(flat(GOAL_LANDING_H1));
    for (const copy of [GOAL_LANDING_HERO_LEAD, GOAL_LANDING_BAND_H2, GOAL_LANDING_BAND_LEAD, GOAL_LANDING_QUOTE, GOAL_LANDING_EMPLOYEE_H2, GOAL_LANDING_EMPLOYEE_LEAD]) {
      expect(snap, `snapshot missing: ${copy.slice(0, 40)}`).toContain(flat(copy));
      expect(page, `page missing: ${copy.slice(0, 40)}`).toContain(flat(copy));
    }
  });

  it("the snapshot's steps, trust cards and fair rules are the builders the page renders", () => {
    const { container } = render(<GoalLandingV9 />);
    const doc = new DOMParser().parseFromString(landingSnapshot([]), "text/html");
    const page = flat(container.textContent);
    const snap = flat(doc.querySelector("main")?.textContent ?? null);
    // askCostLanding(false) is the released build's flag state
    // (VITE_ASK_LEVEL_COST unset); the snapshot pins the same value.
    const costCopy = askCostLanding(false);
    for (const step of goalLandingSteps(costCopy)) {
      expect(snap, `snapshot missing step: ${step.title}`).toContain(flat(step.title));
      expect(snap, `snapshot missing step body: ${step.title}`).toContain(flat(step.body));
      expect(page, `page missing step: ${step.title}`).toContain(flat(step.title));
      expect(page, `page missing step body: ${step.title}`).toContain(flat(step.body));
    }
    for (const item of goalLandingTrust(costCopy)) {
      expect(snap, `snapshot missing trust: ${item.title}`).toContain(flat(item.title));
      expect(snap, `snapshot missing trust body: ${item.title}`).toContain(flat(item.body));
      expect(page, `page missing trust: ${item.title}`).toContain(flat(item.title));
      expect(page, `page missing trust body: ${item.title}`).toContain(flat(item.body));
    }
    for (const rule of goalLandingFairRules(costCopy)) {
      expect(snap, `snapshot missing rule: ${rule.slice(0, 40)}`).toContain(flat(rule));
      expect(page, `page missing rule: ${rule.slice(0, 40)}`).toContain(flat(rule));
    }
  });

  it("the snapshot prints no FAQ, no pre-goal landing copy, and exactly one H1", () => {
    const doc = new DOMParser().parseFromString(landingSnapshot([]), "text/html");
    expect(doc.querySelector("dl")).toBeNull();
    expect(doc.querySelectorAll("h1").length).toBe(1);
    expect(flat(doc.querySelector("main")?.textContent ?? null)).not.toContain("INTRODUCINGSKIPWAIT.ME");
  });
});
