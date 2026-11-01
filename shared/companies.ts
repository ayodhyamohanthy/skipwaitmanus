// Company directory contract (kit v4 /explore, /explore/:slug, /verify,
// /invite, /suggest-company, /for-companies, admin Companies).
//
// The server owns the directory (tables `companies` + `companyDomains`).
// Availability is derived on read and exposed only as a boolean: responses
// never carry referrer counts, ids or names. Every client and server
// boundary parses with these schemas; nothing else defines a company shape.
import { z } from "zod";
import { isCorporateEmailDomain } from "./const";

export const COMPANY_SLUG_PATTERN = /^[a-z0-9-]{1,48}$/;
const DOMAIN_PATTERN = /^(?=.{4,255}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/;

export const companyStatuses = ["listed", "hidden"] as const;
export type CompanyStatus = (typeof companyStatuses)[number];

export const COMPANY_NOT_FOUND_ERROR = "This door doesn't lead anywhere";

export const companySlugSchema = z.string().regex(COMPANY_SLUG_PATTERN, "Use 1-48 lowercase letters, numbers or dashes");

/** A company email domain: lowercase host, a real TLD, never a personal-mail domain. */
export const companyDomainSchema = z.string().trim().toLowerCase()
  .regex(DOMAIN_PATTERN, "Enter a company domain like acme.com")
  .refine(isCorporateEmailDomain, "Personal email domains can't be company domains");

const label = (max: number) => z.string().trim().min(1).max(max);

export const companyFunctionsSchema = z.array(label(40)).min(1).max(8)
  .refine(list => new Set(list.map(item => item.toLowerCase())).size === list.length, "List each function once");

/** One directory entry as every public reader sees it. */
export const publicCompanySchema = z.object({
  slug: companySlugSchema,
  name: label(160),
  initials: label(4),
  industry: label(80),
  location: label(80),
  functions: companyFunctionsSchema,
  blurb: label(240),
  /** Verified-email domains, primary first. Used by /verify to match the work email. */
  domains: z.array(companyDomainSchema).min(1),
  /** At least one verified, unpaused, unsuspended referrer with free capacity. */
  openToReferrals: z.boolean(),
});
export type PublicCompany = z.infer<typeof publicCompanySchema>;

export const companyDirectoryResponseSchema = z.object({
  companies: z.array(publicCompanySchema),
  openCount: z.number().int().nonnegative(),
}).refine(value => value.openCount === value.companies.filter(company => company.openToReferrals).length, "openCount must equal the open companies listed");
export type CompanyDirectoryResponse = z.infer<typeof companyDirectoryResponseSchema>;

export const companyDetailResponseSchema = z.object({ company: publicCompanySchema });
export type CompanyDetailResponse = z.infer<typeof companyDetailResponseSchema>;

/** Admin view adds the record identity and the listing status. */
export const adminCompanySchema = publicCompanySchema.extend({
  id: z.number().int().positive(),
  status: z.enum(companyStatuses),
  sortOrder: z.number().int(),
  primaryDomain: companyDomainSchema,
  updatedAt: z.string(),
});
export type AdminCompany = z.infer<typeof adminCompanySchema>;

export const adminCompanyListResponseSchema = z.object({ companies: z.array(adminCompanySchema) });
export const adminCompanyResponseSchema = z.object({ company: adminCompanySchema });

const sortOrderSchema = z.number().int().min(0).max(100_000);
const domainListSchema = z.array(companyDomainSchema).max(10);

export const adminCompanyCreateSchema = z.strictObject({
  name: label(160),
  slug: companySlugSchema.optional(),
  initials: label(4).optional(),
  industry: label(80),
  location: label(80),
  functions: companyFunctionsSchema,
  blurb: label(240),
  primaryDomain: companyDomainSchema,
  aliasDomains: domainListSchema.optional(),
  status: z.enum(companyStatuses).optional(),
  sortOrder: sortOrderSchema.optional(),
});
export type AdminCompanyCreate = z.infer<typeof adminCompanyCreateSchema>;

export const adminCompanyUpdateSchema = z.strictObject({
  name: label(160).optional(),
  initials: label(4).optional(),
  industry: label(80).optional(),
  location: label(80).optional(),
  functions: companyFunctionsSchema.optional(),
  blurb: label(240).optional(),
  status: z.enum(companyStatuses).optional(),
  sortOrder: sortOrderSchema.optional(),
  addDomains: domainListSchema.optional(),
  removeDomains: domainListSchema.optional(),
}).refine(value => Object.keys(value).length > 0, "Change at least one field");
export type AdminCompanyUpdate = z.infer<typeof adminCompanyUpdateSchema>;

/** "Go Neutrinos" -> "go-neutrinos"; empty when the name has no letters or digits. */
export function deriveCompanySlug(name: string): string {
  return name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
}

/** "Go Neutrinos" -> "GN", "Merkle" -> "M". Admins may override (skipwait.me is "SW"). */
export function deriveCompanyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(word => /[a-z0-9]/i.test(word));
  return words.slice(0, 2).map(word => (word.match(/[a-z0-9]/i)?.[0] ?? "")).join("").toUpperCase() || "?";
}

/** Server-resolved display identity for any company domain on a row. */
export const companyIdentityFieldsSchema = z.object({
  companyName: z.string().min(1).max(160).nullish(),
  companyInitials: z.string().min(1).max(4).nullish(),
});

export type CompanyIdentitySource = { companyDomain: string; companyName?: string | null; companyInitials?: string | null };
export type CompanyIdentity = { name: string; mark: string };

/** Directory name and initials when the server resolved them; the raw domain and its first letter otherwise. */
export function companyIdentityOf(source: CompanyIdentitySource): CompanyIdentity {
  const name = source.companyName?.trim();
  const mark = source.companyInitials?.trim();
  return { name: name || source.companyDomain, mark: mark || (source.companyDomain.charAt(0) || "?").toUpperCase() };
}

/** An ask from a shared job link can carry the platform's own domain instead of an employer; that is not a company name to show. */
export function isUnknownCompany(source: CompanyIdentitySource): boolean {
  const shown = companyIdentityOf(source).name.trim().toLowerCase().replace(/^www\./, "");
  return shown === "" || shown === "skipwait.me";
}

/** D-174 search: one `q`, no other keys; results carry no availability field (D-176). */
export const companySearchQuerySchema = z.strictObject({ q: z.string().trim().max(80) });
export const companySearchResponseSchema = z.object({ companies: z.array(publicCompanySchema.omit({ openToReferrals: true }).strict()).max(10) });
