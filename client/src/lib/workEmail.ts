import { isCorporateEmailDomain } from "@shared/const";

const personalEmailDomains = new Set<string>([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com",
]);

export function normalizeWorkEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isCompanyEmail(value: string) {
  const email = normalizeWorkEmail(value);
  const domain = email.split("@")[1] ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !domain) return false;
  // Corporate check from the shared canonical list, then the extended
  // client-side personal-domain list for extra safety before any network call.
  return isCorporateEmailDomain(domain) && !personalEmailDomains.has(domain);
}

export function workEmailError(value: string) {
  const email = normalizeWorkEmail(value);
  if (!email) return "Enter your company email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid company email address.";
  if (!isCompanyEmail(email)) return "Use your company email. Personal email providers cannot access private referral requests.";
  return "";
}
