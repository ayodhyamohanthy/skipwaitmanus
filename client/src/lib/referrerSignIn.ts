/**
 * Where a signed-out REFERRER goes to sign in. FOUNDER-LOCKED (Oct 16 2026): referrer sign-in
 * is work-email OTP verification ONLY - never personal email, never social logins. Job seekers
 * keep the full sign-in (personal email + social). Every referrer-facing "Sign in" must use this
 * href, never SignInButton / openSignIn (those open the full job-seeker AuthKit sign-in).
 */
export function referrerSignInHref(returnTo = "/referrer-setup"): string {
  return `/sign-in?${new URLSearchParams({ intent: "referrer", returnTo: safeReturnTo(returnTo) })}`;
}

/** Same-origin paths only ("/x"), never "//host" or a scheme. */
export function safeReturnTo(value: string | null | undefined, fallback = "/referrer-setup"): string {
  return value && /^\/(?!\/)[^\s\\]*$/.test(value) ? value : fallback;
}
