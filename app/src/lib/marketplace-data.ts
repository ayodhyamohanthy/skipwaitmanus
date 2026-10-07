export type Company = {
  name: string;
  slug: string;
  initials: string;
  industry: string;
  location: string;
  functions: string[];
  blurb: string;
};

export const launchCompanies: Company[] = [
  { name: "SkipWait", slug: "skipwait", initials: "SW", industry: "Technology", location: "Global · Remote", functions: ["Engineering", "Product", "Design"], blurb: "Build the platform making warm introductions more accessible." },
  { name: "Wipro", slug: "wipro", initials: "W", industry: "Technology services", location: "Global", functions: ["Engineering", "Data", "Operations"], blurb: "Explore roles across technology, consulting, and business operations." },
  { name: "Go Neutrinos", slug: "go-neutrinos", initials: "GN", industry: "Digital products", location: "India · Remote", functions: ["Engineering", "Product", "Design"], blurb: "Connect around product, design, and engineering opportunities." },
  { name: "TCS", slug: "tcs", initials: "T", industry: "Technology services", location: "Global", functions: ["Engineering", "Data", "Operations"], blurb: "Find a warmer path into global technology and consulting teams." },
  { name: "Merkle", slug: "merkle", initials: "M", industry: "Customer experience", location: "Global", functions: ["Data", "Design", "Operations"], blurb: "Explore opportunities across experience, data, media, and technology." },
];

export const requestStatuses = ["Draft", "Requested", "Accepted", "Referred", "Interviewing", "Offer", "Hired", "Declined", "Expired", "Closed"] as const;

export function getCompany(slug: string) {
  return launchCompanies.find(company => company.slug === slug);
}