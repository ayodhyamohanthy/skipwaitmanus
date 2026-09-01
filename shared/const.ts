export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// Canonical email-plane rules shared by client and server. The referrer plane
// rejects these consumer domains; the seeker plane allows them. Keep the
// server list (server/db.ts consumerEmailDomains) in sync with this set.
export const CONSUMER_EMAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com",
] as const;

export function isCorporateEmailDomain(domain: string): boolean {
  return Boolean(domain) && !CONSUMER_EMAIL_DOMAINS.includes(domain.trim().toLowerCase() as (typeof CONSUMER_EMAIL_DOMAINS)[number]);
}
