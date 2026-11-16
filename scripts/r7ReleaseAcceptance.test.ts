// @vitest-environment node
// D-048-R7-prep (packet docs/plans/D-048-R7-prep.md): release-acceptance controls for the existing R7 public
// surfaces (policy, system, links), measured from current source rather than an old pull request summary.
// It pins the drift comparison the release depends on: the goal twin repeats every verified sender word, and
// the local labels/descriptions carry referral terminology (D-173/D-180, landed 934a6bfc). It flips no flag and
// edits no page.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const KIT_EMAILS = "client/src/pages/Emails.tsx";
const GOAL_EMAILS = "client/src/pages/goal/system/GoalEmails.tsx";

type TemplateFields = {
  name: string;
  channel: string;
  trigger: string;
  subject?: string;
  body: string[];
  cta?: string;
  push?: string;
};

const field = (scope: string, key: string): string | undefined => {
  const match = new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(scope);
  return match?.[1];
};

/**
 * The templates are literals, not exported data, so each entry is parsed into its own fields: that proves the
 * goal twin repeats the kit's verified sender words without depending on field formatting.
 */
const templates = (source: string): TemplateFields[] => {
  const parts = source.split(/(?=name:\s*")/g).slice(1);
  return parts.map(part => {
    const end = part.indexOf("];");
    const scope = end >= 0 ? part.slice(0, end) : part;
    const bodyMatch = /body:\s*\[((?:[^\]])*)\]/.exec(scope);
    return {
      name: field(scope, "name") ?? "",
      channel: field(scope, "channel") ?? "",
      trigger: field(scope, "trigger") ?? "",
      subject: field(scope, "subject"),
      body: bodyMatch ? Array.from(bodyMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)).map(m => m[1]) : [],
      cta: field(scope, "cta"),
      push: field(scope, "push"),
    };
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

  it("repeats every verified sender word verbatim, so the honesty rule holds after release", () => {
    const goalByName = new Map(goalTemplates.map(t => [t.name, t]));
    for (const entry of kitTemplates) {
      const twin = goalByName.get(entry.name);
      expect(twin, `${entry.name} is missing from the goal page`).toBeDefined();
      expect(
        { subject: twin?.subject, body: twin?.body, cta: twin?.cta, push: twin?.push },
        `${entry.name} sender text drifted from the kit page`,
      ).toEqual({ subject: entry.subject, body: entry.body, cta: entry.cta, push: entry.push });
    }
  });

  it("keeps every trigger description identical except where the goal page drops the internal credit noun (D-180)", () => {
    const goalByName = new Map(goalTemplates.map(t => [t.name, t]));
    for (const entry of kitTemplates) {
      const expected = entry.name === "Payment receipt / failed"
        ? entry.trigger.replace("A credit purchase", "A purchase")
        : entry.trigger;
      expect(goalByName.get(entry.name)?.trigger, `${entry.name} trigger drifted`).toBe(expected);
    }
  });

  it("keeps the password-reset template current: neutral reply, one hour, single use", () => {
    // #324's password-reset change is the drift the packet names; this pins the words the goal twin must carry.
    const reset = goalTemplates.find(t => t.name === "Password reset");
    expect(reset).toBeDefined();
    const text = [reset?.subject, reset?.trigger, ...(reset?.body ?? []), reset?.cta].join(" ");
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

describe("R7 release acceptance: referral terminology on the system surface (D-173/D-180)", () => {
  it("pins the corrected labels and keeps the retired request noun out of labels and descriptions", () => {
    // The 934a6bfc correction renamed "Ask accepted"/"Ask passed" and replaced the request-object noun in the
    // descriptions. This pins the corrected words so a later edit cannot quietly restore the retired noun.
    const goalTemplates = templates(read(GOAL_EMAILS));
    const names = goalTemplates.map(t => t.name);
    expect(names).toContain("Referral accepted");
    expect(names).toContain("Referral passed");
    for (const entry of goalTemplates) {
      expect(entry.name, `${entry.name}: retired noun in the template label`).not.toMatch(/\basks?\b/i);
      expect(entry.trigger, `${entry.name}: retired noun in the description`).not.toMatch(
        /\b(?:an?|the|pending|waiting|your)\s+asks?\b|\bcredit (?:purchase|pack)\b/i,
      );
    }
  });
});
