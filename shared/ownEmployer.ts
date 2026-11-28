// PRIVACY-own-employer-guard (D-414 (3), D-415 (2)): a person never sends a referral request to their own current
// employer. One contract for the server refusal and the composer's refusal state.
import { z } from "zod";

export const OWN_EMPLOYER = "own_employer" as const;

/** The composer's way out of the refusal (packet: "Find another company"). */
export const OWN_EMPLOYER_ACTION = "Find another company";

/** The plain words shown to the seeker; nothing was created, reserved or spent. */
export function ownEmployerMessage(company: string): string {
  return `You work at ${company}. We don't send requests to your own employer, so colleagues never see you're looking. Nothing was used.`;
}

/** The 409 body the server answers with. */
export const ownEmployerRefusalSchema = z.object({
  code: z.literal(OWN_EMPLOYER),
  error: z.string().min(1),
  companyDomain: z.string().min(1),
  companyName: z.string().min(1),
}).strict();
export type OwnEmployerRefusal = z.infer<typeof ownEmployerRefusalSchema>;

/** The refusal, or null for any other answer. */
export function parseOwnEmployerRefusal(status: number, payload: unknown): OwnEmployerRefusal | null {
  if (status !== 409) return null;
  const parsed = ownEmployerRefusalSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/** Lowercase, trimmed, no trailing dot, no leading "www.". Empty when the input has no usable domain. */
export function normalizeEmployerDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.+$/, "").replace(/^www\./, "");
}

/**
 * D-415 (2): the same employer when the domains are equal or one is a subdomain of the other
 * ("us.ibm.com" and "ibm.com"). Different registrable names never match ("hp.com" and "hpe.com").
 */
export function isSameEmployerDomain(workEmailDomain: string, companyDomain: string): boolean {
  const work = normalizeEmployerDomain(workEmailDomain);
  const company = normalizeEmployerDomain(companyDomain);
  if (!work.includes(".") || !company.includes(".")) return false;
  return work === company || work.endsWith(`.${company}`) || company.endsWith(`.${work}`);
}

/** One verified work email on one account of the person; a row without a verification date never counts. */
export type PersonWorkEmail = { readonly workEmailDomain: string | null; readonly workEmailVerifiedAt: Date | null };

/**
 * True when any verified work email of the person is at any of the company's domains (the request's company domain
 * plus every domain the company directory lists for it). An unverified work email never blocks.
 */
export function isOwnEmployer(workEmails: readonly PersonWorkEmail[], companyDomains: readonly string[]): boolean {
  return workEmails.some(({ workEmailDomain, workEmailVerifiedAt }) => {
    if (workEmailVerifiedAt === null || workEmailDomain === null) return false;
    return companyDomains.some(domain => isSameEmployerDomain(workEmailDomain, domain));
  });
}
