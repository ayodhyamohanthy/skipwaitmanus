// D-048-F-flags: the one flag module's contract (packet D-048-foundation §7).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOAL_SURFACES,
  duplicateGoalRoutes,
  goalSurfaceDecision,
  goalSurfaceIds,
  goalSurfaceOn,
  releasedGoalSurfaces,
} from "./goalSurfaces";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("goalSurfaces flag module", () => {
  it("releases only what RELEASED lists", () => {
    expect(releasedGoalSurfaces()).toEqual(["home"]);
    for (const id of releasedGoalSurfaces()) {
      expect(goalSurfaceIds()).toContain(id);
    }
    // Vitest runs in MODE=test, so the env is empty by default: an unreleased
    // id is off, and even the released `home` is off (test-mode rule below).
    expect(goalSurfaceOn("inbox")).toBe(false);
  });

  it("unknown ids are refused and no route is declared twice", () => {
    expect(() => goalSurfaceOn("nope" as never)).toThrow(/unknown goal surface id/);
    expect(duplicateGoalRoutes()).toEqual([]);
  });

  it("test mode ignores RELEASED", () => {
    // Under vitest (MODE === "test") only VITE_GOAL_SURFACES names surfaces.
    expect(import.meta.env.MODE).toBe("test");
    expect(goalSurfaceOn("home")).toBe(false);
    expect(goalSurfaceDecision("home", "test", "")).toBe(false);
    expect(goalSurfaceDecision("home", "test", "inbox,queue")).toBe(false);
  });

  it("VITE_GOAL_SURFACES names ids, and `all` means every id", () => {
    vi.stubEnv("VITE_GOAL_SURFACES", "inbox,queue");
    expect(goalSurfaceOn("inbox")).toBe(true);
    expect(goalSurfaceOn("queue")).toBe(true);
    expect(goalSurfaceOn("home")).toBe(false);

    vi.stubEnv("VITE_GOAL_SURFACES", "all");
    for (const id of goalSurfaceIds()) {
      expect(goalSurfaceOn(id)).toBe(true);
    }

    vi.stubEnv("VITE_GOAL_SURFACES", "inbox,nope");
    expect(() => goalSurfaceOn("inbox")).toThrow(/unknown goal surface id/);
  });

  it("production renders the V9 landing from RELEASED, not from a workflow flag", () => {
    // The home id is released in code; a production build needs no env flag.
    expect(goalSurfaceDecision("home", "production", "")).toBe(true);
    expect(goalSurfaceDecision("inbox", "production", "")).toBe(false);
    // deploy-pages.yml must never pass the retired landing flags or
    // VITE_GOAL_SURFACES (D-097: production truth in code).
    const workflow = readFileSync(join(__dirname, "..", "..", "..", ".github", "workflows", "deploy-pages.yml"), "utf8");
    expect(workflow).not.toMatch(/VITE_GOAL_UI_LANDING/);
    expect(workflow).not.toMatch(/VITE_GOAL_SURFACES/);
    // The folded flag consumers read goalSurfaces, never goalFlags.
    const home = readFileSync(join(__dirname, "..", "pages", "Home.tsx"), "utf8");
    const signIn = readFileSync(join(__dirname, "..", "pages", "SignIn.tsx"), "utf8");
    expect(home).not.toMatch(/@\/lib\/goalFlags/);
    expect(signIn).not.toMatch(/@\/lib\/goalFlags/);
    expect(home).toMatch(/goalSurfaceOn\("home"\)/);
    expect(signIn).toMatch(/goalSurfaceOn\("sign-in"\)/);
  });

  it("declares every id the split names, each with its routes", () => {
    const expected = [
      "home", "home-signed-in", "sign-in", "inbox", "queue", "ask", "company",
      "conversation", "start", "onboarding", "verify", "plans", "premium",
      "pricing", "referrer", "referrer-home", "invite", "post-opportunity",
      "email-review", "settings", "profile", "alerts", "messages",
      "assistants", "support", "landed", "suggest-company", "share", "skippy",
      "employer", "employer-talent", "employer-billing", "for-companies",
      "admin", "admin-money", "admin-people", "admin-approvals", "admin-ops",
      "developers", "policy", "system", "links", "discovery", "public-profile",
    ];
    expect(goalSurfaceIds().sort()).toEqual(expected.sort());
    for (const routes of Object.values(GOAL_SURFACES)) {
      expect(Array.isArray(routes)).toBe(true);
    }
  });
});
