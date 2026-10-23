import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { planFamilyV2Enabled } from "../../shared/planFamily";

// D-132 audit item 1: with every D-132 flag unset (production today) the app behaves as before.
describe("D-132 flags off is today", () => {
  it("client: the plan-family flag is false when VITE_PLAN_FAMILY_V2 is unset or false", async () => {
    for (const value of [undefined, "false", ""]) {
      vi.resetModules();
      if (value === undefined) vi.unstubAllEnvs(); else vi.stubEnv("VITE_PLAN_FAMILY_V2", value);
      const flags = await import("./lib/goalFlags");
      expect(flags.PLAN_FAMILY_V2_CLIENT).toBe(false);
    }
    vi.unstubAllEnvs();
  });
  it("/plans routes to the legacy Plans page unless the flag is on", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    expect(app).toContain("{PLAN_FAMILY_V2_CLIENT ? <PlansV2 /> : <Plans />}");
  });
  it("server: the plan-family gate is off for an empty or false env", () => {
    expect(planFamilyV2Enabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(planFamilyV2Enabled({ PLAN_FAMILY_V2: "false" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(planFamilyV2Enabled({ PLAN_FAMILY_V2: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});
