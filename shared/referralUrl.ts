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
  try {
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
  } catch {
    // Unparseable input: hand back the trimmed original so server callers fall
    // through to their friendly "could not identify the employer" validation
    // error instead of leaking a raw `Invalid URL` TypeError as a 500. Every
    // downstream resolver guards its own URL parsing, so this is safe.
    return value.trim();
  }
}

export function reviewedEmployerFromTargetRoleUrl(value: string): ReviewedEmployer | undefined {
  try {
    const url = new URL(normalizeTargetRoleUrl(value));
    return reviewedEmployerLinks.get(`${url.hostname}${url.pathname}`);
  } catch {
    return undefined;
  }
}

/**
 * Public suffixes that span more than one label.
 *
 * This is deliberately NOT the full Public Suffix List — it covers the common
 * country-code forms. It exists to stop the classic `labels.slice(-2)` mistake,
 * which turns `acme.co.in` into the bogus employer domain `co.in` (and `co.uk`,
 * `com.au`, `co.jp`, … likewise). With a one-label-suffix assumption, a job at a
 * `*.co.in` company can never match a verified referrer's work-email domain, so
 * the request is permanently stuck waiting for company coverage.
 */
const multiLabelPublicSuffixes = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "net.uk", "sch.uk",
  "co.in", "net.in", "org.in", "ac.in", "gov.in", "edu.in", "firm.in", "gen.in", "ind.in", "res.in",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "id.au", "asn.au",
  "co.nz", "net.nz", "org.nz", "ac.nz", "govt.nz", "school.nz",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp", "ed.jp", "gr.jp", "lg.jp",
  "com.br", "net.br", "org.br", "gov.br", "edu.br",
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "ac.cn",
  "com.mx", "com.sg", "com.hk", "com.tw", "com.my", "com.ph", "com.vn", "com.pk", "com.bd", "com.np", "com.lk",
  "co.za", "co.kr", "co.il", "co.id", "co.th", "co.ke", "co.zw", "co.tz", "co.ug", "co.ma", "co.ao",
  "com.ar", "com.co", "com.pe", "com.ec", "com.uy", "com.ve", "com.bo", "com.py", "com.do", "com.gt",
  "com.sa", "com.ae", "com.eg", "com.ng", "com.gh", "com.tr", "com.ua", "com.pl", "com.ru", "com.es", "com.pt",
  "org.za", "net.za", "gov.za", "edu.za",
  "gov.au", "edu.sg", "gov.sg", "org.sg", "edu.hk", "gov.hk", "org.hk", "edu.tw", "gov.tw",
]);

function hostLabels(hostname: string): string[] {
  return hostname.trim().toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
}

function publicSuffixLabelCount(labels: string[]): number {
  return labels.length >= 3 && multiLabelPublicSuffixes.has(labels.slice(-2).join(".")) ? 2 : 1;
}

/**
 * The registrable domain: `careers.acme.co.in` -> `acme.co.in`,
 * `jobs.acme.com` -> `acme.com`, `acme.com` -> `acme.com`.
 */
export function registrableDomainFromHost(hostname: string): string | undefined {
  const labels = hostLabels(hostname);
  if (labels.length < 2) return labels[0];
  return labels.slice(-(publicSuffixLabelCount(labels) + 1)).join(".");
}

/**
 * The employer "handle" label: `acme.co.in` -> `acme`, `jobs.acme.com` -> `acme`.
 * Used to match a job board's company handle against a verified work-email domain.
 */
export function registrableNameFromHost(hostname: string): string | undefined {
  const labels = hostLabels(hostname);
  if (labels.length < 2) return labels[0];
  const index = labels.length - publicSuffixLabelCount(labels) - 1;
  return index >= 0 ? labels[index] : undefined;
}

