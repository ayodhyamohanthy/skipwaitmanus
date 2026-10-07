export type LaunchCompany = {
  name: string;
  slug: string;
  initials: string;
  domain: string;
  industry: string;
  location: string;
  functions: string[];
  blurb: string;
};

/** Spec-mandated launch set. Descriptors are approved kit copy; counts and
 * roles always come from live job data, never from this module. */
export const LAUNCH_COMPANIES: LaunchCompany[] = [
  { name: "SkipWait", slug: "skipwait", initials: "SW", domain: "skipwait.me", industry: "Technology", location: "Global · Remote", functions: ["Engineering", "Product", "Design"], blurb: "Build the platform making warm introductions more accessible." },
  { name: "Wipro", slug: "wipro", initials: "W", domain: "wipro.com", industry: "Technology services", location: "Global", functions: ["Engineering", "Data", "Operations"], blurb: "Explore roles across technology, consulting, and business operations." },
  { name: "Go Neutrinos", slug: "go-neutrinos", initials: "GN", domain: "goneutrinos.com", industry: "Digital products", location: "India · Remote", functions: ["Engineering", "Product", "Design"], blurb: "Connect around product, design, and engineering opportunities." },
  { name: "TCS", slug: "tcs", initials: "T", domain: "tcs.com", industry: "Technology services", location: "Global", functions: ["Engineering", "Data", "Operations"], blurb: "Find a warmer path into global technology and consulting teams." },
  { name: "Merkle", slug: "merkle", initials: "M", domain: "merkle.com", industry: "Customer experience", location: "Global", functions: ["Data", "Design", "Operations"], blurb: "Explore opportunities across experience, data, media, and technology." },
];

function normalizeCompany(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ALIASES: Record<string, string> = {
  skipwait: "skipwait",
  skipwaitme: "skipwait",
  wipro: "wipro",
  goneutrinos: "go-neutrinos",
  goneutrino: "go-neutrinos",
  tcs: "tcs",
  tataconsultancyservices: "tcs",
  merkle: "merkle",
};

export function companySlugForJobCompany(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeCompany(value).replace(/\.(com|me|in|io|co|org)$/, "");
  return ALIASES[normalized] ?? null;
}

export function getLaunchCompany(slug: string): LaunchCompany | undefined {
  return LAUNCH_COMPANIES.find(company => company.slug === slug);
}
