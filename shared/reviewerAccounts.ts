/**
 * REVIEWER-ISOLATION-1: demo review accounts are provisioned only by the
 * server's own reviewer-login route with openIds under this prefix, carried in
 * our signed session token - never user input, no extra identity store.
 * Leaf module on purpose: billing/environment code must not import the login
 * route (circular through db).
 */
export const REVIEWER_OPENID_PREFIX = "reviewer_";

export function isReviewerOpenId(openId: string | null | undefined): boolean {
  return typeof openId === "string" && openId.startsWith(REVIEWER_OPENID_PREFIX);
}
