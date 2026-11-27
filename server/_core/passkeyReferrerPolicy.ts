import type { Profile, User } from "../../drizzle/schema";
import { REFERRER_PASSKEY_SIGNIN_ENABLED, REFERRER_PASSKEY_WORK_EMAIL_MAX_AGE_MS, referrerPasskeyWorkEmailSchema } from "../../shared/referrerPasskeys";

export type ReferrerPasskeyAccount = Pick<User, "id" | "openId" | "suspended">;
export type ReferrerPasskeyProfile = Pick<Profile, "userId" | "accountType" | "workEmailDomain" | "workEmailVerifiedAt">;

/** The environment override is test-only; deployment configuration cannot release this feature. */
export function referrerPasskeySignInOn(): boolean {
  return REFERRER_PASSKEY_SIGNIN_ENABLED || (process.env.NODE_ENV === "test" && process.env.REFERRER_PASSKEY_SIGNIN_ENABLED === "true");
}

/**
 * D-408 eligibility only, never identity resolution or enrollment authorization.
 * The caller must resolve the exact authenticated alias to account.id first.
 * getUserByOpenId may return a personal canonical openId: pass the verified
 * session/credential alias as argument four in that case. Never infer it from
 * a profile domain or canonical email. Enrollment separately requires OTP amr.
 */
export function isFreshReferrerPasskeyAccount(
  account: ReferrerPasskeyAccount | undefined,
  profile: ReferrerPasskeyProfile | undefined,
  nowMs: number,
  sessionOpenId: string | undefined = account?.openId,
): boolean {
  if (!account || account.suspended !== false || !Number.isInteger(account.id) || account.id <= 0) return false;
  if (!profile || profile.userId !== account.id || profile.accountType !== "referrer") return false;
  if (!sessionOpenId?.startsWith("workemail_")) return false;
  const email = referrerPasskeyWorkEmailSchema.safeParse(sessionOpenId.slice("workemail_".length));
  if (!email.success || profile.workEmailDomain !== email.data.split("@")[1]) return false;
  const verifiedAtMs = profile.workEmailVerifiedAt?.getTime();
  if (verifiedAtMs === undefined || !Number.isFinite(verifiedAtMs) || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - verifiedAtMs;
  return ageMs >= 0 && ageMs < REFERRER_PASSKEY_WORK_EMAIL_MAX_AGE_MS;
}
