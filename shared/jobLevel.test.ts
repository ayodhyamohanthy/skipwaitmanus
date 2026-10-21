import { describe, expect, it } from "vitest";
import { assignJobLevel, creditsForLevel, parseYearsOfExperience, type JobLevel } from "./jobLevel";

const lvl = (title: string, extra: { description?: string; url?: string } = {}) => assignJobLevel({ title, ...extra });

describe("job level classifier (always a level, never unread)", () => {
  it("seniority keywords in the title, high confidence", () => {
    expect(lvl("Senior Frontend Engineer")).toMatchObject({ level: 5, confidence: "high" });
    expect(lvl("Software Engineer Intern")).toMatchObject({ level: 1 });
    expect(lvl("Fresher - Data Analyst")).toMatchObject({ level: 2 });
    expect(lvl("Staff Software Engineer")).toMatchObject({ level: 7 });
    expect(lvl("Principal Product Designer")).toMatchObject({ level: 8 });
    expect(lvl("Director of Engineering")).toMatchObject({ level: 9 });
    expect(lvl("VP Sales")).toMatchObject({ level: 10 });
    expect(lvl("Chief Technology Officer")).toMatchObject({ level: 10 });
  });
  it("specific phrases beat the generic words inside them", () => {
    expect(lvl("Vice President, Product")).toMatchObject({ level: 10 });
    expect(lvl("Head of People Operations")).toMatchObject({ level: 9 });
    expect(lvl("Tech Lead, Platform")).toMatchObject({ level: 7 });
  });
  it("explicit ladder tags map conservatively", () => {
    expect(lvl("SDE 2, Marketplace")).toMatchObject({ level: 4, confidence: "high", basis: "ladder-tag" });
    expect(lvl("IC5 Backend Engineer")).toMatchObject({ level: 7 });
    expect(lvl("Software Engineer L3")).toMatchObject({ level: 5 });
  });
  it("years of experience, lower bound of a range (tie-break to lower)", () => {
    expect(parseYearsOfExperience("Requires 5-8 years of experience")).toBe(5);
    expect(parseYearsOfExperience("3+ years in fintech")).toBe(3);
    expect(parseYearsOfExperience("minimum 7 years")).toBe(7);
    expect(parseYearsOfExperience("no numbers here")).toBeNull();
    expect(lvl("Backend Engineer", { description: "5+ years building APIs" })).toMatchObject({ level: 5, confidence: "medium" });
    expect(lvl("Backend Engineer", { description: "2-4 years building APIs" })).toMatchObject({ level: 3, confidence: "medium" });
  });
  it("URL words are a weaker signal than the title", () => {
    expect(lvl("Product Analyst", { url: "https://jobs.example.com/senior-product-analyst-123" })).toMatchObject({ level: 5, confidence: "medium", basis: "url:senior" });
  });
  it("conflicting signals take the lower level", () => {
    const r = lvl("Software Engineer", { description: "8+ years, lead a team of 6" });
    expect(r.level).toBe(7);
    expect(lvl("Engineer", { description: "8+ years, mentoring interns" })).toMatchObject({ level: 5 });
  });
  it("no signal falls back to L2 low confidence, never null", () => {
    expect(lvl("")).toMatchObject({ level: 2, confidence: "low", basis: "fallback" });
    expect(lvl("Role from shared job link")).toMatchObject({ level: 2, confidence: "low" });
    expect(assignJobLevel({})).toMatchObject({ level: 2, confidence: "low" });
  });
  it("credit cost is the level number (owner rule)", () => {
    expect(creditsForLevel(1)).toBe(1);
    expect(creditsForLevel(10)).toBe(10);
  });
});

// Hand-labeled blind sample across functions and regions (India + US style
// titles). Prod holds only 21 job rows, 20 of them placeholder titles, so a
// 200-row real sample does not exist yet; this sample is the accuracy gate.
const SAMPLE: ReadonlyArray<readonly [title: string, expected: JobLevel]> = [
  ["Software Engineer Intern", 1], ["Data Science Intern", 1], ["Graduate Engineer Trainee", 2],
  ["Junior Software Developer", 2], ["Associate Consultant", 2], ["Entry Level Recruiter", 2],
  ["Software Engineer", 2], ["Business Analyst", 2], ["Customer Support Executive", 2],
  ["Senior Software Engineer", 5], ["Senior Product Manager", 5], ["Senior UX Designer", 5],
  ["Sr. Data Analyst", 5], ["Senior Accountant", 5], ["Senior HR Business Partner", 5],
  ["Staff Engineer", 7], ["Engineering Manager", 7], ["Team Lead - QA", 7], ["Product Lead", 7],
  ["Principal Engineer", 8], ["Solution Architect", 8], ["Distinguished Engineer", 8],
  ["Director of Sales", 9], ["Head of Marketing", 9], ["Director, Data Science", 9],
  ["VP Engineering", 10], ["Chief Financial Officer", 10], ["Vice President - Operations", 10],
  ["SDE 2", 4], ["SDE 3 - Search", 5], ["IC4 Platform Engineer", 6],
  ["Marketing Intern - Summer", 1], ["Trainee Accountant", 1],
];

describe("labeled sample accuracy", () => {
  it("classifies the labeled sample at >=85% exact level", () => {
    const misses = SAMPLE.filter(([title, expected]) => lvl(title).level !== expected);
    expect(misses.length / SAMPLE.length).toBeLessThanOrEqual(0.15);
  });
  it("never returns a level above the label by more than one band on the sample", () => {
    for (const [title, expected] of SAMPLE) expect(lvl(title).level).toBeLessThanOrEqual(expected + 1);
  });
});
