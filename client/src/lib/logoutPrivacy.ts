import { clearPendingResumeFiles } from "@/lib/pendingResume";
import { clearReferralDraft } from "@/lib/pwaContinuity";

const referralLocalStorageKeys = [
  "bridge-name",
  "bridge-target-url",
  "bridge-seeker-attachments",
  "bridge-request-sent",
  "bridge-tokens",
  "bridge-job-seeker-token-reset-3-free-v1",
  "manus-runtime-user-info",
] as const;

const referralSessionStorageKeys = ["skipwait-pending-resume-submit", "skipwait:employee-sign-in-email", "skipwait:company-coverage-invite"] as const;

/** Removes browser-side artifacts that must never cross a signed-out boundary. */
export async function clearPrivateReferralBrowserData(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    referralLocalStorageKeys.forEach(key => window.localStorage.removeItem(key));
    clearReferralDraft(window.localStorage);
  } catch {
    // Browser privacy controls can restrict storage; continue clearing the remaining stores.
  }

  try {
    referralSessionStorageKeys.forEach(key => window.sessionStorage.removeItem(key));
  } catch {
    // Best-effort cleanup is still preferable to failing sign-out.
  }

  try {
    await clearPendingResumeFiles();
  } catch {
    // The next unsigned session must still begin without locally readable metadata.
  }
}
