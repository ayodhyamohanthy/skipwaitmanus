import { afterEach, describe, expect, it, vi } from "vitest";
import { REFERRER_PASSKEY_SIGNIN_ENABLED, REFERRER_PASSKEY_WORK_EMAIL_MAX_AGE_MS } from "../../shared/referrerPasskeys";
import { isFreshReferrerPasskeyAccount, referrerPasskeySignInOn, type ReferrerPasskeyAccount, type ReferrerPasskeyProfile } from "./passkeyReferrerPolicy";

const nowMs = Date.UTC(2026, 10, 27);
const account: ReferrerPasskeyAccount = { id: 7, openId: "workemail_ref@acme.com", suspended: false };
const profile: ReferrerPasskeyProfile = { userId: 7, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(nowMs - 1000) };
afterEach(() => vi.unstubAllEnvs());

describe("D-408 referrer passkey release policy", () => {
  it("stays off by default, with an override confined to exact test mode", () => {
    expect(REFERRER_PASSKEY_SIGNIN_ENABLED).toBe(false);
    vi.stubEnv("REFERRER_PASSKEY_SIGNIN_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect(referrerPasskeySignInOn()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(referrerPasskeySignInOn()).toBe(false);
    vi.stubEnv("NODE_ENV", "test");
    expect(referrerPasskeySignInOn()).toBe(true);
    vi.stubEnv("REFERRER_PASSKEY_SIGNIN_ENABLED", "TRUE");
    expect(referrerPasskeySignInOn()).toBe(false);
  });

  it("accepts current work-email proof strictly younger than 30 days", () => {
    expect(isFreshReferrerPasskeyAccount(account, profile, nowMs)).toBe(true);
    expect(isFreshReferrerPasskeyAccount(account, { ...profile, workEmailVerifiedAt: new Date(nowMs) }, nowMs)).toBe(true);
    expect(isFreshReferrerPasskeyAccount(account, { ...profile, workEmailVerifiedAt: new Date(nowMs - REFERRER_PASSKEY_WORK_EMAIL_MAX_AGE_MS + 1) }, nowMs)).toBe(true);
  });

  it.each([0, 1, 86_400_000])("refuses the exact expiry boundary and older proof (+%i ms)", extraAge => {
    expect(isFreshReferrerPasskeyAccount(account, { ...profile, workEmailVerifiedAt: new Date(nowMs - 30 * 86_400_000 - extraAge) }, nowMs)).toBe(false);
  });

  it.each([null, new Date(Number.NaN), new Date(nowMs + 1)])("refuses missing, invalid or future verification %j", workEmailVerifiedAt => {
    expect(isFreshReferrerPasskeyAccount(account, { ...profile, workEmailVerifiedAt }, nowMs)).toBe(false);
  });

  it.each(["user_personal", "workemail_Ref@acme.com", "workemail_ref@ACME.com", "workemail_ ref@acme.com", "workemail_ref@acme.com ", "workemail_ref@acme", "workemail_a@@acme.com", "workemail_@acme.com", "workemail_ref@other.com"])("refuses a personal, malformed, unnormalized or different-employer alias %s", openId => {
    expect(isFreshReferrerPasskeyAccount({ ...account, openId }, profile, nowMs)).toBe(false);
  });

  it("uses a separately verified alias when its resolved canonical account has a personal openId", () => {
    const canonical = { ...account, openId: "user_personal" };
    expect(isFreshReferrerPasskeyAccount(canonical, profile, nowMs)).toBe(false);
    expect(isFreshReferrerPasskeyAccount(canonical, profile, nowMs, account.openId)).toBe(true);
  });

  it("refuses missing, suspended, different-account and changed-employer state", () => {
    expect(isFreshReferrerPasskeyAccount(undefined, profile, nowMs)).toBe(false);
    expect(isFreshReferrerPasskeyAccount(account, undefined, nowMs)).toBe(false);
    expect(isFreshReferrerPasskeyAccount({ ...account, suspended: true }, profile, nowMs)).toBe(false);
    expect(isFreshReferrerPasskeyAccount(account, { ...profile, userId: 8 }, nowMs)).toBe(false);
    expect(isFreshReferrerPasskeyAccount(account, { ...profile, accountType: "job_seeker" }, nowMs)).toBe(false);
    expect(isFreshReferrerPasskeyAccount(account, { ...profile, workEmailDomain: "new-employer.com" }, nowMs)).toBe(false);
    expect(isFreshReferrerPasskeyAccount(account, { ...profile, workEmailDomain: null }, nowMs)).toBe(false);
    expect(isFreshReferrerPasskeyAccount(account, profile, Number.NaN)).toBe(false);
  });
});
