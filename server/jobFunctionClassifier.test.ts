import { describe, expect, it } from "vitest";
import {
  JOB_FUNCTION_RULES,
  PLACEHOLDER_JOB_TITLE,
  classifyJobFunction,
  inferAskJobFunction,
  jobLinkRoleText,
  normalizeClassifierText,
  resolveAskJobFunction,
} from "../shared/jobFunctionClassifier";
import { JOB_FUNCTIONS } from "../shared/jobFunctions";

describe("classifyJobFunction", () => {
  it.each([
    ["Senior Product Designer", "Design"],
    ["UX/UI Designer", "Design"],
    ["User Researcher", "Design"],
    ["Product Manager, Data Platform", "Product"],
    ["Data Product Manager", "Product"],
    ["Product Owner", "Product"],
    ["Product Marketing Manager", "Marketing"],
    ["Product Analyst", "Data"],
    ["Product Engineer", "Engineering"],
    ["Senior Software Engineer - Data Platform", "Engineering"],
    ["Staff Backend Engineer", "Engineering"],
    ["Site Reliability Engineer (SRE)", "Engineering"],
    ["Hardware Design Engineer", "Engineering"],
    ["Data Engineer", "Data"],
    ["Machine Learning Engineer", "Data"],
    ["Marketing Data Analyst", "Data"],
    ["Data Entry Operator", "Operations"],
    ["Financial Analyst", "Finance"],
    ["FP&A Manager", "Finance"],
    ["Security Analyst", "Engineering"],
    ["Sales Engineer", "Sales"],
    ["Account Executive, Mid-Market", "Sales"],
    ["Sales Operations Lead", "Sales"],
    ["HR Operations Specialist", "HR"],
    ["People Operations Partner", "HR"],
    ["Technical Recruiter", "HR"],
    ["Technical Support Engineer", "Operations"],
    ["Supply Chain Analyst", "Operations"],
    ["Operations Manager", "Operations"],
    ["Growth Engineer", "Engineering"],
    ["Growth Product Manager", "Product"],
    ["Café Operations Lead — Bengaluru", "Operations"],
    ["Brand Designer", "Design"],
  ])("%s -> %s", (title, expected) => {
    expect(classifyJobFunction(title)).toBe(expected);
  });

  it.each(["Program Manager", "Legal Counsel", "Chief of Staff", "Consultant", "Intern", "", "   ", "!!!", PLACEHOLDER_JOB_TITLE])("returns null when nothing names a function: %j", title => {
    expect(classifyJobFunction(title)).toBeNull();
  });

  it("maps the kit onboarding roles", () => {
    const roles: Record<string, string | null> = {
      "Software Engineer": "Engineering", "Product Manager": "Product", "Product Designer": "Design", "Data Analyst": "Data", "Data Scientist": "Data",
      Marketing: "Marketing", Operations: "Operations", Sales: "Sales", "Customer Success": "Sales", Consulting: null,
    };
    for (const [role, expected] of Object.entries(roles)) expect(classifyJobFunction(role)).toBe(expected);
  });

  it("matches whole words only", () => {
    expect(classifyJobFunction("Syntax wizard")).toBeNull();
    expect(classifyJobFunction("Datadog advocate")).toBeNull();
    expect(classifyJobFunction("Hrishikesh's team")).toBeNull();
  });

  it("keeps its rule table well formed", () => {
    const phrases = JOB_FUNCTION_RULES.map(([phrase]) => phrase);
    expect(new Set(phrases).size).toBe(phrases.length);
    for (const [phrase, jobFunction] of JOB_FUNCTION_RULES) {
      expect(normalizeClassifierText(phrase)).toBe(phrase);
      expect(JOB_FUNCTIONS).toContain(jobFunction);
      expect(jobFunction).not.toBe("Other");
    }
  });
});

describe("job link role text and ask inference", () => {
  it("reads role words from the link path only", () => {
    expect(jobLinkRoleText("https://careers.wipro.com/job/product-designer-123?utm_source=data&team=hr#sales")).toBe("job product designer 123");
    expect(jobLinkRoleText("https://jobs.example.com/Senior%20Data%20Analyst+Remote")).toBe("senior data analyst remote");
    expect(jobLinkRoleText("not a url")).toBe("");
    expect(jobLinkRoleText(null)).toBe("");
  });

  it("drops a hosted board's company handle and LinkedIn's company suffix", () => {
    expect(jobLinkRoleText("https://jobs.lever.co/data-company/9f1c2b7e")).toBe("9f1c2b7e");
    expect(jobLinkRoleText("https://boards.greenhouse.io/designit/jobs/4567")).toBe("jobs 4567");
    expect(jobLinkRoleText("https://wellfound.com/company/data-axle/jobs/123-account-executive")).toBe("jobs 123 account executive");
    expect(jobLinkRoleText("https://www.linkedin.com/jobs/view/senior-product-designer-at-data-axle-3912345")).toBe("jobs view senior product designer");
  });

  it("infers from a real title first, then the link; the placeholder title never counts", () => {
    expect(inferAskJobFunction({ title: "Data Analyst", targetRoleUrl: "https://careers.acme.com/job/product-designer" })).toBe("Data");
    expect(inferAskJobFunction({ title: PLACEHOLDER_JOB_TITLE, targetRoleUrl: "https://careers.acme.com/job/product-designer" })).toBe("Design");
    expect(inferAskJobFunction({ title: null, targetRoleUrl: "https://boards.greenhouse.io/acme/jobs/4567" })).toBeNull();
    expect(inferAskJobFunction({ title: "  ", targetRoleUrl: "https://jobs.lever.co/sales-co/abc" })).toBeNull();
    expect(inferAskJobFunction({ targetRoleUrl: "https://acme.wd5.myworkdayjobs.com/en-US/External/job/Bangalore/Senior-Software-Engineer_JR123" })).toBe("Engineering");
  });

  it("stores the seeker's explicit choice over the guess, and a guess (possibly null) otherwise", () => {
    const url = "https://careers.acme.com/job/product-designer";
    expect(resolveAskJobFunction({ explicit: "Product", targetRoleUrl: url })).toEqual({ jobFunction: "Product", source: "seeker" });
    expect(resolveAskJobFunction({ explicit: "Other", targetRoleUrl: url })).toEqual({ jobFunction: "Other", source: "seeker" });
    expect(resolveAskJobFunction({ targetRoleUrl: url })).toEqual({ jobFunction: "Design", source: "inferred" });
    expect(resolveAskJobFunction({ explicit: null, targetRoleUrl: "https://careers.acme.com/jobs/123" })).toEqual({ jobFunction: null, source: "inferred" });
  });
});
