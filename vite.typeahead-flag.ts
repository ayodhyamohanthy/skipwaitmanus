// D-174-seeker-journey-build.typeahead-flip: pure resolver for the company-typeahead
// build flag. Dependency-free so vite.config.ts and its test import it with no side effects.
export type CompanyTypeaheadFlagEnv = {
  WORKERS_CI?: string | undefined;
  WORKERS_CI_BRANCH?: string | undefined;
  GITHUB_REF_NAME?: string | undefined;
  VITE_COMPANY_TYPEAHEAD?: string | undefined;
} & Record<string, string | undefined>;

export function resolveCompanyTypeaheadFlag(env: CompanyTypeaheadFlagEnv): "true" | "false" {
  // The explicit variable always wins, in either direction: "false" forces a dark build
  // even on main, "true" forces a flag-on build anywhere. This is the rollback switch.
  if (env.VITE_COMPANY_TYPEAHEAD != null) return env.VITE_COMPANY_TYPEAHEAD === "true" ? "true" : "false";
  const rawBranch = env.WORKERS_CI_BRANCH ?? env.GITHUB_REF_NAME;
  // Fail closed: an empty or whitespace branch is unknown, and unknown is never main's
  // opposite - it just never turns the flag on.
  const ciBranch = rawBranch && rawBranch.trim() ? rawBranch.trim() : undefined;
  // RELEASE FLIP (2026-11-18): CI builds of the production branch now build with the
  // typeahead ON. The owner reported the defect on 2026-11-17 (typed company not found;
  // the search must reach any company worldwide) and the dark build passed preview QA
  // and independent review before this enable. Rollback: revert this change, or set
  // VITE_COMPANY_TYPEAHEAD=false on the build.
  if (ciBranch === "main") return "true";
  // Workers Builds injects WORKERS_CI=1 and WORKERS_CI_BRANCH on every branch build, and
  // branch builds are the previews: production-branch auto-builds are disabled in the
  // dashboard and production deploys run from GitHub Actions on main (handled above).
  // Provider variables named by the Cloudflare Workers Builds changelog (2025-06-10,
  // "Access git commit sha and branch name as environment variables in Workers Builds")
  // and pinned by this row's unit tests. NOT verified end-to-end: this worker serves no
  // reachable branch versions (workers.dev and previews are disabled on it), so the
  // interactive preview QA ran on a local explicit-var build - a different branch of
  // this resolver. This Workers Builds path stays unproven until a reachable branch
  // build exists.
  if (env.WORKERS_CI === "1" && ciBranch) return "true";
  return "false";
}
