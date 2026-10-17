/**
 * Work a seeker pins onto an ask (queue task 13: pinned work rides along with
 * the ask). The server copies the seeker's own showcase pieces into the ask at
 * send time, so a referrer can judge fit before accepting and a later showcase
 * edit never rewrites what they were shown. Only the title, kind, source and
 * public link travel — never a seeker id or the showcase's own row ids.
 */
import { z } from "zod";

/** Mirrors the `kind` enum shared by `workItems` and `askWorkItems` in drizzle/schema.ts. */
export const ASK_WORK_ITEM_KINDS = ["case_study", "project", "article", "code", "other"] as const;
export type AskWorkItemKind = (typeof ASK_WORK_ITEM_KINDS)[number];

/**
 * Transport ceiling: the largest `showcase.pins` any plan sells today (Momentum
 * and Land pin 6 — shared/planEntitlements.ts). A seeker's own plan cap is
 * enforced per wallet in server/db.ts; this only bounds what one request can carry.
 */
export const MAX_ASK_WORK_ITEMS = 6;

/** `workItemIds` on POST /api/company-referrals. Duplicates are folded, not refused. */
export const askWorkItemIdsSchema = z.array(z.number().int().positive()).max(MAX_ASK_WORK_ITEMS);
export type AskWorkItemIds = z.output<typeof askWorkItemIdsSchema>;

/**
 * The row a verified referrer sees before accepting, ordered as the seeker chose it.
 * Read direction only (the server builds it from its own select), so unknown extra
 * fields are stripped rather than voiding the list — a newer API must not make the
 * section disappear for a web bundle that predates its fields.
 */
export const askWorkItemSchema = z.object({
  title: z.string().min(1).max(160),
  kind: z.enum(ASK_WORK_ITEM_KINDS),
  source: z.string().max(80).nullable(),
  url: z.string().max(2048).nullable(),
});
export type AskWorkItem = z.output<typeof askWorkItemSchema>;

/**
 * Boundary parse for a preview response: an absent or malformed list reads as "no
 * pinned work" instead of throwing — the web bundle can lead the API by one deploy.
 * `.parse` is total here because of the catch.
 */
export const askWorkItemsListSchema = z.array(askWorkItemSchema).catch([]);

/** First copy wins; the order the seeker chose is the order the referrer reads. */
export function dedupeAskWorkItemIds(ids: readonly number[]): number[] {
  return Array.from(new Set(ids));
}

/**
 * The only links a referrer may open: the showcase write path stores http(s)
 * (server/db.ts validateWorkItemInput), but the snapshot is read straight into an
 * anchor, so anything else renders as text rather than as a clickable scheme.
 */
export function safeAskWorkUrl(url: string | null): string | null {
  const trimmed = url?.trim() ?? "";
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}

/** Headline for the pinned-work block, on the ask composer and the referrer preview. */
export const ASK_WORK_SECTION_TITLE = "Pinned work";
