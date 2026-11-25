import { describe, expect, it } from "vitest";
import { LAUNCH_COMPANY_SEED } from "./companyDirectorySeed";
import {
  EMPLOYER_RULES_LEAD,
  EMPLOYER_RULES_POINTS,
  EMPLOYER_RULES_QUESTION,
  EMPLOYER_RULES_SHORT,
  EMPLOYER_RULES_VERIFICATION_NOTE,
} from "./employerRulesCopy";

describe("employer rules copy (D-323 / POSITIONING.md §4.3)", () => {
  it("exports the exact question, lead, verification note and short line", () => {
    expect(EMPLOYER_RULES_QUESTION).toBe("Does this fit my employer's referral rules?");
    expect(EMPLOYER_RULES_LEAD).toBe(
      "That depends on your employer's policy, and it wins. Here is exactly what SkipWait does, so you can check it against yours."
    );
    expect(EMPLOYER_RULES_VERIFICATION_NOTE).toBe(
      "Work-email verification shows you control an address at your company. It is not your employer's endorsement of SkipWait, and we never say it is."
    );
    expect(EMPLOYER_RULES_SHORT).toBe(
      "SkipWait never sells a referral and never pays an employee: it verifies people, matches a request to the right company, and leaves the decision and the employer's own process to the employee."
    );
  });

  it("exports the five points word for word from docs/POSITIONING.md §4.3", () => {
    expect(EMPLOYER_RULES_POINTS).toHaveLength(5);
    expect(EMPLOYER_RULES_POINTS[0]).toEqual({
      title: "Nobody pays you.",
      body: "SkipWait never pays for a referral, and a job seeker must never pay you or offer anything. If one does, report it.",
    });
    expect(EMPLOYER_RULES_POINTS[1]).toEqual({
      title: "You decide.",
      body: "You read the role and the candidate's note first. Their name and resume open only if you accept. Passing is always fine.",
    });
    expect(EMPLOYER_RULES_POINTS[2]).toEqual({
      title: "You use your company's process.",
      body: "Before you can accept, you confirm you will refer only through your company's official process and accept nothing in return. SkipWait submits nothing to your employer.",
    });
    expect(EMPLOYER_RULES_POINTS[3]).toEqual({
      title: "You tell the truth about how you know them.",
      body: "You reviewed their resume and note on SkipWait. If your company's form asks whether you know the candidate personally or have worked with them, answer honestly.",
    });
    expect(EMPLOYER_RULES_POINTS[4]).toEqual({
      title: "If your policy says no, pass.",
      body: "Some employers ask you to refer only people you know or have worked with. If that is your policy, do not accept. That is the product working as intended.",
    });
  });

  it("points include 'official process' and 'pass'", () => {
    const combinedPoints = EMPLOYER_RULES_POINTS.map(p => `${p.title} ${p.body}`).join(" ");
    expect(combinedPoints).toContain("official process");
    expect(combinedPoints).toContain("pass");
  });

  it("names no employer from the directory seed", () => {
    const employerNames = LAUNCH_COMPANY_SEED.filter(c => c.slug !== "skipwait").map(c => c.name);
    const allText = [
      EMPLOYER_RULES_QUESTION,
      EMPLOYER_RULES_LEAD,
      EMPLOYER_RULES_VERIFICATION_NOTE,
      EMPLOYER_RULES_SHORT,
      ...EMPLOYER_RULES_POINTS.map(p => `${p.title} ${p.body}`),
    ].join(" ");

    for (const name of employerNames) {
      expect(allText).not.toContain(name);
    }
  });

  it("makes no prohibited claims matching /compliant|approved by|allowed at|guarantee/i", () => {
    const allText = [
      EMPLOYER_RULES_QUESTION,
      EMPLOYER_RULES_LEAD,
      EMPLOYER_RULES_VERIFICATION_NOTE,
      EMPLOYER_RULES_SHORT,
      ...EMPLOYER_RULES_POINTS.map(p => `${p.title} ${p.body}`),
    ].join(" ");

    expect(allText).not.toMatch(/compliant|approved by|allowed at|guarantee/i);
  });
});
