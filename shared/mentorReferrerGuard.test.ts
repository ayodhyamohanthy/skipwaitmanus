import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// D-132 audit item 9: Mentor is data only, no referrer earns credits per accepted ask, and a seeker's plan
// or reach never reaches a referrer-facing file (D-006).
const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const full = join(dir, name);
  if (name === "node_modules" || name.startsWith(".")) return [];
  return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
});
const files = [...walk("server"), ...walk("client/src"), ...walk("shared")];
const read = (f: string) => readFileSync(f, "utf8");

describe("Mentor and referrers (D-132 item 9)", () => {
  it("nothing outside the config reads MENTOR_ADD_ON", () => {
    const users = files.filter(f => f !== "shared/planFamily.ts" && /\bMENTOR_ADD_ON\b/.test(read(f)));
    expect(users).toEqual([]);
  });
  it("no per-accepted-ask referrer credit exists", () => {
    expect(files.filter(f => /REFERRER_CREDIT_PER_ACCEPTED_ASK/.test(read(f)))).toEqual([]);
  });
  it("reach and the plan family are read only by the config, the plans page and the allowed server files", () => {
    const allowed = new Set(["shared/planFamily.ts", "client/src/pages/PlansV2.tsx", "server/aiCostLog.ts", "server/schemaReconcile.ts"]);
    const users = files.filter(f => /\bPLAN_REACH_LEVELS_ABOVE\b|\bplanReachFor\b|\bPLAN_DISPLAY_NAME\b/.test(read(f)) && !allowed.has(f));
    expect(users).toEqual([]);
  });
  it("referrer-facing client files never import the plan config", () => {
    const referrer = files.filter(f => /client\/src\/pages\/(Referrer|ReferrerHome|ReferrerImpact|ReferrerSetup|MyCompanyInbox)\.tsx$/.test(f));
    expect(referrer.length).toBeGreaterThan(0);
    for (const f of referrer) expect(read(f)).not.toMatch(/planFamily|PLAN_FAMILY|seekerLevels/);
  });
});
