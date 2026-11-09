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
