// D-174-seeker-journey-build.typeahead-flip: pins the build-flag resolver that feeds the
// vite.config.ts define. Lives under client/src because vitest's include only covers
// client/src/**/*.test.ts; the resolver itself is dependency-free.
import { describe, expect, it } from "vitest";
import { resolveCompanyTypeaheadFlag } from "../../../../vite.typeahead-flag";

describe("resolveCompanyTypeaheadFlag (D-174-seeker-journey-build.typeahead-flip)", () => {
  it("defaults off: local, dev and test environments build dark", () => {
    expect(resolveCompanyTypeaheadFlag({})).toBe("false");
  });

  it("honors the explicit variable outside production-branch CI builds", () => {
    expect(resolveCompanyTypeaheadFlag({ VITE_COMPANY_TYPEAHEAD: "true" })).toBe("true");
    expect(resolveCompanyTypeaheadFlag({ VITE_COMPANY_TYPEAHEAD: "false" })).toBe("false");
    expect(resolveCompanyTypeaheadFlag({ VITE_COMPANY_TYPEAHEAD: "1" })).toBe("false");
  });

  it("turns on for Workers Builds branch previews (WORKERS_CI=1, non-main branch)", () => {
    expect(resolveCompanyTypeaheadFlag({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "agent/queue/d174-typeahead-flip" })).toBe("true");
  });

  it("ships on for a Workers Builds main build (release flip); the explicit variable overrides in either direction", () => {
    expect(resolveCompanyTypeaheadFlag({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" })).toBe("true");
    expect(resolveCompanyTypeaheadFlag({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "main", VITE_COMPANY_TYPEAHEAD: "true" })).toBe("true");
    expect(resolveCompanyTypeaheadFlag({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "main", VITE_COMPANY_TYPEAHEAD: "false" })).toBe("false");
  });

  it("ships on for a GitHub Actions main deploy build (release flip); VITE_COMPANY_TYPEAHEAD=false rolls it back", () => {
    expect(resolveCompanyTypeaheadFlag({ GITHUB_REF_NAME: "main" })).toBe("true");
    expect(resolveCompanyTypeaheadFlag({ GITHUB_REF_NAME: "main", VITE_COMPANY_TYPEAHEAD: "true" })).toBe("true");
    expect(resolveCompanyTypeaheadFlag({ GITHUB_REF_NAME: "main", VITE_COMPANY_TYPEAHEAD: "false" })).toBe("false");
  });

  it("fails closed on an unknown or empty CI branch", () => {
    expect(resolveCompanyTypeaheadFlag({ WORKERS_CI: "1" })).toBe("false");
    expect(resolveCompanyTypeaheadFlag({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "" })).toBe("false");
    expect(resolveCompanyTypeaheadFlag({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "   " })).toBe("false");
  });

  it("covers non-main CI refs: a tag ref builds dark unless the variable is explicitly set (no workflow deploys tags)", () => {
    expect(resolveCompanyTypeaheadFlag({ GITHUB_REF_NAME: "v1.2.3" })).toBe("false");
    expect(resolveCompanyTypeaheadFlag({ GITHUB_REF_NAME: "v1.2.3", VITE_COMPANY_TYPEAHEAD: "true" })).toBe("true");
  });

  it("treats GitHub pull-request refs as non-main but never preview-on by themselves", () => {
    expect(resolveCompanyTypeaheadFlag({ GITHUB_REF_NAME: "1263/merge" })).toBe("false");
    expect(resolveCompanyTypeaheadFlag({ GITHUB_REF_NAME: "1263/merge", VITE_COMPANY_TYPEAHEAD: "true" })).toBe("true");
  });
});
