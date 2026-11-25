export function safeAuthReturnTo(value: unknown, origin: string): string | undefined {
  if (typeof value !== "string" || !value || value.length > 2048 || /[\\\u0000- \u007f]/.test(value) || value.startsWith("//")) return undefined;
  if (!value.startsWith("/") && !/^https?:\/\//i.test(value)) return undefined;
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.username || url.password || url.pathname.startsWith("//") || url.pathname.startsWith("/api/")) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return undefined; }
}

/** The on-site auth pages. Returning to one of them after sign-in would loop, so they are never a destination. */
const AUTH_PAGE_PATHS = ["/sign-in", "/forgot-password", "/reset-password"] as const;

export function isAuthPagePath(pathname: string): boolean {
  const path = pathname.toLowerCase().replace(/\/+$/, "");
  return AUTH_PAGE_PATHS.some(page => path === page || path.startsWith(`${page}/`));
}

/** A same-site path to land on after signing in: safeAuthReturnTo, minus the auth pages themselves. */
export function safeSignInReturnTo(value: unknown, origin: string): string | undefined {
  const safe = safeAuthReturnTo(value, origin);
  if (!safe) return undefined;
  try {
    return isAuthPagePath(new URL(safe, origin).pathname) ? undefined : safe;
  } catch { return undefined; }
}

/**
 * The one generator of a sign-in URL for seekers, shared pages and admins (D-030, D-049): skipwait.me's own
 * /sign-in page, never the hosted WorkOS page. Client entry points (openSignIn, SignInButton, startLogin, the ask
 * hand-off) and the server's provider-less /api/auth/workos/sign-in redirect all build it here. Referrer surfaces
 * use referrerSignInHref (work-email code only) instead.
 */
export function signInPagePath(returnTo: unknown, origin: string): string {
  const safe = safeSignInReturnTo(returnTo, origin);
  return safe ? `/sign-in?${new URLSearchParams({ returnTo: safe })}` : "/sign-in";
}
