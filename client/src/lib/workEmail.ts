import { isCorporateEmailDomain } from "@shared/const";

export function normalizeWorkEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isPersonalEmailDomain(domain: string | undefined) {
  return Boolean(domain && !isCorporateEmailDomain(domain));
}

export function isCompanyEmail(value: string) {
  const email = normalizeWorkEmail(value);
  const domain = email.split("@")[1] ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !domain) return false;
  return isCorporateEmailDomain(domain);
}

export function workEmailError(value: string) {
  const email = normalizeWorkEmail(value);
  if (!email) return "Enter your company email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid company email address.";
  if (!isCompanyEmail(email)) return "Use your company email. Personal email providers cannot access private referral requests.";
  return "";
}

export function hasVerifiedWorkEmail(emailAddresses: ReadonlyArray<{ emailAddress: string; verification?: { status?: string | null } | null }> | undefined) {
  return Boolean(emailAddresses?.some(address => {
    const domain = address.emailAddress.trim().toLowerCase().split("@")[1];
    return address.verification?.status === "verified" && Boolean(domain) && !isPersonalEmailDomain(domain);
  }));
}
