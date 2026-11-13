import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { planFamilyV2Enabled } from "../../shared/planFamily";

// Oct 25 2026 freeze: the banded pricing DISPLAY is published read-only by
// default (planFamilyFlag.ts). The legacy page remains reachable via
// VITE_PLAN_FAMILY_V2=false, and the server-side gate stays env-driven OFF
// until billing is enabled.
describe("plan-family display flag", () => {
  it("client: the plan-family display is ON unless VITE_PLAN_FAMILY_V2 is explicitly false", async () => {
    for (const value of [undefined, "", "true"]) {
      vi.resetModules();
      if (value === undefined) vi.unstubAllEnvs(); else vi.stubEnv("VITE_PLAN_FAMILY_V2", value);
      const flags = await import("./lib/goalFlags");
      expect(flags.PLAN_FAMILY_V2_CLIENT).toBe(true);
    }
    vi.resetModules();
    vi.stubEnv("VITE_PLAN_FAMILY_V2", "false");
    const flags = await import("./lib/goalFlags");
    expect(flags.PLAN_FAMILY_V2_CLIENT).toBe(false);
    vi.unstubAllEnvs();
  });
  it("/plans still routes through the flag", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    expect(app).toContain("{PLAN_FAMILY_V2_CLIENT ? <PlansV2 /> : <Plans />}");
  });
  it("server: the plan-family billing gate stays off for an empty or false env", () => {
    expect(planFamilyV2Enabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(planFamilyV2Enabled({ PLAN_FAMILY_V2: "false" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(planFamilyV2Enabled({ PLAN_FAMILY_V2: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});
