// D-174-seeker-journey-build.typeahead-flip: pure resolver for the company-typeahead
// build flag. Dependency-free so vite.config.ts and its test import it with no side effects.
export type CompanyTypeaheadFlagEnv = {
  WORKERS_CI?: string | undefined;
  WORKERS_CI_BRANCH?: string | undefined;
  GITHUB_REF_NAME?: string | undefined;
  VITE_COMPANY_TYPEAHEAD?: string | undefined;
} & Record<string, string | undefined>;

export function resolveCompanyTypeaheadFlag(env: CompanyTypeaheadFlagEnv): "true" | "false" {
  const rawBranch = env.WORKERS_CI_BRANCH ?? env.GITHUB_REF_NAME;
  // Fail closed: an empty or whitespace branch is unknown, and unknown is never main's
  // opposite - it just never turns the flag on.
  const ciBranch = rawBranch && rawBranch.trim() ? rawBranch.trim() : undefined;
  // Release-gate guard: a CI build of the production branch always builds with the flag
  // OFF, even if VITE_COMPANY_TYPEAHEAD=true is set in that environment. This is
  // deliberately weaker than the old literal-false constant: a local, ad-hoc, tag or PR
  // build with the variable set DOES produce a flag-on artifact, and the residual manual
  // promotion paths could carry one to production. The recorded release gate (D-223 (3))
  // is the process control over those paths, not a code guarantee; production activation
  // stays held.
  if (ciBranch === "main") return "false";
  if (env.VITE_COMPANY_TYPEAHEAD != null) return env.VITE_COMPANY_TYPEAHEAD === "true" ? "true" : "false";
  // Workers Builds injects WORKERS_CI=1 and WORKERS_CI_BRANCH on every branch build, and
  // branch builds are the previews: production-branch auto-builds are disabled in the
  // dashboard and production deploys run from GitHub Actions on main (guarded above).
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
