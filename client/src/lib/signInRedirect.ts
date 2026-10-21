import { isAuthPagePath, signInPagePath } from "@shared/authReturnTo";
import { referrerSignInHref } from "@/lib/referrerSignIn";

/**
 * Pages only a referrer uses. A signed-out person there is sent to the work-email sign-in
 * (FOUNDER-LOCKED login rule: referrers never see personal email, password or social options).
 */
const REFERRER_SURFACES = ["/referrer", "/referrer-home", "/referrer-setup", "/verify", "/queue", "/post-opportunity", "/email-review"] as const;

export type SignInRedirectLocation = { readonly pathname: string; readonly search: string; readonly hash: string; readonly origin: string };

function isReferrerSurface(pathname: string): boolean {
  const path = pathname.toLowerCase().replace(/\/+$/, "");
  return REFERRER_SURFACES.some(surface => path === surface || path.startsWith(`${surface}/`));
}

/**
 * Where a signed-out person goes when the app finds out mid-session that sign-in is needed. Referrer surfaces keep
 * the work-email sign-in; every other page opens skipwait.me's own /sign-in and comes back afterwards. Null on the
 * auth pages themselves, so an unauthorized response there never loops.
 */
export function signInRedirectTarget(current: SignInRedirectLocation, returnTo?: string): string | null {
  if (isAuthPagePath(current.pathname)) return null;
  const destination = returnTo ?? `${current.pathname}${current.search}${current.hash}`;
  let destinationPath = current.pathname;
  try { destinationPath = new URL(destination, current.origin).pathname; } catch { /* keep the current path */ }
  return isReferrerSurface(destinationPath) ? referrerSignInHref(destination) : signInPagePath(destination, current.origin);
}
