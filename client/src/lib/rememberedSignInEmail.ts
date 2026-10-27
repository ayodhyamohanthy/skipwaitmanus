/**
 * The email this device last signed in with, so a returning person sees it
 * prefilled. Sign-in is passwordless (an emailed code), so the phone's password
 * manager never saves a skipwait.me login and has nothing to suggest.
 * Seekers and referrers keep separate keys: a referrer's work email never
 * prefills the seeker form, and the reverse. Storage can be blocked (private
 * mode, cleared site data), so every read and write fails quietly.
 */
export type SignInRole = "seeker" | "referrer";

const KEYS: Readonly<Record<SignInRole, string>> = {
  seeker: "skipwait:signin-email:seeker",
  referrer: "skipwait:signin-email:referrer",
};
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

export function rememberedSignInEmail(role: SignInRole): string {
  try {
    const value = window.localStorage.getItem(KEYS[role]) ?? "";
    return value.length <= 320 && EMAIL.test(value) ? value : "";
  } catch {
    return "";
  }
}

export function rememberSignInEmail(role: SignInRole, email: string): void {
  const value = email.trim().toLowerCase();
  if (!EMAIL.test(value) || value.length > 320) return;
  try { window.localStorage.setItem(KEYS[role], value); } catch { /* storage blocked: nothing to remember */ }
}

export function forgetSignInEmail(role: SignInRole): void {
  try { window.localStorage.removeItem(KEYS[role]); } catch { /* storage blocked: nothing stored */ }
}
