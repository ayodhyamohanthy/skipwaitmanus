// Coverage before payment on /plans (GO-LIVE-1 C5, ruling 4.5, D-084 (7)): up
// to five companies from the seeker's own pending asks, newest first, each
// with one sentence saying whether a verified employee there can see asks
// now. An ask a referrer can already see (claimed, allocated, or in the
// company's open queue) reads "can see asks now"; a waiting or held ask uses
// the public directory's availability boolean for a listed company, otherwise
// its own state. Never a count of people.
import { companyIdentityOf } from "@shared/companies";
import { COVERAGE_WAIT_DAYS } from "@shared/referral";
import { findCompanyByDomain, type PublicCompany } from "@/lib/companyDirectory";
import type { ReferralRequest } from "@/components/requests/requestsApi";

export const COVERAGE_LIMIT = 5;
export const COVERAGE_FALLBACK = "Credits are used when a verified employee can see your ask.";

export type CoverageLine = { key: string; company: string; open: boolean };

type CoverageAsk = Pick<ReferralRequest, "companyDomain" | "companyName" | "companyInitials" | "status" | "queueStatus" | "waitingForCoverage" | "createdAt">;

export function coverageSentence(line: CoverageLine): string {
  return line.open
    ? `A verified employee at ${line.company} can see asks now.`
    : `No verified employee at ${line.company} yet. Asks there wait for free for up to ${COVERAGE_WAIT_DAYS} days.`;
}

/** Pending asks, newest first (the server's ISO timestamps sort as text). */
export function pendingAsks<T extends CoverageAsk>(requests: readonly T[]): T[] {
  return requests.filter(request => request.status === "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** A waiting or held ask no referrer can see yet: its sentence needs the company's availability. */
export function needsAvailability(ask: CoverageAsk): boolean {
  if (ask.queueStatus === "available_for_review") return false;
  return ask.queueStatus === "waiting_for_coverage" || ask.queueStatus === "held_for_credit" || ask.waitingForCoverage === true;
}

/** One line per company (directory slug when listed, else the domain), at most COVERAGE_LIMIT. */
export function coverageLines(asks: readonly CoverageAsk[], companies: readonly PublicCompany[]): CoverageLine[] {
  const lines = new Map<string, CoverageLine>();
  for (const ask of asks) {
    const listed = findCompanyByDomain(companies, ask.companyDomain);
    const key = listed ? `company:${listed.slug}` : `domain:${ask.companyDomain.trim().toLowerCase()}`;
    const open = !needsAvailability(ask) || (listed ? listed.openToReferrals : ask.queueStatus === "held_for_credit");
    const existing = lines.get(key);
    if (existing) {
      if (open && !existing.open) lines.set(key, { ...existing, open: true });
      continue;
    }
    if (lines.size >= COVERAGE_LIMIT) continue;
    lines.set(key, { key, company: listed?.name ?? companyIdentityOf(ask).name, open });
  }
  return Array.from(lines.values());
}
