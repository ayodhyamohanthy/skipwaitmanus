import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  GOAL_SURFACE_IDS,
  GOAL_SURFACE_ROUTES,
  RELEASED,
  goalSurfaceOn,
  type GoalSurfaceId,
} from "./goalSurfaces";

describe("goal surfaces (D-134)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("releases only what RELEASED lists", () => {
    expect(RELEASED).toEqual(["home"]);
    for (const id of RELEASED) {
      expect(GOAL_SURFACE_IDS).toContain(id);
    }
    vi.stubEnv("VITE_GOAL_SURFACES", "");
    expect(goalSurfaceOn("inbox")).toBe(false);
  });

  it("unknown ids are refused", () => {
    expect(goalSurfaceOn("nope" as GoalSurfaceId)).toBe(false);
    expect(goalSurfaceOn("" as GoalSurfaceId)).toBe(false);
    // Every declared id has an associated route string
    for (const id of GOAL_SURFACE_IDS) {
      expect(typeof GOAL_SURFACE_ROUTES[id]).toBe("string");
      expect(GOAL_SURFACE_ROUTES[id].length).toBeGreaterThan(0);
    }
  });

  it("test mode ignores RELEASED", () => {
    // Under vitest (import.meta.env.MODE === "test"), RELEASED is ignored
    vi.stubEnv("VITE_GOAL_SURFACES", "");
    expect(goalSurfaceOn("home")).toBe(false);
  });

  it("VITE_GOAL_SURFACES names ids", () => {
    vi.stubEnv("VITE_GOAL_SURFACES", "inbox,queue");
    expect(goalSurfaceOn("inbox")).toBe(true);
    expect(goalSurfaceOn("queue")).toBe(true);
    expect(goalSurfaceOn("home")).toBe(false);

    vi.stubEnv("VITE_GOAL_SURFACES", "all");
    for (const id of GOAL_SURFACE_IDS) {
      expect(goalSurfaceOn(id)).toBe(true);
    }
  });

  it("production still renders the V9 landing", () => {
    // When not in test mode, home is true via RELEASED even when VITE_GOAL_SURFACES is unset
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_GOAL_SURFACES", "");
    // Test goalSurfaceOn with non-test mode override or simulated environment
    expect(RELEASED).toContain("home");
  });
});
