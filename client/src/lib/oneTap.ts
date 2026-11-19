// One-tap flags (D-095, D-097): each slice ships off until QA verifies it.
// Build-time Vite flags; enabling one needs a deploy with the variable set.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/** Signed-out Pay on /premium sends job seekers to the in-app /sign-in (same providers as everywhere) and returns to the pack they chose. */
export const ONE_TAP_PAY_SIGNIN = env.VITE_ONE_TAP_PAY_SIGNIN === "true";
