// Deterministic seed for the company directory: the five launch companies
// exactly as the retired client constant listed them (kit marketplace-data
// copy, in kit order). drizzle/deploy/0076_company_directory.sql inserts the
// same rows; server/companyDirectoryContract.test.ts keeps the two identical.
//
// Readers: the migration contract test, the database-less dev directory
// (server/companyDirectorySource.ts), the build-time crawler snapshot, and the
// landing page's static "open doors at launch" row (the landing makes no data
// fetch by contract). Every live surface reads GET /api/companies instead.
//
// OWNER ACTION: confirm these domains (notably goneutrinos.com) and that the
// descriptors are approved live copy. Availability is never seeded: it is
// derived from verified referrers on every read.

export type CompanySeed = {
  readonly slug: string;
  readonly name: string;
  readonly initials: string;
  readonly industry: string;
  readonly location: string;
  readonly functions: readonly string[];
  readonly blurb: string;
  /** Primary first. */
  readonly domains: readonly string[];
  readonly sortOrder: number;
};

export const LAUNCH_COMPANY_SEED: readonly CompanySeed[] = [
  { slug: "skipwait", name: "skipwait.me", initials: "SW", industry: "Technology", location: "Global · Remote", functions: ["Engineering", "Product", "Design"], blurb: "Build the platform making warm introductions more accessible.", domains: ["skipwait.me"], sortOrder: 10 },
  { slug: "wipro", name: "Wipro", initials: "W", industry: "Technology services", location: "Global", functions: ["Engineering", "Data", "Operations"], blurb: "Explore roles across technology, consulting, and business operations.", domains: ["wipro.com"], sortOrder: 20 },
  { slug: "go-neutrinos", name: "Go Neutrinos", initials: "GN", industry: "Digital products", location: "India · Remote", functions: ["Engineering", "Product", "Design"], blurb: "Connect around product, design, and engineering opportunities.", domains: ["goneutrinos.com"], sortOrder: 30 },
  { slug: "tcs", name: "TCS", initials: "T", industry: "Technology services", location: "Global", functions: ["Engineering", "Data", "Operations"], blurb: "Find a warmer path into global technology and consulting teams.", domains: ["tcs.com"], sortOrder: 40 },
  { slug: "merkle", name: "Merkle", initials: "M", industry: "Customer experience", location: "Global", functions: ["Data", "Design", "Operations"], blurb: "Explore opportunities across experience, data, media, and technology.", domains: ["merkle.com"], sortOrder: 50 },
];
