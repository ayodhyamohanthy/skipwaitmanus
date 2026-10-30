// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-212's packets are built exactly as written, so a sentence a reader cannot
 * reproduce becomes code nobody can follow. The independent review of PR #703
 * (Hark · e9cd, 2026-10-29, head `1fda8866`) named four such sentences: a held
 * cleanup described as automatic (H1), a three-file list where four files
 * qualify (H2), an unmeasured ruleset bypass asserted as `always` (H3), and a
 * machine-copied human confirmation with no stated authority (H4). Every check
 * below fails on that head and passes once the doc states what is measured.
 */
const read = (relative: string) => readFileSync(path.resolve(__dirname, "..", relative), "utf8");
const pipeline = read("docs/plans/ENTERPRISE-PIPELINE.md");
const hygiene = read("docs/plans/BRANCH-HYGIENE.md");
const watch = read("docs/plans/REL-production-watch.md");
const decisions = read("docs/DECISIONS.md");

/** One `## ` section, so a claim is checked in the place a builder reads it. */
const section = (text: string, heading: string) => {
  const start = text.indexOf(heading);
  if (start === -1) throw new Error(`missing section ${heading}`);
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
};

describe("D-212 claims the Oct 29 review could not reproduce", () => {
  it("H1: a cleanup held under D-232 is never described as automatic", () => {
    expect(hygiene).not.toContain("are automatic");
    const branches = section(pipeline, "## 8. Branches");
    expect(branches).toMatch(/retention hold|D-232/);
    expect(branches).toContain("BRANCH-HYGIENE-2");
  });

  it("H2: every file that captures before answering a 5xx is named, not three of four", () => {
    expect(watch).not.toContain("The three files that already call");
    for (const file of ["jobCatalogRoutes", "privateReferralRoutes", "scheduledJobsRoutes", "workosWebhooks"]) {
      expect(watch).toContain(file);
    }
  });

  it("H3: the ruleset bypass is a dated read, never a measured `always`", () => {
    for (const text of [pipeline, decisions]) {
      expect(text).not.toMatch(/bypass_mode:\s*always/);
      expect(text).not.toMatch(/bypass `always`/);
      expect(text).toContain("read on 2026-10-29");
    }
  });

  it("H4: the self-heal's copied confirmation states who allowed it and why", () => {
    const heal = section(watch, "## REL-self-heal");
    expect(heal).toContain("D-212");
    expect(heal).toMatch(/typed twice|typed-twice/);
  });
});
