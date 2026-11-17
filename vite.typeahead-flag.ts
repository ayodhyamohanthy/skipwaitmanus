// D-174-seeker-journey-build.typeahead-flip: pure resolver for the company-typeahead
// build flag. Dependency-free so vite.config.ts and its test import it with no side effects.
export interface CompanyTypeaheadFlagEnv {
  WORKERS_CI?: string | undefined;
  WORKERS_CI_BRANCH?: string | undefined;
  GITHUB_REF_NAME?: string | undefined;
  VITE_COMPANY_TYPEAHEAD?: string | undefined;
}

export function resolveCompanyTypeaheadFlag(env: CompanyTypeaheadFlagEnv): "true" | "false" {
  const rawBranch = env.WORKERS_CI_BRANCH ?? env.GITHUB_REF_NAME;
  // Fail closed: an empty or whitespace branch is unknown, and unknown is never main's
  // opposite - it just never turns the flag on.
  const ciBranch = rawBranch && rawBranch.trim() ? rawBranch.trim() : undefined;
  // Release-gate guard: a CI build of the production branch always builds with the flag
  // OFF, even if VITE_COMPANY_TYPEAHEAD=true is set in that environment. Turning the
  // surface on in production is a code change through the recorded release gate
  // (D-223 (3)), never an environment variable alone.
  if (ciBranch === "main") return "false";
  if (env.VITE_COMPANY_TYPEAHEAD != null) return env.VITE_COMPANY_TYPEAHEAD === "true" ? "true" : "false";
  // Workers Builds injects WORKERS_CI=1 and WORKERS_CI_BRANCH on every branch build, and
  // branch builds are the previews: production-branch auto-builds are disabled in the
  // dashboard and production deploys run from GitHub Actions on main (guarded above).
  // Provider variables verified against the Cloudflare Workers Builds changelog
  // (2025-06-10, "Access git commit sha and branch name as environment variables in
  // Workers Builds") and end-to-end by the preview QA on this row's own branch build.
  if (env.WORKERS_CI === "1" && ciBranch) return "true";
  return "false";
}
