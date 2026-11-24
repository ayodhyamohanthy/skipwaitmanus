// D-099 slice A (D-374): the referral-bonus reads and writes. server/db.ts is not
// touched (packet §5.3). Every public payload is built from an allow-list here, so
// no id, status, report count or reporter data can leak into a public response.
import { and, count, desc, eq, gte } from "drizzle-orm";
import { companies, companyBonusReports, companyDomains, companyReferralBonuses } from "../drizzle/schema";
import { isFresh, sourceHostOf, type BonusReportInput, type PublicBonus } from "../shared/referralBonus";
import { getDb } from "./db";

export type BonusCompanyIdentity = { id: number; slug: string; name: string; initials: string; status: "listed" | "hidden" };

export type StoredBonus = {
  companyId: number;
  amountMinor: number;
  currency: string;
  upTo: boolean;
  scopeNote: string | null;
  sourceUrl: string;
  checkedAt: Date;
  status: "published" | "withdrawn";
};

export type PublicBonusEntry = { company: { slug: string; name: string; initials: string }; bonus: PublicBonus };

export type AdminBonusRow = {
  company: BonusCompanyIdentity;
  bonus: (StoredBonus & { stale: boolean }) | null;
  openReports: number;
};

export type AdminReportRow = {
  id: number;
  company: { slug: string; name: string };
  reason: string;
  note: string | null;
  suggestedSourceUrl: string | null;
  status: "open" | "fixed" | "dismissed";
  createdAt: Date;
};

/** The seam the routes use; tests inject an in-memory implementation. */
export type ReferralBonusStore = {
  companyBySlug(slug: string): Promise<BonusCompanyIdentity | undefined>;
  companyById(id: number): Promise<BonusCompanyIdentity | undefined>;
  domainsOf(companyId: number): Promise<string[]>;
  listPublished(now: Date): Promise<PublicBonusEntry[]>;
  getPublishedForCompany(companyId: number, now: Date): Promise<StoredBonus | undefined>;
  upsert(companyId: number, input: { amountMinor: number; currency: string; upTo: boolean; scopeNote: string | null; sourceUrl: string; checkedAt: Date }, userId: number, now: Date): Promise<void>;
  withdraw(companyId: number, userId: number, now: Date): Promise<boolean>;
  listAdmin(now: Date): Promise<AdminBonusRow[]>;
  countReportsSince(reporterUserId: number, since: Date): Promise<number>;
  createReport(companyId: number, reporterUserId: number, input: BonusReportInput, now: Date): Promise<void>;
  listReports(status: "open" | "fixed" | "dismissed"): Promise<AdminReportRow[]>;
  decideReport(id: number, decision: "fixed" | "dismissed", userId: number, now: Date): Promise<boolean>;
};

/** The public shape: allow-list only (packet §5.3). */
export function toPublicBonus(row: StoredBonus): PublicBonus {
  return {
    amountMinor: row.amountMinor,
    currency: row.currency,
    upTo: row.upTo,
    scopeNote: row.scopeNote,
    sourceUrl: row.sourceUrl,
    sourceHost: sourceHostOf(row.sourceUrl),
    checkedAt: row.checkedAt.toISOString(),
  };
}

const identityOf = (row: { id: number; slug: string; name: string; initials: string; status: string }): BonusCompanyIdentity => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  initials: row.initials,
  status: row.status === "hidden" ? "hidden" : "listed",
});

const storedOf = (row: typeof companyReferralBonuses.$inferSelect): StoredBonus => ({
  companyId: row.companyId,
  amountMinor: Number(row.amountMinor),
  currency: row.currency,
  upTo: row.upTo,
  scopeNote: row.scopeNote ?? null,
  sourceUrl: row.sourceUrl,
  checkedAt: row.checkedAt,
  status: row.status,
});

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function createReferralBonusStore(db: Db): ReferralBonusStore {
  return {
    async companyBySlug(slug) {
      const [row] = await db.select({ id: companies.id, slug: companies.slug, name: companies.name, initials: companies.initials, status: companies.status }).from(companies).where(eq(companies.slug, slug)).limit(1);
      return row ? identityOf(row) : undefined;
    },

    async companyById(id) {
      const [row] = await db.select({ id: companies.id, slug: companies.slug, name: companies.name, initials: companies.initials, status: companies.status }).from(companies).where(eq(companies.id, id)).limit(1);
      return row ? identityOf(row) : undefined;
    },

    async domainsOf(companyId) {
      const rows = await db.select({ domain: companyDomains.domain }).from(companyDomains).where(eq(companyDomains.companyId, companyId));
      return rows.map(row => row.domain.trim().toLowerCase()).filter(Boolean);
    },

    async listPublished(now) {
      const rows = await db.select({ company: { slug: companies.slug, name: companies.name, initials: companies.initials }, bonus: companyReferralBonuses })
        .from(companyReferralBonuses)
        .innerJoin(companies, eq(companies.id, companyReferralBonuses.companyId))
        .where(and(eq(companies.status, "listed"), eq(companyReferralBonuses.status, "published")));
      return rows
        .map(row => ({ company: row.company, bonus: storedOf(row.bonus) }))
        .filter(row => isFresh(row.bonus.checkedAt, now))
        .map(row => ({ company: row.company, bonus: toPublicBonus(row.bonus) }))
        .sort((a, b) => a.company.name.localeCompare(b.company.name));
    },

    async getPublishedForCompany(companyId, now) {
      const [row] = await db.select().from(companyReferralBonuses).where(eq(companyReferralBonuses.companyId, companyId)).limit(1);
      if (!row) return undefined;
      const stored = storedOf(row);
      return stored.status === "published" && isFresh(stored.checkedAt, now) ? stored : undefined;
    },

    async upsert(companyId, input, userId, now) {
      await db.insert(companyReferralBonuses).values({
        companyId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        upTo: input.upTo,
        scopeNote: input.scopeNote,
        sourceUrl: input.sourceUrl,
        checkedAt: input.checkedAt,
        status: "published",
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      }).onDuplicateKeyUpdate({
        set: {
          amountMinor: input.amountMinor,
          currency: input.currency,
          upTo: input.upTo,
          scopeNote: input.scopeNote,
          sourceUrl: input.sourceUrl,
          checkedAt: input.checkedAt,
          status: "published",
          updatedByUserId: userId,
          updatedAt: now,
        },
      });
    },

    async withdraw(companyId, userId, now) {
      const result = await db.update(companyReferralBonuses)
        .set({ status: "withdrawn", updatedByUserId: userId, updatedAt: now })
        .where(eq(companyReferralBonuses.companyId, companyId));
      return Number((result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0) > 0;
    },

    async listAdmin(now) {
      const rows = await db.select({ company: companies, bonus: companyReferralBonuses })
        .from(companies)
        .leftJoin(companyReferralBonuses, eq(companyReferralBonuses.companyId, companies.id))
        .orderBy(companies.sortOrder, companies.name);
      const openCounts = await db.select({ companyId: companyBonusReports.companyId, total: count() })
        .from(companyBonusReports)
        .where(eq(companyBonusReports.status, "open"))
        .groupBy(companyBonusReports.companyId);
      const openByCompany = new Map(openCounts.map(row => [row.companyId, Number(row.total)]));
      return rows.map(row => ({
        company: identityOf(row.company),
        bonus: row.bonus ? { ...storedOf(row.bonus), stale: !isFresh(row.bonus.checkedAt, now) } : null,
        openReports: openByCompany.get(row.company.id) ?? 0,
      }));
    },

    async countReportsSince(reporterUserId, since) {
      const [row] = await db.select({ total: count() }).from(companyBonusReports)
        .where(and(eq(companyBonusReports.reporterUserId, reporterUserId), gte(companyBonusReports.createdAt, since)));
      return Number(row?.total ?? 0);
    },

    async createReport(companyId, reporterUserId, input, now) {
      await db.insert(companyBonusReports).values({
        companyId,
        reporterUserId,
        reason: input.reason,
        note: input.note,
        suggestedSourceUrl: input.suggestedSourceUrl,
        status: "open",
        createdAt: now,
      });
    },

    async listReports(status) {
      const rows = await db.select({ report: companyBonusReports, company: { slug: companies.slug, name: companies.name } })
        .from(companyBonusReports)
        .innerJoin(companies, eq(companies.id, companyBonusReports.companyId))
        .where(eq(companyBonusReports.status, status))
        .orderBy(desc(companyBonusReports.createdAt));
      return rows.map(row => ({
        id: row.report.id,
        company: row.company,
        reason: row.report.reason,
        note: row.report.note ?? null,
        suggestedSourceUrl: row.report.suggestedSourceUrl ?? null,
        status: row.report.status,
        createdAt: row.report.createdAt,
      }));
    },

    async decideReport(id, decision, userId, now) {
      const result = await db.update(companyBonusReports)
        .set({ status: decision, reviewedAt: now, reviewedByUserId: userId })
        .where(and(eq(companyBonusReports.id, id), eq(companyBonusReports.status, "open")));
      return Number((result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0) > 0;
    },
  };
}

/** The production store, or undefined when the database is unavailable. */
export async function defaultReferralBonusStore(): Promise<ReferralBonusStore | undefined> {
  const db = await getDb();
  return db ? createReferralBonusStore(db) : undefined;
}
