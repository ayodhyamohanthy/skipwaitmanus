import { describe, expect, it } from "vitest";
import { PLACEHOLDER_JOB_TITLE } from "../shared/jobFunctionClassifier";
import { displayJobLink, displayRoleTitle, roleTitleFromUrl } from "../shared/roleTitle";

describe("roleTitleFromUrl", () => {
  it.each([
    ["https://example.com/careers/senior-backend-engineer-payments", "Senior Backend Engineer Payments"],
    ["https://acme.wd5.myworkdayjobs.com/en-US/External/job/Bengaluru-India/Senior-Software-Engineer_R123456", "Senior Software Engineer"],
    ["https://www.linkedin.com/jobs/view/senior-data-analyst-at-acme-3789012345", "Senior Data Analyst"],
    ["https://jobs.smartrecruiters.com/Acme/743999-product-manager", "Product Manager"],
    ["https://example.com/jobs/ui-ux-designer-ii.html", "UI UX Designer II"],
    ["https://example.com/careers/head-of-growth-and-retention/", "Head of Growth and Retention"],
  ])("%s → %s", (url, title) => {
    expect(roleTitleFromUrl(url)).toBe(title);
  });

  it.each([
    "https://boards.greenhouse.io/acme/jobs/4567890",
    "https://jobs.lever.co/acme/1d2f3e4a-5b6c-7d8e-9f00-112233445566",
    "https://careers.example.com/job?id=123",
    "https://example.com/careers/",
    "not a url",
  ])("gives null when the path has no readable title: %s", url => {
    expect(roleTitleFromUrl(url)).toBeNull();
  });
});

describe("displayRoleTitle", () => {
  it("prefers a stored title over the link", () => {
    expect(displayRoleTitle({ title: "Staff Engineer", targetRoleUrl: "https://example.com/careers/product-manager" })).toBe("Staff Engineer");
  });
  it("reads the link when the stored title is the placeholder", () => {
    expect(displayRoleTitle({ title: PLACEHOLDER_JOB_TITLE, targetRoleUrl: "https://example.com/careers/product-manager" })).toBe("Product Manager");
  });
  it("falls back to the function, then to the placeholder", () => {
    expect(displayRoleTitle({ title: PLACEHOLDER_JOB_TITLE, targetRoleUrl: "https://boards.greenhouse.io/acme/jobs/1", jobFunction: "Data" })).toBe("Data role");
    expect(displayRoleTitle({ title: null, targetRoleUrl: null, jobFunction: "Other" })).toBe(PLACEHOLDER_JOB_TITLE);
  });
});

describe("displayJobLink", () => {
  it("drops the scheme, www and a trailing slash", () => {
    expect(displayJobLink("https://www.example.com/careers/role-name/")).toBe("example.com/careers/role-name");
    expect(displayJobLink("nope")).toBeNull();
  });
});
