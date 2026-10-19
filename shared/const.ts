export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// Canonical email-plane rules shared by client and server. The referrer plane
// rejects these consumer domains; the seeker plane allows them. Keep the
// server (server/db.ts isWorkEmailDomain) and client use isCorporateEmailDomain below.
export const CONSUMER_EMAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com",
] as const;

/** Providers that sell mailboxes to anyone, under many country domains (yahoo.co.in, outlook.in, hotmail.co.uk). */
const CONSUMER_PROVIDER_FAMILY = /^(?:gmail|googlemail|yahoo|ymail|rocketmail|hotmail|outlook|live|msn|icloud|aol|protonmail|gmx|zohomail|yandex|rediffmail|rediff|tutanota|fastmail|qq|163|126|naver|daum|seznam|mailinator|guerrillamail|yopmail)(?:\.[a-z]{2,3}){1,2}$/;
const CONSUMER_EXACT = new Set<string>([...CONSUMER_EMAIL_DOMAINS, "mail.ru", "bk.ru", "list.ru", "inbox.ru", "skiff.com", "mailfence.com", "duck.com", "pm.me"]);

export function isCorporateEmailDomain(domain: string): boolean {
  const host = (domain ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  const parts = host.split(".");
  // Subdomains of a consumer provider (mail.google.com style, eu.yahoo.com) are consumer too.
  for (let start = 0; start < parts.length - 1; start += 1) {
    const tail = parts.slice(start).join(".");
    if (CONSUMER_EXACT.has(tail) || CONSUMER_PROVIDER_FAMILY.test(tail)) return false;
  }
  return true;
}
