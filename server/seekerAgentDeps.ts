// Real store and data sources for Skippy step 5 (D-141). Reads reuse the same
// live sources as the public pages (company directory, plan catalog); drafts
// price with the same helpers as /api/company-referrals/quote (D-137).
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { seekerAgentControls, seekerAgentDrafts, seekerAgentEvents, seekerAgentGrants } from "../drizzle/schema";
import { getDb } from "./db";
import { askLevelCostEnabled } from "./db";
import { listCompanyDirectory, getCompanyDirectoryEntry } from "./companyDirectory";
import { planCatalogResponse, sellableItemPrices } from "../shared/billingCatalog";
import { priceAvailability } from "./billingAvailability";
import { resolveChargebeeRuntime } from "./chargebeeEnvironment";
import { indiaGstRegistered, humanReviewersStaffed, usdRecurringConfirmed } from "./billingSettings";
import { assignJobLevel, creditsForLevel } from "../shared/jobLevel";
import { normalizeTargetRoleUrl } from "../shared/referralUrl";
import type { PublicCompany } from "../shared/companies";
import type { PlanCatalogResponse } from "../shared/billingCatalog";
import type { Request } from "express";
import type { AgentLimits } from "../shared/seekerAgents";
import type { DraftRow, EventRow, GrantRow, SeekerAgentRouteDeps, SeekerAgentStore } from "./seekerAgentRoutes";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const toGrant = (row: typeof seekerAgentGrants.$inferSelect): GrantRow => ({
  id: row.id, userId: row.userId, name: row.name, keyPrefix: row.keyPrefix,
  canLookup: row.canLookup, canDraft: row.canDraft,
  maxCreditsPerAsk: row.maxCreditsPerAsk, maxCreditsPerDay: row.maxCreditsPerDay, maxCreditsPerWeek: row.maxCreditsPerWeek, maxAsksPerDay: row.maxAsksPerDay,
  expiresAt: row.expiresAt, revokedAt: row.revokedAt, lastUsedAt: row.lastUsedAt, createdAt: row.createdAt,
});
const toDraft = (row: typeof seekerAgentDrafts.$inferSelect): DraftRow => ({ id: row.id, grantId: row.grantId, userId: row.userId, companySlug: row.companySlug, targetRoleUrl: row.targetRoleUrl, note: row.note, jobLevel: row.jobLevel, creditCost: row.creditCost, status: row.status, createdAt: row.createdAt });
const toEvent = (row: typeof seekerAgentEvents.$inferSelect): EventRow => ({ id: row.id, grantId: row.grantId, agentName: row.agentName, action: row.action, outcome: row.outcome, detail: row.detail, createdAt: row.createdAt });

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export function createSeekerAgentStore(): SeekerAgentStore {
  return {
    async createGrant(input) {
      const db = await requireDb();
      const limits: AgentLimits = input.limits;
      await db.insert(seekerAgentGrants).values({
        userId: input.userId, name: input.name, keyPrefix: input.keyPrefix, keyHash: input.keyHash,
        canLookup: input.canLookup, canDraft: input.canDraft,
        maxCreditsPerAsk: limits.creditsPerAsk, maxCreditsPerDay: limits.creditsPerDay, maxCreditsPerWeek: limits.creditsPerWeek, maxAsksPerDay: limits.asksPerDay,
        expiresAt: input.expiresAt,
      });
      const [row] = await db.select().from(seekerAgentGrants).where(eq(seekerAgentGrants.keyHash, input.keyHash)).limit(1);
      return toGrant(row);
    },
    async listGrants(userId) {
      const db = await requireDb();
      const rows = await db.select().from(seekerAgentGrants).where(eq(seekerAgentGrants.userId, userId)).orderBy(desc(seekerAgentGrants.createdAt));
      return rows.map(toGrant);
    },
    async getGrantForUser(userId, id) {
      const db = await requireDb();
      const [row] = await db.select().from(seekerAgentGrants).where(and(eq(seekerAgentGrants.id, id), eq(seekerAgentGrants.userId, userId))).limit(1);
      return row ? toGrant(row) : undefined;
    },
    async findGrantByKeyHash(keyHash) {
      const db = await requireDb();
      const [row] = await db.select().from(seekerAgentGrants).where(eq(seekerAgentGrants.keyHash, keyHash)).limit(1);
      return row ? toGrant(row) : undefined;
    },
    async revokeGrant(userId, id, now) {
      const db = await requireDb();
      await db.update(seekerAgentGrants).set({ revokedAt: now }).where(and(eq(seekerAgentGrants.id, id), eq(seekerAgentGrants.userId, userId)));
      return true;
    },
    async touchLastUsed(id, now) {
      const db = await requireDb();
      await db.update(seekerAgentGrants).set({ lastUsedAt: now }).where(eq(seekerAgentGrants.id, id));
    },
    async isPaused(userId) {
      const db = await requireDb();
      const [row] = await db.select({ pausedAt: seekerAgentControls.pausedAt }).from(seekerAgentControls).where(eq(seekerAgentControls.userId, userId)).limit(1);
      return row?.pausedAt != null;
    },
    async setPaused(userId, paused, now) {
      const db = await requireDb();
      await db.insert(seekerAgentControls).values({ userId, pausedAt: paused ? now : null })
        .onDuplicateKeyUpdate({ set: { pausedAt: paused ? now : null } });
    },
    async createDraft(input) {
      const db = await requireDb();
      await db.insert(seekerAgentDrafts).values(input);
      const [row] = await db.select().from(seekerAgentDrafts).where(eq(seekerAgentDrafts.grantId, input.grantId)).orderBy(desc(seekerAgentDrafts.id)).limit(1);
      return toDraft(row);
    },
    async listDraftsByGrant(grantId, limit) {
      const db = await requireDb();
      const rows = await db.select().from(seekerAgentDrafts).where(eq(seekerAgentDrafts.grantId, grantId)).orderBy(desc(seekerAgentDrafts.createdAt)).limit(limit);
      return rows.map(toDraft);
    },
    async sumDraftCreditsSince(grantId, since) {
      const db = await requireDb();
      const [row] = await db.select({ total: sql<number>`COALESCE(SUM(${seekerAgentDrafts.creditCost}),0)` }).from(seekerAgentDrafts)
        .where(and(eq(seekerAgentDrafts.grantId, grantId), gte(seekerAgentDrafts.createdAt, since), eq(seekerAgentDrafts.status, "draft")));
      return Number(row?.total ?? 0);
    },
    async countDraftsSince(grantId, since) {
      const db = await requireDb();
      const [row] = await db.select({ total: sql<number>`COUNT(*)` }).from(seekerAgentDrafts)
        .where(and(eq(seekerAgentDrafts.grantId, grantId), gte(seekerAgentDrafts.createdAt, since), eq(seekerAgentDrafts.status, "draft")));
      return Number(row?.total ?? 0);
    },
    async listEvents(userId, grantId, limit) {
      const db = await requireDb();
      const rows = await db.select().from(seekerAgentEvents)
        .where(and(eq(seekerAgentEvents.userId, userId), eq(seekerAgentEvents.grantId, grantId)))
        .orderBy(desc(seekerAgentEvents.createdAt)).limit(limit);
      return rows.map(toEvent);
    },
    async recordEvent(input) {
      const db = await requireDb();
      await db.insert(seekerAgentEvents).values({ userId: input.userId, grantId: input.grantId, agentName: input.agentName, action: input.action, outcome: input.outcome, detail: input.detail ?? null });
    },
  };
}

/** Live read-only sources + pricing helpers for the route module. */
export function createSeekerAgentSourceDeps(): Pick<SeekerAgentRouteDeps, "listCompanies" | "prices" | "quoteCost" | "getCompanyDirectoryEntry"> {
  return {
    listCompanies: async (): Promise<PublicCompany[]> => (await listCompanyDirectory()).companies,
    prices: async (req: Request, region: "IN" | "INTL"): Promise<PlanCatalogResponse> => {
      const credentials = resolveChargebeeRuntime(req.hostname);
      const prices = sellableItemPrices();
      const verdicts = await priceAvailability(prices, { credentials });
      if (credentials && prices.length > 0 && verdicts.unknown.size === prices.length) throw new Error("price provider unreachable");
      return planCatalogResponse({
        region,
        available: itemPriceId => verdicts.available.has(itemPriceId),
        indiaGstRegistered: indiaGstRegistered(),
        usdRecurringConfirmed: usdRecurringConfirmed(),
        sessionsStaffed: humanReviewersStaffed(),
      });
    },
    quoteCost: (targetRoleUrl: string) => {
      const level = assignJobLevel({ url: normalizeTargetRoleUrl(targetRoleUrl) }).level;
      return { level, cost: askLevelCostEnabled() ? creditsForLevel(level) : 1 };
    },
    getCompanyDirectoryEntry,
  };
}
