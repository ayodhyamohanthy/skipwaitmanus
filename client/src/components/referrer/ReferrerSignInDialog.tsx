// Shared one-shot OTP landing markers for the goal referrer entrypoint.
// This module keeps the existing marker contract, not a sign-in dialog.

/**
 * One-shot marker for "this tab just completed the referrer OTP sign-in".
 * ReferrerOtpSignIn reloads the page on success; the marker lets /referrer
 * keep its post-sign-in landing (inbox or returnTo) without bouncing every
 * later visit to the workspace overview.
 */
export const REFERRER_OTP_LANDING_KEY = "skipwait:referrer-otp-landing";

export function markReferrerOtpLanding(active: boolean) {
  try {
    if (active) window.sessionStorage.setItem(REFERRER_OTP_LANDING_KEY, "1");
    else window.sessionStorage.removeItem(REFERRER_OTP_LANDING_KEY);
  } catch {
    // Storage can be unavailable (private mode); the landing then stays on the overview.
  }
}

export function consumeReferrerOtpLanding(): boolean {
  try {
    const pending = window.sessionStorage.getItem(REFERRER_OTP_LANDING_KEY) === "1";
    if (pending) window.sessionStorage.removeItem(REFERRER_OTP_LANDING_KEY);
    return pending;
  } catch {
    return false;
  }
}
