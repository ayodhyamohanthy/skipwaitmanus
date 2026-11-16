type CatalogJobLike = {
  company?: unknown;
  targetRoleUrl?: unknown;
  description?: unknown;
};

const RESERVED_HOSTS = ["acme.com", "example.com", "example.net", "example.org"];
const RESERVED_TLDS = [".test", ".example", ".invalid", ".localhost"];

function hostname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;

  try {
    const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function isReservedTestHost(host: string): boolean {
  if (RESERVED_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`))) return true;
  return host === "localhost" || RESERVED_TLDS.some(tld => host.endsWith(tld));
}

export function isTestCatalogJob(row: CatalogJobLike): boolean {
  if (typeof row.description === "string" && row.description.startsWith("Test role")) return true;
  return [row.company, row.targetRoleUrl].some(value => {
    const host = hostname(value);
    return host !== null && isReservedTestHost(host);
  });
}

export function publicCatalogJobs<Args extends unknown[], Job extends CatalogJobLike>(
  listJobs: (...args: Args) => Promise<Job[]>,
): (...args: Args) => Promise<Job[]> {
  return async (...args: Args) => (await listJobs(...args)).filter(job => !isTestCatalogJob(job));
}
