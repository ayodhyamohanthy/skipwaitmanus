/**
 * Job-seeker sign-in before an ask is sent (the company-page hand-off's path):
 * the server signs the returnTo into a short-lived cookie and the seeker lands
 * back on /ask, where the saved prefill restores the link and reasons. /sign-in
 * ignores returnTo for seekers, so it is never used here. One place, so the
 * seeker-password lane (docs/plans/seeker-passwords.md) changes it once.
 */
export function seekerSignInUrl(returnTo: string): string {
  return `/api/auth/workos/sign-in?${new URLSearchParams({ returnTo })}`;
}

export function goToSeekerSignIn(returnTo: string): void {
  window.location.assign(seekerSignInUrl(returnTo));
}
