export const TARGET_ROLE_URL_ERROR = "Paste a complete job link that starts with http:// or https://.";

export type ReviewedEmployer = { name: string; domain: string };

const reviewedEmployerLinks = new Map<string, ReviewedEmployer>([
  ["wellfound.com/jobs/3971835-account-executive", { name: "ChatFin", domain: "chatfin.ai" }],
]);

export function isValidTargetRoleUrl(value: string | undefined | null) {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeTargetRoleUrl(value: string) {
  const url = new URL(value.trim());
  url.hash = "";
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hostname = hostname;
  if (hostname === "wellfound.com") {
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.search = "";
  }
  return url.toString();
}

export function reviewedEmployerFromTargetRoleUrl(value: string): ReviewedEmployer | undefined {
  try {
    const url = new URL(normalizeTargetRoleUrl(value));
    return reviewedEmployerLinks.get(`${url.hostname}${url.pathname}`);
  } catch {
    return undefined;
  }
}
