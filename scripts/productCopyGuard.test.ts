import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RULES, blankComments, collectProductFiles, findingsForContent, scanProductCopy } from "./productCopyGuard.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ruleById = (id: string) => RULES.find((rule: { id: string }) => rule.id === id);

describe("product copy guard", () => {
  it("passes on the committed product surface", () => {
    expect(scanProductCopy(repoRoot)).toEqual([]);
  });

  it("scans the surfaces that actually carry product copy", () => {
    const files = collectProductFiles(repoRoot);
    expect(files.length).toBeGreaterThan(150);
    for (const expected of ["shared/referral.ts", "client/src/components/RequestStatusTimeline.tsx", "server/workEmailOtp.ts"]) {
      expect(files).toContain(expected);
    }
    expect(files.some(file => /\.test\.[tsx]?$/.test(file))).toBe(false);
  });

  it("flags each rule, and only each rule's own fixture proves it bites", () => {
    const fixtures: Record<string, string> = {
      "guaranteed-outcome": 'const copy = "We guarantee an interview at every company.";',
      "employer-action-claimed": 'const copy = "Your referral was submitted to the employer.";',
      "unverified-milestone-stated-as-fact": 'const copy = "An offer was confirmed."; ',
      "outcome-statistics-claim": 'const copy = "A 42% hire rate across all referrals.";',
    };
    expect(Object.keys(fixtures).sort()).toEqual(RULES.map((rule: { id: string }) => rule.id).sort());
    for (const [ruleId, source] of Object.entries(fixtures)) {
      const findings = findingsForContent("fixture.tsx", source);
      expect(findings.map((finding: { ruleId: string }) => finding.ruleId), ruleId).toEqual([ruleId]);
      expect(findings[0]).toMatchObject({ file: "fixture.tsx", line: 1 });
      expect(findings[0].why).toBe(ruleById(ruleId)?.summary);
    }
  });

  it("treats a disclaimer as honest copy, except unmeasured outcome statistics", () => {
    const disclaimers = [
      'const copy = "A referral never guarantees an interview or a job.";',
      'const copy = "This does not bypass the employer application process or guarantee a referral.";',
      'const copy = "Their acceptance does not confirm that a referral was submitted to the employer.";',
      'const copy = "An offer was reported, not confirmed by the employer.";',
    ];
    for (const source of disclaimers) expect(findingsForContent("fixture.tsx", source)).toEqual([]);
    expect(findingsForContent("fixture.tsx", 'const copy = "A 42% hire rate is not a promise.";').length).toBe(1);
  });

  it("reads engineer commentary as commentary", () => {
    const commented = ["// This cap guarantees a minimum delay so callers slow down.", "/* Your referral was submitted to the employer. */"].join("\n");
    expect(findingsForContent("server/_core/llm.ts", commented)).toEqual([]);
    expect(findingsForContent("server/_core/llm.ts", 'const note = "This cap guarantees a minimum delay";').length).toBe(1);
  });

  it("blanks comments without moving a single character", () => {
    const source = readFileSync(join(repoRoot, "server/_core/llm.ts"), "utf8");
    const blanked = blankComments(source);
    expect(blanked).toHaveLength(source.length);
    expect(blanked.split("\n").length).toBe(source.split("\n").length);
    expect(blanked).not.toContain("guarantees a minimum");
    expect(source).toContain("guarantees a minimum");
  });

  it("keeps the scanner terminating on a file that matches", () => {
    const started = Date.now();
    expect(findingsForContent("fixture.tsx", 'const copy = "We guarantee an interview.";').length).toBe(1);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
