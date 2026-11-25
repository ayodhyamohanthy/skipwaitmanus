// The seeker's social providers on the goal sign-in (D-048-p3-signin).
// FOUNDER-LOCKED login rule (D-030 as amended by D-049): job seekers get every
// social login straight to the provider through WorkOS on skipwait.me, never a
// hosted AuthKit page. Referrers never reach this module.
//
// This mirrors SEEKER_SOCIAL and seekerSocialUrl in components/SeekerSignIn.tsx
// because that file imports the kit Button, which a goal page may not reach
// (packet section 4 rule 3). signInGoal.test.tsx pins both lists and both URL
// builders equal, so a provider change in the shared core fails that test
// until this list follows.
export const GOAL_SEEKER_SOCIAL = [
  { id: "google", label: "Google" },
  { id: "microsoft", label: "Microsoft" },
  { id: "github", label: "GitHub" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "slack", label: "Slack" },
] as const;

export function goalSeekerSocialUrl(provider: string, returnTo: string): string {
  return `/api/auth/workos/sign-in?${new URLSearchParams({ returnTo, provider })}`;
}
