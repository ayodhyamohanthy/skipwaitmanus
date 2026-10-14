import type { Express, Request } from "express";

/**
 * Admin billing ledger: GET /api/admin/billing/ledger.
 *
 * Read-only, admin-gated. Exposes the app-side record of money-adjacent events
 * (checkout intents, payment fulfillments, credit grants, revokes and refund
 * reversals) so QA can reconcile Chargebee transactions against our ledger.
 * userId only; no emails or names. Time-window paging: when any source hits
 * the limit the response says `truncated` and gives `nextSince` to continue.
 * Bounds: `since` is inclusive, `until` is exclusive (ISO timestamps).
 * Unmatched paid invoices and refunds that could not be applied have no
 * paymentFulfillments row (userId is required there), so they appear as
 * `parked_event` rows read from the operational activity log.
 */

const DAY_MS = 86_400_000;
const MAX_WINDOW_DAYS = 31;

type Row = Record<string, unknown> & { createdAt: Date };
export type LedgerRows = { intents: Row[]; payments: Row[]; transactions: Row[]; parked: Row[] };

export type AdminBillingLedgerDeps = {
  resolveIdentity: (req: Request) => Promise<{ account: { id: number; role?: string } } | undefined>;
  loadRows: (window: { since: Date; until: Date; limit: number }) => Promise<LedgerRows | undefined>;
  now?: () => Date;
};

function parseDate(value: unknown): Date | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function transactionType(row: Row): string {
  if (row.reversesTransactionId != null) return "refund_reversal";
  if (row.source === "payment_refund") return "refund_reversal";
  return Number(row.tokenCount) < 0 ? "credit_revoke" : "credit_grant";
}

export function buildLedgerEvents(rows: LedgerRows, limit: number) {
  const events: Array<Record<string, unknown> & { at: string }> = [];
  for (const r of rows.intents.slice(0, limit)) {
    events.push({ type: "checkout_intent", at: r.createdAt.toISOString(), userId: r.userId, role: r.role, checkoutIntentId: r.checkoutIntentId, hostedPageId: r.hostedPageId, plan: r.plan, itemPriceId: r.itemPriceId, amount: r.amount, currency: r.currency, status: r.status });
  }
  for (const r of rows.payments.slice(0, limit)) {
    events.push({ type: "payment_fulfillment", at: r.createdAt.toISOString(), userId: r.userId, role: r.role, paymentId: r.id, provider: r.provider, providerEventId: r.providerEventId, providerInvoiceId: r.providerInvoiceId ?? null, hostedPageId: r.providerHostedPageId ?? null, checkoutIntentId: r.checkoutIntentId ?? null, tokens: r.tokenCount, amount: r.amount, currency: r.currency, status: r.status, reconciliationReason: r.reconciliationReason ?? null, lastCheckedAt: r.lastCheckedAt instanceof Date ? r.lastCheckedAt.toISOString() : null, creditedAt: r.creditedAt instanceof Date ? r.creditedAt.toISOString() : null });
  }
  for (const r of rows.transactions.slice(0, limit)) {
    events.push({ type: transactionType(r), at: r.createdAt.toISOString(), userId: r.userId, role: r.role, txId: r.id, kind: r.kind, source: r.source ?? null, tokenCount: r.tokenCount, referenceType: r.referenceType ?? null, referenceId: r.referenceId ?? null, idempotencyKey: r.idempotencyKey ?? null, reversesTxId: r.reversesTransactionId ?? null, balanceAfter: r.balanceAfter ?? null });
  }
  for (const r of rows.parked.slice(0, limit)) {
    let meta: Record<string, unknown> = {};
    try { const parsed = JSON.parse(String(r.metadata ?? "{}")); if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>; } catch { /* unreadable metadata is reported as empty */ }
    const pick = (key: string) => (meta[key] === undefined ? null : meta[key]);
    events.push({ type: "parked_event", at: r.createdAt.toISOString(), logId: r.id, action: r.action, providerInvoiceId: r.resourceId ?? null, eventId: pick("eventId"), reason: pick("reason"), hostedPageId: pick("hostedPageId"), paymentId: pick("paymentId"), amount: pick("amount") ?? pick("refundAmount"), currency: pick("currency") });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  return events;
}

export function registerAdminBillingLedgerRoutes(app: Express, deps: AdminBillingLedgerDeps): void {
  app.get("/api/admin/billing/ledger", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      const now = (deps.now ?? (() => new Date()))();
      const until = parseDate(req.query.until);
      const sinceParam = parseDate(req.query.since);
      if (until === null || sinceParam === null) return res.status(400).json({ error: "since and until must be ISO timestamps" });
      const end = until ?? now;
      const start = sinceParam ?? new Date(end.getTime() - DAY_MS);
      if (start >= end) return res.status(400).json({ error: "since must be before until" });
      if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * DAY_MS) return res.status(400).json({ error: `window may not exceed ${MAX_WINDOW_DAYS} days` });
      const limitRaw = req.query.limit === undefined ? 200 : Number(req.query.limit);
      if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 500) return res.status(400).json({ error: "limit must be an integer from 1 to 500" });
      const rows = await deps.loadRows({ since: start, until: end, limit: limitRaw });
      if (!rows) return res.status(503).json({ error: "Database unavailable" });
      const sources = [rows.intents, rows.payments, rows.transactions, rows.parked];
      const truncated = sources.some(source => source.length > limitRaw);
      let events = buildLedgerEvents(rows, limitRaw);
      let nextSince: string | null = null;
      if (truncated) {
        // Cut every source at the earliest point where any source was cut, so
        // nothing before nextSince is missing from any source.
        // since is inclusive, so events strictly before cutAt are returned and
        // the next page starts AT cutAt. If a single instant fills a page, keep
        // that instant and advance one second so paging cannot stall.
        const cutAt = sources.filter(s => s.length > limitRaw).map(s => s[limitRaw - 1].createdAt.getTime()).reduce((a, b) => Math.min(a, b));
        const before = events.filter(e => new Date(e.at).getTime() < cutAt);
        if (before.length > 0) { events = before; nextSince = new Date(cutAt).toISOString(); }
        else { events = events.filter(e => new Date(e.at).getTime() <= cutAt); nextSince = new Date(cutAt + 1000).toISOString(); }
      }
      const byType: Record<string, number> = {};
      for (const e of events) byType[String(e.type)] = (byType[String(e.type)] ?? 0) + 1;
      res.json({ generatedAt: now.toISOString(), since: start.toISOString(), until: end.toISOString(), truncated, nextSince, counts: byType, events });
    } catch {
      res.status(500).json({ error: "Ledger query failed" });
    }
  });
}
