import { describe, expect, it } from "vitest";
import { REASONS_COACH_ENABLED, filterCoachQuestions, reasonsCoachInputSchema, reasonsCoachResponseSchema } from "./reasonsCoach";

const input = { reasons: ["I improved the support flow.", "I work with designers.", "I know the product."] as [string, string, string] };

describe("reasons coach contract (D-094)", () => {
  it("ships disabled", () => { expect(REASONS_COACH_ENABLED).toBe(false); });
  it("accepts only the bounded reasons and optional public role/company context", () => {
    expect(reasonsCoachInputSchema.safeParse({ ...input, roleTitle: "Designer", companyName: "Acme" }).success).toBe(true);
    for (const body of [
      { reasons: ["one"] }, { reasons: ["one", "two", "three", "four"] },
      { reasons: ["x".repeat(141), "two", "three"] },
      { ...input, roleTitle: "x".repeat(121) }, { ...input, companyName: "x".repeat(201) },
      { ...input, resumeId: 1 }, { ...input, name: "Private Name" },
      { ...input, email: "private@example.invalid" }, { ...input, jobLink: "https://example.invalid/job" },
    ]) expect(reasonsCoachInputSchema.safeParse(body).success).toBe(false);
  });
  it("keeps questions but rejects invented figures, proper nouns, statements and oversized lines", () => {
    expect(filterCoachQuestions([
      "Which result did you get there?", "You grew revenue 40%?", "Did you work at Contoso?",
      "Explain your results.", `What ${"x".repeat(160)}?`, "How did you measure the change?",
    ], input)).toEqual(["Which result did you get there?", "How did you measure the change?"]);
  });
  it("allows context already supplied, deduplicates and keeps at most three questions", () => {
    const context = { reasons: ["I reduced time by 20%.", "Design work.", "Product work."] as [string, string, string], companyName: "Acme" };
    const questions = ["What changed by 20%?", "Which result matters for Acme?", "What changed by 20%?", "How did you measure it?", "What did you learn?"];
    expect(filterCoachQuestions(questions, context)).toEqual(questions.filter((_, index) => [0, 1, 3].includes(index)));
  });
  it("requires a bounded, strict response instead of accepting arbitrary provider text", () => {
    expect(reasonsCoachResponseSchema.safeParse({ questions: ["Which result did you get there?"] }).success).toBe(true);
    expect(reasonsCoachResponseSchema.safeParse({ questions: ["Question?"], resume: "private" }).success).toBe(false);
    expect(reasonsCoachResponseSchema.safeParse({ questions: ["x".repeat(161)] }).success).toBe(false);
  });
});
