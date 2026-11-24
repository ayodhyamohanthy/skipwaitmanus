// SEARCH-work-domain (D-394): the domain a discovered company's employees use for work email.
//
// Worldwide discovery (server/companyDiscovery.ts) reads a company's official website from Wikidata (P856).
// That host is not always the work-email domain: Google's official site is about.google, while its employees
// verify with @google.com (owner, Nov 24 2026). A referrer verifies with their work email, so the domain a
// company carries in SkipWait is the email one. Pure and bounded: no request, no lookup.

/** Verified hosts whose official site is not the employees' work-email domain. Add one only with evidence. */
export const WORK_DOMAIN_OVERRIDES: Readonly<Record<string, string>> = {
  // Wikidata P856 for Google (Q95) is https://about.google/; Google employees' work email is @google.com (D-394).
  "about.google": "google.com",
};

/** Subdomains that name a corporate page rather than a separate business. */
const CORPORATE_LABELS = new Set(["about", "corporate", "careers", "jobs", "company", "investor", "investors", "ir", "www"]);
/** Two-label public suffixes (co.uk, com.au, co.in …): a host is never stripped down to one of these. */
const SECOND_LEVEL_SUFFIX = /^(?:co|com|net|org|gov|edu|ac|ltd|plc)\.[a-z]{2}$/;

export function workDomainFor(host: string): string {
  let current = host.trim().toLowerCase().replace(/\.$/, "");
  // At most a few corporate labels deep (www.about.example.com); bounded so no input loops.
  for (let step = 0; step < 4; step += 1) {
    const override = WORK_DOMAIN_OVERRIDES[current];
    if (override) return override;
    const dot = current.indexOf(".");
    if (dot <= 0) break;
    const label = current.slice(0, dot);
    const parent = current.slice(dot + 1);
    // Keep the host when its parent is a bare TLD (about.example) or a public suffix (jobs.co.uk).
    if (!CORPORATE_LABELS.has(label) || !parent.includes(".") || SECOND_LEVEL_SUFFIX.test(parent)) break;
    current = parent;
  }
  return current;
}
