import { eq } from "drizzle-orm";
import { askDrafts } from "../drizzle/schema";
import type { AskDraft, AskDraftInput } from "../shared/askDraft";
import { getDb } from "./db";

const shape = (row: { companySlug: string; targetRoleUrl: string; note: string; updatedAt: Date }): AskDraft => ({ companySlug: row.companySlug, targetRoleUrl: row.targetRoleUrl, note: row.note, updatedAt: row.updatedAt.toISOString() });

export async function getAskDraft(userId: number): Promise<AskDraft | null> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const row = (await db.select().from(askDrafts).where(eq(askDrafts.userId, userId)).limit(1))[0];
  return row ? shape(row) : null;
}

/** One draft per user: a new save replaces the old one. Idempotent. */
export async function saveAskDraft(userId: number, input: AskDraftInput): Promise<AskDraft> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const now = new Date();
  await db.insert(askDrafts).values({ userId, ...input, createdAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { companySlug: input.companySlug, targetRoleUrl: input.targetRoleUrl, note: input.note, updatedAt: now } });
  return (await getAskDraft(userId)) as AskDraft;
}

export async function deleteAskDraft(userId: number): Promise<void> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  await db.delete(askDrafts).where(eq(askDrafts.userId, userId));
}
