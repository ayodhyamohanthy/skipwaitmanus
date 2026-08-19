export const TARGET_ROLE_URL_ERROR = "Paste a complete job link that starts with http:// or https://.";

export type ReviewedEmployer = { name: string; domain: string };

const reviewedEmployerLinks = new Map<string, ReviewedEmployer>([
  ["wellfound.com/jobs/3971835-account-executive", { name: "ChatFin", domain: "chatfin.ai" }],
  ["wellfound.com/jobs/4220336-senior-product-designer", { name: "Check", domain: "checkhq.com" }],
  ["linkedin.com/jobs/view/4446365088", { name: "Ethos", domain: "ethos.com" }],
  ["linkedin.com/jobs/view/4448866119", { name: "Rubrik", domain: "rubrik.com" }],
  ["linkedin.com/jobs/view/4389299303", { name: "MakeMyTrip", domain: "makemytrip.com" }],
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
  if (hostname === "wellfound.com" || hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) {
    if (hostname.endsWith(".linkedin.com")) url.hostname = "linkedin.com";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (url.hostname === "linkedin.com") {
      const jobId = url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)$/)?.[1];
      if (jobId) url.pathname = `/jobs/view/${jobId}`;
    }
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
