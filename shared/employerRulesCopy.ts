/**
 * Single source for the calm answer to:
 * "Does this fit my employer's referral rules?"
 *
 * Source: docs/POSITIONING.md section 4.1 and 4.3 (D-323).
 * Rendered on /how-employees-refer-candidates and /safety.
 * Names no employer and claims no approval, compliance or endorsement.
 */

export const EMPLOYER_RULES_QUESTION = "Does this fit my employer's referral rules?";

export const EMPLOYER_RULES_LEAD =
  "That depends on your employer's policy, and it wins. Here is exactly what SkipWait does, so you can check it against yours.";

export type EmployerRulesPoint = {
  readonly title: string;
  readonly body: string;
};

export const EMPLOYER_RULES_POINTS: readonly EmployerRulesPoint[] = [
  {
    title: "Nobody pays you.",
    body: "SkipWait never pays for a referral, and a job seeker must never pay you or offer anything. If one does, report it.",
  },
  {
    title: "You decide.",
    body: "You read the role and the candidate's note first. Their name and resume open only if you accept. Passing is always fine.",
  },
  {
    title: "You use your company's process.",
    body: "Before you can accept, you confirm you will refer only through your company's official process and accept nothing in return. SkipWait submits nothing to your employer.",
  },
  {
    title: "You tell the truth about how you know them.",
    body: "You reviewed their resume and note on SkipWait. If your company's form asks whether you know the candidate personally or have worked with them, answer honestly.",
  },
  {
    title: "If your policy says no, pass.",
    body: "Some employers ask you to refer only people you know or have worked with. If that is your policy, do not accept. That is the product working as intended.",
  },
];

export const EMPLOYER_RULES_VERIFICATION_NOTE =
  "Work-email verification shows you control an address at your company. It is not your employer's endorsement of SkipWait, and we never say it is.";

export const EMPLOYER_RULES_SHORT =
  "SkipWait never sells a referral and never pays an employee: it verifies people, matches a request to the right company, and leaves the decision and the employer's own process to the employee.";
