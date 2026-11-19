import type { PublicCompany } from "./companies";

/** What the /ask composer shows once it knows which company the ask is for. */
export type AskCompany = { readonly name: string; readonly primaryDomain: string };

const hostOf = (value: string): string | undefined => {
  try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return undefined; }
};

export function askCompanyFromCompany(company: Pick<PublicCompany, "name" | "domains">): AskCompany {
  return { name: company.name, primaryDomain: company.domains[0] };
}

/**
 * Match a job link to a LISTED company by its verified domains (exact host or a
 * subdomain such as careers.wipro.com). Unlisted employers return undefined:
 * the composer then says nothing rather than guessing a name.
 */
export function askCompanyFromUrl(companies: ReadonlyArray<Pick<PublicCompany, "name" | "domains">>, url: string): AskCompany | undefined {
  const host = hostOf(url);
  if (!host) return undefined;
  const match = companies.find(company => company.domains.some(domain => host === domain || host.endsWith(`.${domain}`)));
  return match ? askCompanyFromCompany(match) : undefined;
}

export function careersPlaceholder(company: AskCompany | undefined): string {
  return company ? `https://careers.${company.primaryDomain}/…` : "https://careers.company.com/…";
}
