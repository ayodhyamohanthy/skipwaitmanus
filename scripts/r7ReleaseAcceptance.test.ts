// @vitest-environment node
// D-048-R7-prep: release acceptance for the policy + system + links trio.
//
// Acceptance 3 of the packet: the local/QA preview enables ONLY policy,system,links
// through VITE_GOAL_SURFACES, and RELEASED is never edited for this release. The
// pure resolver core is pinned here, so a wider env string, a fourth id or a
// premature RELEASED edit fails before any capture is taken.
//
// Acceptance 1: the goal /emails twin now quotes the sender verbatim. The senders
// import the DB and DNS, so their exact copy is pinned as literals here instead of
// booting them; the jsdom twin test (goalEmails.releaseDrift.test.tsx) renders the
// page against the same strings, so a sender change fails both halves of the
// contract at once.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GOAL_SURFACES, goalSurfaceDecision, releasedGoalSurfaces } from "../client/src/lib/goalSurfaces";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const TRIO = ["policy", "system", "links"] as const;
// The exact value the packet's acceptance 3 puts in the local/QA preview env.
const PREVIEW_ENV = TRIO.join(",");

describe("R7 release acceptance: preview scope (acceptance 3)", () => {
  it("turns on the trio and nothing beyond what is already released", () => {
    const ids = Object.keys(GOAL_SURFACES) as (keyof typeof GOAL_SURFACES)[];
    const on = ids.filter(id => goalSurfaceDecision(id, "production", PREVIEW_ENV));
    const expected = ids.filter(id => (TRIO as readonly string[]).includes(id) || releasedGoalSurfaces().includes(id));
    expect(on).toEqual(expected);
  });

  it("keeps every trio id out of RELEASED until the release row flips it", () => {
    for (const id of TRIO) expect(releasedGoalSurfaces()).not.toContain(id);
  });

  it("names the routes the release checklist covers", () => {
    expect(GOAL_SURFACES.policy).toEqual(expect.arrayContaining(["/privacy", "/terms", "/refunds"]));
    expect(GOAL_SURFACES.system).toEqual(expect.arrayContaining(["/offline", "/emails", "/app-states"]));
    expect(GOAL_SURFACES.links).toEqual(
      expect.arrayContaining(["/fast/:linkCode", "/refer/:companySlug/:vanityAlias", "/share-card/:token"]),
    );
  });
});

describe("R7 release acceptance: /emails sender drift (acceptance 1)", () => {
  it("the work-email code subject still leads with the code", () => {
    expect(read("server/workEmailOtp.ts")).toContain("`${code} is your skipwait.me verification code`");
    expect(read("client/src/pages/goal/system/GoalEmails.tsx")).toContain(
      '"⟨6-digit code⟩ is your skipwait.me verification code"',
    );
  });

  it("the private-review decision line is the one the sender writes", () => {
    const line =
      "Open the private review page to inspect and confirm a decision. Opening this link never records a decision.";
    expect(read("server/referrerReviewEmail.ts")).toContain(line);
    expect(read("client/src/pages/goal/system/GoalEmails.tsx")).toContain(line);
  });

  it("the goal twin never quotes the unlanded password-reset rewrite", () => {
    const twin = read("client/src/pages/goal/system/GoalEmails.tsx");
    expect(twin).not.toContain("Set or reset your skipwait.me password");
    expect(twin).not.toContain("Finish signing in to skipwait.me");
  });
});


// Canonical-branch controls retained for comparison; red evidence is not release clearance.
// D-048-R7-prep (packet docs/plans/D-048-R7-prep.md): release-acceptance controls for the existing R7 public
// surfaces (policy, system, links), measured from current source rather than an old pull request summary.
// It pins the drift comparison the release depends on and records the wording conflict the release must fix
// before `system` can ship. It flips no flag and edits no page.



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
