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

// /ask and company doors (/explore/:slug) own referral query handoff.
// Never forward unrelated query values into the authentication return URL.
// Only the company door's own drawer returns to the door: the caller says so
// (companyDoor), because /ask and the other composers can be rendered under an
// /explore path and must still return to /ask (the P0 personal-link round trip).
export function askSignInReturnTo(
  pathname: string,
  search: string,
  postSelection?: { opportunityId?: number | null } | null,
  options?: { companyDoor?: boolean },
): string {
  const cleanPath = pathname.replace(/\/+$/, "");
  const isCompanyDoor = options?.companyDoor === true && /^\/explore\/[^/]+$/.test(cleanPath);

  if (isCompanyDoor) {
    const source = new URLSearchParams(search);
    const rawPost = source.get("post");
    const oppId = postSelection?.opportunityId ?? (rawPost && /^\d+$/.test(rawPost) ? Number(rawPost) : undefined);
    const params = new URLSearchParams();
    params.set("open", "1");
    if (oppId !== undefined && oppId > 0) {
      params.set("post", String(oppId));
    }
    return `${cleanPath}?${params.toString()}`;
  }

  if (pathname !== "/ask") return "/ask";
  const source = new URLSearchParams(search);
  const allowed = new URLSearchParams();
  for (const key of ["fast", "referCompany", "referAlias", "post"]) {
    const value = source.get(key);
    if (value !== null) allowed.set(key, value);
  }
  if (!allowed.has("post") && postSelection?.opportunityId) {
    allowed.set("post", String(postSelection.opportunityId));
  }
  const query = allowed.toString();
  return query ? `/ask?${query}` : "/ask";
}
