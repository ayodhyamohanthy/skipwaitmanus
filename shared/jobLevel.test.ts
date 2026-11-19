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
    expect(lvl("Chief Technology Officer")).toMatchObject({ level: 10 });
  });
  it("specific phrases beat the generic words inside them", () => {
    expect(lvl("Vice President, Product")).toMatchObject({ level: 8 });
    expect(lvl("Head of People Operations")).toMatchObject({ level: 9 });
    expect(lvl("Tech Lead, Platform")).toMatchObject({ level: 7 });
    expect(lvl("Senior Product Manager")).toMatchObject({ level: 5 });
  });
  it("explicit ladder tags map conservatively", () => {
    expect(lvl("SDE 2, Marketplace")).toMatchObject({ level: 4, confidence: "high", basis: "ladder-tag" });
    expect(lvl("IC5 Backend Engineer")).toMatchObject({ level: 7 });
    expect(lvl("Software Engineer (L5)")).toMatchObject({ level: 5, confidence: "medium", basis: "ladder-tag-bare" });
    expect(lvl("Software Engineer L3")).toMatchObject({ level: 3, confidence: "medium", basis: "ladder-tag-bare" });
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
    expect(lvl("Software Engineer", { description: "8+ years, lead a team of 6" }).level).toBe(5);
    expect(lvl("Engineer", { description: "8+ years, mentoring interns" })).toMatchObject({ level: 4 });
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

describe("adversarial cases (growth review, Oct 21)", () => {
  it("(1) hyphenated ladder tags", () => {
    expect(lvl("SDE-3, Ads")).toMatchObject({ level: 5, basis: "ladder-tag" });
    expect(lvl("SDE-2")).toMatchObject({ level: 4, basis: "ladder-tag" });
  });
  it("(2) single-letter tag false positives are not tags", () => {
    expect(lvl("Ex-Serviceman, Facility Operations").level).not.toBe(10);
    expect(lvl("EV Charging Engineer").level).not.toBe(7);
    expect(lvl("Pi Data Analyst")).toMatchObject({ level: 2, confidence: "low", basis: "fallback" });
  });
  it("(3) bare role + numeric/roman suffix", () => {
    expect(lvl("Software Engineer II")).toMatchObject({ level: 4, confidence: "medium" });
    expect(lvl("Software Engineer 2")).toMatchObject({ level: 4 });
    expect(lvl("Product Analyst III")).toMatchObject({ level: 5 });
  });
  it("(4b) bare L-number maps to itself, medium, capped at L6 (growth round 2)", () => {
    expect(lvl("Software Engineer (L5)")).toMatchObject({ level: 5, confidence: "medium" });
    expect(lvl("Backend Engineer (L9)").level).toBeLessThanOrEqual(6);
  });
  it("(4c) associate product manager family (growth round 2)", () => {
    expect(lvl("Associate Product Manager")).toMatchObject({ level: 3 });
    expect(lvl("Associate Program Manager")).toMatchObject({ level: 3 });
  });
  it("(1b) company age is not candidate experience (growth round 2)", () => {
    expect(parseYearsOfExperience("Company has 20 years in business")).toBeNull();
    expect(parseYearsOfExperience("A legacy of 30 years of excellence")).toBeNull();
    expect(lvl("Sales Executive", { description: "Company has 20 years in business" })).toMatchObject({ level: 2, confidence: "low" });
    expect(lvl("Chat Support", { description: "2.5 years experience in chat support" })).toMatchObject({ level: 3, confidence: "medium" });
  });
  it("(4) years parsing traps", () => {
    expect(parseYearsOfExperience("Candidates must be 18 years of age or older")).toBeNull();
    expect(lvl("Data Entry Clerk", { description: "Applicants 18 years of age welcome" }).level).toBe(2);
    expect(parseYearsOfExperience("2.5 years in support roles")).toBe(2);
    expect(lvl("Support Associate", { description: "0-2 years experience" })).toMatchObject({ level: 2 });
    expect(lvl("Engineer", { description: "18 years of experience in payments" }).level).toBeLessThanOrEqual(6);
  });
  it("(5) banking and executive titles", () => {
    expect(lvl("Assistant Vice President, Risk")).toMatchObject({ level: 6 });
    expect(lvl("Associate Vice President - Operations")).toMatchObject({ level: 6 });
    expect(lvl("Vice President, Corporate Banking")).toMatchObject({ level: 8 });
    expect(lvl("Senior Vice President")).toMatchObject({ level: 9 });
    expect(lvl("Managing Director")).toMatchObject({ level: 10 });
    expect(lvl("Partner, Audit")).toMatchObject({ level: 9 });
    expect(lvl("President")).toMatchObject({ level: 9 });
  });
  it("(6) intern/trainee wins over every other word", () => {
    expect(lvl("Product Manager Intern")).toMatchObject({ level: 1 });
    expect(lvl("Manager Trainee")).toMatchObject({ level: 1 });
    expect(lvl("Lead Product Manager")).toMatchObject({ level: 6 });
    expect(lvl("Group Product Manager")).toMatchObject({ level: 7 });
    expect(lvl("Sr. Product Manager")).toMatchObject({ level: 5 });
  });
  it("(7) plain manager is mid, assistant/deputy lower", () => {
    expect(lvl("Manager")).toMatchObject({ level: 5, confidence: "medium" });
    expect(lvl("Assistant Manager, Stores")).toMatchObject({ level: 3 });
    expect(lvl("Deputy Manager - Logistics")).toMatchObject({ level: 3 });
    expect(lvl("Engineering Manager")).toMatchObject({ level: 7 });
  });
  it("(8) collision phrases are not seniority", () => {
    expect(lvl("Lead Generation Executive").level).toBeLessThanOrEqual(3);
    expect(lvl("Staff Nurse, ICU")).toMatchObject({ level: 3 });
    expect(lvl("Research Fellow, Economics")).toMatchObject({ level: 2 });
    expect(lvl("Solution Architect")).toMatchObject({ level: 7 });
    expect(lvl("Mid-Senior Developer")).toMatchObject({ level: 4 });
  });
  it("(9) ambiguous words never reach high confidence", () => {
    for (const title of ["Team Lead", "Manager", "Partner, Tax", "Solution Architect", "Head of Growth", "Compliance Officer", "HR Specialist", "Associate Director is excluded"]) {
      if (title === "Associate Director is excluded") continue;
      expect(lvl(title).confidence).not.toBe("high");
    }
  });
  it("(10) low-confidence results never exceed L5", () => {
    expect(lvl("Engineer", { description: "You lead a team of twelve across three cities" }).level).toBeLessThanOrEqual(5);
    expect(lvl("Analyst", { description: "Mentor new joiners" }).level).toBeLessThanOrEqual(5);
    expect(lvl("Anything At All").level).toBeLessThanOrEqual(5);
  });
  it("(11) the URL layer is capped at L6", () => {
    expect(lvl("Engineer", { url: "https://jobs.example.com/director-of-engineering-9" }).level).toBeLessThanOrEqual(6);
    expect(lvl("Analyst", { url: "https://boards.example.com/vice-president-sales" }).level).toBeLessThanOrEqual(6);
  });
  it("(12) previously missing titles", () => {
    expect(lvl("AGM, Branch Banking")).toMatchObject({ level: 6 });
    expect(lvl("DGM Operations")).toMatchObject({ level: 7 });
    expect(lvl("General Manager, Hotels")).toMatchObject({ level: 8 });
    expect(lvl("Administrative Officer")).toMatchObject({ level: 3 });
    expect(lvl("SEO Specialist")).toMatchObject({ level: 3 });
    expect(lvl("SAP Consultant")).toMatchObject({ level: 3 });
  });
});

// Hand-labeled blind sample across functions and regions (India + US style
// titles). Prod holds only 21 job rows, 20 of them placeholder titles, so a
// 200-row real sample does not exist yet; this sample is the accuracy gate.
const SAMPLE: ReadonlyArray<readonly [title: string, expected: JobLevel]> = [
  ["Software Engineer Intern", 1], ["Data Science Intern", 1], ["Graduate Engineer Trainee", 1],
  ["Junior Software Developer", 2], ["Associate Consultant", 3], ["Entry Level Recruiter", 2],
  ["Software Engineer", 2], ["Business Analyst", 2], ["Customer Support Executive", 2],
  ["Senior Software Engineer", 5], ["Senior Product Manager", 5], ["Senior UX Designer", 5],
  ["Sr. Data Analyst", 5], ["Senior Accountant", 5], ["Senior HR Business Partner", 5],
  ["Staff Engineer", 7], ["Engineering Manager", 7], ["Team Lead - QA", 7], ["Product Lead", 6],
  ["Principal Engineer", 8], ["Solution Architect", 7], ["Distinguished Engineer", 8],
  ["Director of Sales", 9], ["Head of Marketing", 9], ["Director, Data Science", 9],
  ["VP Engineering", 8], ["Chief Financial Officer", 10], ["Vice President - Operations", 8],
  ["SDE 2", 4], ["SDE 3 - Search", 5], ["IC4 Platform Engineer", 6],
  ["Marketing Intern - Summer", 1], ["Trainee Accountant", 1],
];

describe("labeled sample accuracy", () => {
  it("classifies the labeled sample at >=85% exact level", () => {
    const misses = SAMPLE.filter(([title, expected]) => lvl(title).level !== expected);
    if (misses.length > 0) console.log("misses:", misses.map(([t, e]) => `${t} exp=${e} got=${lvl(t).level}`).join("; "));
    expect(misses.length / SAMPLE.length).toBeLessThanOrEqual(0.15);
  });
  it("never returns a level above the label by more than one band on the sample", () => {
    for (const [title, expected] of SAMPLE) expect(lvl(title).level).toBeLessThanOrEqual(expected + 1);
  });
});
