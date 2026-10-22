import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { companyAggregateAccess, companyClaimChallenges, companyDomains, companies } from "../drizzle/schema";
import { getDb } from "./db";
import { isValidOtpLoginEmail, hasDeliverableMailDomain, consumeLimits, limiterKey } from "./workEmailOtp";
import { sendTransactionalEmail } from "./emailDelivery";
import { loadCompanyResponseSignal } from "./companyResponseSignal";
import { getCompanyDirectoryEntry } from "./companyDirectory";

export const companyClaimEnabled = () => process.env.COMPANY_CLAIM_ENABLED === "true";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export class CompanyClaimError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const ready = async () => { const db = await getDb(); if (!db) throw new CompanyClaimError(503, "Company verification is unavailable right now"); return db; };

export async function sendCompanyClaimLink(userId: number, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!isValidOtpLoginEmail(email)) throw new CompanyClaimError(400, "Enter a work email address");
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (!(await hasDeliverableMailDomain(domain))) throw new CompanyClaimError(400, "Enter a deliverable work email address");
  const db = await ready();
  const [owner] = await db.select({ companyId: companyDomains.companyId }).from(companyDomains).where(eq(companyDomains.domain, domain)).limit(1);
  if (!owner) throw new CompanyClaimError(400, "This company is not in the directory yet. Suggest it first.");
  const now = new Date();
  try {
    await consumeLimits(db, [
      { key: limiterKey("company-claim-user", String(userId)), windowMs: 600_000, limit: 1 },
      { key: limiterKey("company-claim-domain", domain), windowMs: 600_000, limit: 8 },
      { key: limiterKey("company-claim-global", "all"), windowMs: 3_600_000, limit: 100 },
    ], now.getTime());
  } catch { throw new CompanyClaimError(429, "Too many verification requests. Try again later."); }
  const [recent] = await db.select({ id: companyClaimChallenges.id }).from(companyClaimChallenges).where(and(eq(companyClaimChallenges.userId, userId), gt(companyClaimChallenges.createdAt, new Date(now.getTime() - 600_000)))).limit(1);
  if (recent) throw new CompanyClaimError(429, "Wait 10 minutes before requesting another company link");
  const token = randomBytes(32).toString("hex");
  // Fixed canonical origin, never a request-supplied Host/returnTo.
  const url = `https://skipwait.me/company/claim#token=${token}`;
  await db.insert(companyClaimChallenges).values({ userId, domain, tokenHash: hash(token), createdAt: now, expiresAt: new Date(now.getTime() + 600_000) });
  const delivery = await sendTransactionalEmail({ to: email, subject: "Verify company aggregate access on skipwait.me", text: `You requested company-level aggregate access for ${domain}.\n\nOpen this link while signed in to the account that requested it, then confirm:\n${url}\n\nIt expires in 10 minutes and works once. It grants no employee management or company ownership rights. If you did not request this, ignore it.` });
  if (!delivery.sent) {
    await db.update(companyClaimChallenges).set({ consumedAt: now }).where(eq(companyClaimChallenges.tokenHash, hash(token)));
    throw new CompanyClaimError(503, "We could not deliver the verification link. Try again later.");
  }
  return { sent: true as const };
}

export async function confirmCompanyClaim(userId: number, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new CompanyClaimError(400, "This verification link is invalid or expired");
  const db = await ready();
  return db.transaction(async tx => {
    const now = new Date();
    const [challenge] = await tx.select().from(companyClaimChallenges).where(and(eq(companyClaimChallenges.userId, userId), eq(companyClaimChallenges.tokenHash, hash(token)), isNull(companyClaimChallenges.consumedAt), gt(companyClaimChallenges.expiresAt, now))).limit(1).for("update");
    if (!challenge) throw new CompanyClaimError(400, "This verification link is invalid or expired");
    const [owner] = await tx.select({ slug: companies.slug }).from(companyDomains).innerJoin(companies, eq(companies.id, companyDomains.companyId)).where(and(eq(companyDomains.domain, challenge.domain), eq(companies.status, "listed"))).limit(1);
    if (!owner) throw new CompanyClaimError(400, "This company is no longer available");
    await tx.update(companyClaimChallenges).set({ consumedAt: now }).where(eq(companyClaimChallenges.id, challenge.id));
    await tx.insert(companyAggregateAccess).values({ userId, domain: challenge.domain, verifiedAt: now }).onDuplicateKeyUpdate({ set: { verifiedAt: now } });
    return { slug: owner.slug };
  });
}

export async function loadCompanyClaimDashboard(userId: number, slug: string) {
  const company = await getCompanyDirectoryEntry(slug);
  if (!company) throw new CompanyClaimError(404, "Company not found");
  const db = await ready();
  const grants = await db.select({ domain: companyAggregateAccess.domain }).from(companyAggregateAccess).where(eq(companyAggregateAccess.userId, userId));
  const domain = grants.find(g => company.domains.includes(g.domain))?.domain;
  if (!domain) throw new CompanyClaimError(403, "Verify a work email for this company first");
  // Explicit aggregate-only projection. No user IDs/emails, asks or conversations.
  const signal = await loadCompanyResponseSignal(company.domains);
  return { company: { name: company.name, slug: company.slug, domain, openToReferrals: company.openToReferrals }, signal };
}
