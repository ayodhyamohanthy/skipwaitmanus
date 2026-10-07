/**
 * The kit v4 launch companies (START_HERE.md, FOR_AI_BUILDERS.md §1):
 * "SkipWait, Wipro, Go Neutrinos, TCS, Merkle".
 *
 * These five are DECLARED by the kit as the launch set, so naming them is not
 * inventing activity — the kit's own product rule forbids fabricated *counts*,
 * *names of people*, and *outcomes*, not the declared company list.
 *
 * The descriptive fields (industry, location, functions, blurb) are the kit's
 * approved copy from `app/src/lib/marketplace-data.ts`. That file is labelled
 * "sample data shapes" for table design, so treat these fields as the kit's
 * presentation copy rather than as rows read from a database.
 *
 * There is still no `companies` table in drizzle/schema.ts. When one exists,
 * this module becomes the seed for it and every consumer already reads through
 * this single surface. Availability ("people are open to requests") is the
 * kit's declared launch claim; a real per-company availability signal needs
 * that table plus verified-referrer counts, and is a follow-up.
 */

export type LaunchCompany = {
  readonly name: string;
  readonly slug: string;
  readonly initials: string;
  readonly industry: string;
  readonly location: string;
  readonly functions: readonly string[];
  readonly blurb: string;
};

export const LAUNCH_COMPANIES: readonly LaunchCompany[] = [
  { name: "SkipWait", slug: "skipwait", initials: "SW", industry: "Technology", location: "Global · Remote", functions: ["Engineering", "Product", "Design"], blurb: "Build the platform making warm introductions more accessible." },
  { name: "Wipro", slug: "wipro", initials: "W", industry: "Technology services", location: "Global", functions: ["Engineering", "Data", "Operations"], blurb: "Explore roles across technology, consulting, and business operations." },
  { name: "Go Neutrinos", slug: "go-neutrinos", initials: "GN", industry: "Digital products", location: "India · Remote", functions: ["Engineering", "Product", "Design"], blurb: "Connect around product, design, and engineering opportunities." },
  { name: "TCS", slug: "tcs", initials: "T", industry: "Technology services", location: "Global", functions: ["Engineering", "Data", "Operations"], blurb: "Find a warmer path into global technology and consulting teams." },
  { name: "Merkle", slug: "merkle", initials: "M", industry: "Customer experience", location: "Global", functions: ["Data", "Design", "Operations"], blurb: "Explore opportunities across experience, data, media, and technology." },
];

export const COMPANY_FUNCTIONS = ["Engineering", "Product", "Design", "Data", "Operations"] as const;
export const COMPANY_LOCATIONS = ["Remote", "India", "Global"] as const;

export const getLaunchCompany = (slug: string) => LAUNCH_COMPANIES.find(company => company.slug === slug);
