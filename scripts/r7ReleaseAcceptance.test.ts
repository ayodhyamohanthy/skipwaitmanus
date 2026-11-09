// @vitest-environment node
// D-048-R7-prep (packet docs/plans/D-048-R7-prep.md): release-acceptance controls for the existing R7 public
// surfaces (policy, system, links), measured from current source rather than an old pull request summary.
// It pins the drift comparison the release depends on and records the wording conflict the release must fix
// before `system` can ship. It flips no flag and edits no page.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const KIT_EMAILS = "client/src/pages/Emails.tsx";
const GOAL_EMAILS = "client/src/pages/goal/system/GoalEmails.tsx";

/**
 * The templates are literals, not exported data, so each entry is compared as its own ordered list of string
 * literals: that proves the goal twin repeats the kit's verified words without depending on field formatting.
 */
const templates = (source: string): { name: string; literals: string[] }[] => {
  const parts = source.split(/(?=name:\s*")/g).slice(1);
  return parts.map(part => {
    const literals = Array.from(part.matchAll(/"((?:[^"\\]|\\.)*)"/g)).map(m => m[1]);
    const name = /name:\s*"((?:[^"\\]|\\.)*)"/.exec(part)?.[1] ?? "";
    const end = part.indexOf("];");
    const scope = end >= 0 ? part.slice(0, end) : part;
    return { name, literals: Array.from(scope.matchAll(/"((?:[^"\\]|\\.)*)"/g)).map(m => m[1]) };
  });
};

describe("R7 release acceptance: the system surface carries the kit's verified content", () => {
  const kit = read(KIT_EMAILS);
  const goal = read(GOAL_EMAILS);
  const kitTemplates = templates(kit);
  const goalTemplates = templates(goal);

  it("lists the same transactional templates, in the same order", () => {
    expect(kitTemplates.length).toBeGreaterThan(10);
    expect(goalTemplates.map(t => t.name)).toEqual(kitTemplates.map(t => t.name));
  });

  it("repeats every verified word verbatim, so the honesty rule holds after release", () => {
    const goalByName = new Map(goalTemplates.map(t => [t.name, t]));
    for (const entry of kitTemplates) {
      const twin = goalByName.get(entry.name);
      expect(twin, `${entry.name} is missing from the goal page`).toBeDefined();
      expect(twin?.literals, `${entry.name} text drifted from the kit page`).toEqual(entry.literals);
    }
  });

  it("keeps the password-reset template current: neutral reply, one hour, single use", () => {
    // #324's password-reset change is the drift the packet names; this pins the words the goal twin must carry.
    const reset = goalTemplates.find(t => t.name === "Password reset");
    expect(reset).toBeDefined();
    const text = (reset?.literals ?? []).join(" ");
    expect(text).toMatch(/check your email/i);
    expect(text).toMatch(/1 hour/i);
    expect(text).toMatch(/once/i);
    expect(text).toMatch(/ignore this email|never asks/i);
  });

  it("imports nothing from the kit in the goal body, so the surface is a real goal page (D-150)", () => {
    expect(goal).not.toMatch(/components\/kit/);
    expect(goal).not.toMatch(/styles\/kit\.css/);
    expect(goal).toMatch(/data-goal-page|GoalStaticFrame|GoalNextStep/);
  });
});

describe("R7 release acceptance: blockers the release carrier must resolve first", () => {
  it("records the retired-noun conflict in the goal template names (D-173/D-180)", () => {
    // The goal page labels two templates "Ask accepted" and "Ask passed". The buyer-facing unit is a referral
    // request (D-173/D-180), so releasing `system` as it stands would print the retired noun on a public page.
    // The rename is a copy change that needs its own bounded amendment; the release carrier must not flip the
    // `system` id until it lands. This test records the finding so it cannot be forgotten at release time.
    const goal = read(GOAL_EMAILS);
    const retired = templates(goal).map(t => t.name).filter(name => /\basks?\b/i.test(name));
    expect(retired.length).toBeGreaterThan(0);
  });
});
