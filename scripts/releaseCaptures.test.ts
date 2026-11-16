// GATE-release-captures (D-346 (6), docs/plans/D-344-unblock.md row 4): the
// route resolution behind CI's release captures. The routes come from
// client/src/lib/goalSurfaces.ts itself (never a hand-kept copy), so these
// tests compare the parser with the real module and resolve every open
// release row on the queue.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GOAL_SURFACES, releasedGoalSurfaces } from "../client/src/lib/goalSurfaces";
import {
  CANARY_IDS,
  SELF_TEST_FILES,
  VIEWPORTS,
  captureIds,
  capturePlan,
  fillRoute,
  newlyReleased,
  parseGoalSurfaces,
  personaOf,
  releaseIdOfBranch,
  releaseIdOfTask,
  routesOf,
  shotFile,
} from "./release-captures.mjs";

const root = join(__dirname, "..");
const source = readFileSync(join(root, "client/src/lib/goalSurfaces.ts"), "utf8");
const assignments = JSON.parse(readFileSync(join(root, "docs/plans/assignments.json"), "utf8")) as { tasks: Array<{ id: string; status: string; branch?: string }> };
const tasks = assignments.tasks;
const parsed = parseGoalSurfaces(source);

describe("parseGoalSurfaces reads the real surface map", () => {
  it("matches GOAL_SURFACES exactly, id for id and route for route", () => {
    expect(parsed.surfaces).toEqual(JSON.parse(JSON.stringify(GOAL_SURFACES)));
    expect(Object.keys(parsed.surfaces)).toEqual(Object.keys(GOAL_SURFACES));
  });

  it("matches RELEASED exactly, in order", () => {
    expect(parsed.released).toEqual([...releasedGoalSurfaces()]);
  });

  it("does not depend on the file's line layout", () => {
    const oneLine = source.replace(/\n\s*/g, " ");
    expect(parseGoalSurfaces(oneLine)).toEqual(parsed);
  });

  it("fails loudly when the map or the list is missing or malformed", () => {
    expect(() => parseGoalSurfaces("export const OTHER = {};")).toThrow(/GOAL_SURFACES/);
    expect(() => parseGoalSurfaces(source.replace("const RELEASED", "const SHIPPED"))).toThrow(/RELEASED/);
    expect(() => parseGoalSurfaces(source.replace('"home": ["/"],', '"home": [HOME_ROUTE],'))).toThrow(/GOAL_SURFACES/);
    expect(() => parseGoalSurfaces(source.replace('  "referrer",\n', "  REFERRER,\n"))).toThrow(/RELEASED/);
  });

  it("refuses a released id that is not declared", () => {
    expect(() => parseGoalSurfaces(source.replace('  "referrer",\n', '  "referrer",\n  "not-a-surface",\n'))).toThrow(/not-a-surface/);
  });
});

describe("every open release row resolves to routes CI can capture", () => {
  const open = tasks.filter(task => /^D-048-R-/.test(task.id) && task.status !== "done");

  it("finds the open release rows on the queue", () => {
    expect(open.length).toBeGreaterThan(0);
  });

  for (const task of open) {
    it(`${task.id} resolves to a declared surface with concrete paths`, () => {
      const id = releaseIdOfTask(task.id, parsed.surfaces);
      expect(id, `${task.id} names no declared surface`).not.toBeNull();
      const routes = routesOf(id as string, parsed.surfaces);
      expect(routes.length).toBeGreaterThan(0);
      for (const route of routes) {
        expect(route.path.startsWith("/"), route.path).toBe(true);
        expect(route.path, `${route.pattern} kept a parameter`).not.toMatch(/:/);
      }
      if (task.branch) expect(releaseIdOfBranch(task.branch, tasks, parsed.surfaces)).toBe(id);
    });
  }

  it("resolves every declared surface, so any future release row is covered too", () => {
    for (const id of Object.keys(parsed.surfaces)) {
      const routes = routesOf(id, parsed.surfaces);
      expect(routes.length, id).toBeGreaterThan(0);
      for (const route of routes) expect(route.path, `${id} ${route.pattern}`).not.toMatch(/:/);
      expect(["visitor", "seeker", "referrer", "admin"]).toContain(personaOf(id));
    }
  });
});

describe("route and session resolution", () => {
  it("fills every parameter with a synthetic value and refuses an unknown one", () => {
    expect(fillRoute("/explore/:slug")).toBe("/explore/acme-example");
    expect(fillRoute("/refer/:companySlug/:vanityAlias")).toBe("/refer/acme-example/release-capture");
    expect(fillRoute("/admin/approvals/:kind/:id")).toBe("/admin/approvals/company/1");
    expect(() => fillRoute("/x/:unknownParam")).toThrow(/unknownParam/);
  });

  it("captures the signed-in home variant on home's own route", () => {
    expect(routesOf("home-signed-in", parsed.surfaces)).toEqual([{ pattern: "/", path: "/" }]);
    expect(personaOf("home-signed-in")).toBe("seeker");
    expect(personaOf("home")).toBe("visitor");
  });

  it("signs each surface in as the person who meets it", () => {
    expect(personaOf("sign-in")).toBe("visitor");
    expect(personaOf("pricing")).toBe("visitor");
    expect(personaOf("referrer-home")).toBe("referrer");
    expect(personaOf("email-review")).toBe("referrer");
    expect(personaOf("admin-money")).toBe("admin");
    expect(personaOf("admin")).toBe("admin");
    expect(personaOf("inbox")).toBe("seeker");
    expect(() => personaOf("not-a-surface", parsed.surfaces)).toThrow(/not-a-surface/);
  });

  it("refuses an id the map does not declare", () => {
    expect(() => routesOf("not-a-surface", parsed.surfaces)).toThrow(/not-a-surface/);
    expect(() => capturePlan(["not-a-surface"], parsed.surfaces)).toThrow(/not-a-surface/);
  });

  it("names each capture file once per surface and viewport", () => {
    expect(VIEWPORTS.map(v => [v.width, v.height, v.deviceScaleFactor])).toEqual([[1280, 900, 1], [390, 844, 2]]);
    expect(shotFile("/")).toBe("root");
    expect(shotFile("/admin/approvals/company/1")).toBe("admin-approvals-company-1");
    for (const id of Object.keys(parsed.surfaces)) {
      const files = capturePlan([id], parsed.surfaces).map(shot => shot.file);
      expect(new Set(files).size, id).toBe(files.length);
    }
  });

  it("plans one shot per route with its persona", () => {
    expect(capturePlan(["sign-in"], parsed.surfaces)).toEqual([
      { id: "sign-in", persona: "visitor", pattern: "/sign-in", path: "/sign-in", file: "sign-in" },
      { id: "sign-in", persona: "visitor", pattern: "/forgot-password", path: "/forgot-password", file: "forgot-password" },
      { id: "sign-in", persona: "visitor", pattern: "/reset-password", path: "/reset-password", file: "reset-password" },
      { id: "sign-in", persona: "visitor", pattern: "/reviewer-sign-in", path: "/reviewer-sign-in", file: "reviewer-sign-in" },
    ]);
  });
});

describe("which surfaces a pull request captures", () => {
  it("reads a release row's surface from its branch through the queue, never the branch text alone", () => {
    expect(releaseIdOfBranch("agent/queue/d048-r-employer-billing", tasks, parsed.surfaces)).toBe("employer-billing");
    expect(releaseIdOfBranch("agent/queue/d048-r-sign-in", tasks, parsed.surfaces)).toBe("sign-in");
    expect(releaseIdOfBranch("agent/queue/gate-release-captures", tasks, parsed.surfaces)).toBeNull();
    expect(releaseIdOfBranch("agent/queue/d048-r-not-on-the-queue", tasks, parsed.surfaces)).toBeNull();
    expect(releaseIdOfBranch("", tasks, parsed.surfaces)).toBeNull();
    expect(releaseIdOfTask("D-048-R4", parsed.surfaces)).toBeNull();
  });

  it("finds the ids a pull request adds to RELEASED (a build row going live in its own PR, D-349)", () => {
    expect(newlyReleased(["home", "referrer"], ["home", "sign-in", "referrer", "inbox"])).toEqual(["sign-in", "inbox"]);
    expect(newlyReleased(["home", "referrer"], ["home"])).toEqual([]);
  });

  const base = { surfaces: parsed.surfaces, tasks, baseReleased: ["home", "referrer"], headReleased: ["home", "referrer"], changedFiles: ["client/src/pages/Foo.tsx"] };

  it("captures nothing for a pull request that releases nothing", () => {
    expect(captureIds({ ...base, branch: "agent/queue/some-feature" })).toEqual([]);
  });

  it("captures the release row's surface and every newly released id, once each, in map order", () => {
    expect(captureIds({ ...base, branch: "agent/queue/d048-r-inbox", headReleased: ["home", "referrer", "inbox", "sign-in"] })).toEqual(["sign-in", "inbox"]);
  });

  it("captures the canary surfaces when the pull request changes the capture tooling itself", () => {
    expect(SELF_TEST_FILES).toEqual(["scripts/release-captures.mjs", "e2e/release-captures.e2e.ts"]);
    for (const id of CANARY_IDS) expect(parsed.released).toContain(id);
    expect(new Set(CANARY_IDS.map(id => personaOf(id))).size).toBe(CANARY_IDS.length);
    expect(captureIds({ ...base, branch: "agent/queue/gate-release-captures", changedFiles: ["e2e/release-captures.e2e.ts"] })).toEqual([...CANARY_IDS].sort((a, b) => Object.keys(parsed.surfaces).indexOf(a) - Object.keys(parsed.surfaces).indexOf(b)));
  });
});
