import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, lte, or, isNull, isNotNull, count } from "drizzle-orm";
import { z } from "zod";
import { billingReviewOutbox } from "../drizzle/schema";
import { getDb } from "./db";
import { resolveBillingEnvironment } from "./chargebeeEnvironment";


type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const inputSchema = z.object({ reason: z.enum(["plan_retired", "unsupported_plan", "gift_claimed", "gift_claim_refused", "payment_failed", "upgrade_leftover_blocked"]), eventId: z.string().min(1).max(255).optional(), eventType: z.string().min(1).max(100).optional(), subscriptionId: z.string().min(1).max(255).optional(), giftId: z.string().min(1).max(255).optional(), itemPriceId: z.string().min(1).max(255).optional(), invoiceId: z.string().min(1).max(255).optional(), customerId: z.string().min(1).max(255).optional(), amount: z.number().nonnegative().optional(), currency: z.string().min(1).max(8).optional() }).strict();
export type BillingReviewInput = z.infer<typeof inputSchema>;
const envelopeSchema = z.object({ from: z.string().email().max(320), to: z.tuple([z.literal("ayodhya@skipwait.me")]), subject: z.string().max(512), text: z.string().max(8192) }).strict();
const payloadSchema = z.object({ version: z.literal(1), classification: z.enum(["retired", "unsupported", "payment_failed", "upgrade_blocked"]), trigger: z.enum(["subscription", "gift", "payment"]), evidence: inputSchema }).strict();
const frozenEnvelopeSchema = z.object({ version: z.literal(1), bytes: z.string().max(16384) }).strict();
export const reviewStateSchema = z.object({
  obligationKey: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(["pending", "accepted", "unknown"]),
  submissionState: z.enum(["never_submitted", "known_rejected", "ambiguous"]),
  attempts: z.number().int().nonnegative(),
  leaseOwner: z.string().min(1).max(64).nullable(), leaseUntil: z.date().nullable(),
  acceptedAt: z.date().nullable(), providerMessageId: z.string().min(1).max(255).nullable(), lastError: z.string().max(80).nullable(),
}).superRefine((row, ctx) => {
  if ((row.leaseOwner === null) !== (row.leaseUntil === null)) ctx.addIssue({ code: "custom", message: "Lease must be paired" });
  if (row.status !== "pending" && row.leaseOwner !== null) ctx.addIssue({ code: "custom", message: "Terminal state retains lease" });
  if (row.status === "accepted" && (!row.acceptedAt || !row.providerMessageId)) ctx.addIssue({ code: "custom", message: "Acceptance evidence missing" });
  if (row.status === "unknown" && !row.lastError) ctx.addIssue({ code: "custom", message: "Unknown reason missing" });
});
const DAY = 24 * 60 * 60_000;
// ZeptoMail first (prod transactional provider), Resend only when Zepto is not configured.
// ZeptoMail has no idempotency key, so a retry after an ambiguous attempt can send the owner a
// second copy (at-least-once). The obligationKey row still makes the obligation itself unique.
function providerConfigured() { return Boolean(process.env.ZEPTOMAIL_API_KEY || process.env.RESEND_API_KEY); }
function providerRequest(bytes: string, obligationKey: string): [string, RequestInit] {
  if (process.env.ZEPTOMAIL_API_KEY) {
    const e = envelopeSchema.parse(JSON.parse(bytes));
    return ["https://api.zeptomail.com/v1.1/email", { method: "POST", headers: { Authorization: `Zoho-enczapikey ${process.env.ZEPTOMAIL_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: { address: e.from, name: process.env.ZEPTOMAIL_FROM_NAME || "skipwait.me" }, to: [{ email_address: { address: e.to[0] } }], subject: e.subject, textbody: e.text, client_reference: obligationKey.slice(0, 64) }), signal: AbortSignal.timeout(10_000) }];
  }
  return ["https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `billing-review-v1/${obligationKey}` }, body: bytes, signal: AbortSignal.timeout(10_000) }];
}
function parseReceipt(body: unknown): { id: string } {
  const resend = z.object({ id: z.string().min(1).max(255) }).safeParse(body);
  if (resend.success) return resend.data;
  return { id: z.object({ request_id: z.string().min(1).max(255) }).parse(body).request_id };
}
export function billingReviewKey(input: BillingReviewInput) {
  const environment = resolveBillingEnvironment();
  const site = environment === "live" ? process.env.CHARGEBEE_LIVE_SITE : process.env.CHARGEBEE_SITE;
  if (!site?.trim()) throw new Error("Review site missing");
  if (!input.giftId && !input.eventId) throw new Error("Review identity missing");
  // payment_failed / upgrade_leftover_blocked key by event + reason: a provider
  // event id is unique, and the reason keeps distinct obligations of one event
  // apart. Retired/unsupported keep the original v1 key shape (existing rows).
  const scoped = input.reason === "payment_failed" || input.reason === "upgrade_leftover_blocked";
  return createHash("sha256").update(JSON.stringify(["billing-review-v1", "chargebee", environment, site, input.giftId ? "gift" : "event", input.giftId ?? input.eventId, ...(scoped ? [input.reason] : [])])).digest("hex");
}
export async function enqueueBillingReviewTx(tx: Tx, value: BillingReviewInput) {
  const input = inputSchema.parse(value);
  const classification = input.reason === "unsupported_plan" ? "unsupported" : input.reason === "payment_failed" ? "payment_failed" : input.reason === "upgrade_leftover_blocked" ? "upgrade_blocked" : "retired";
  const trigger = input.reason === "payment_failed" ? "payment" : input.giftId ? "gift" : "subscription";
  const payload = payloadSchema.parse({ version: 1, classification, trigger, evidence: input });
  const serialized = JSON.stringify(payload);
  const conflictDigest = createHash("sha256").update(JSON.stringify(["review-conflict-v1", payload.classification, input.itemPriceId ?? null, input.subscriptionId ?? null, input.giftId ? null : input.eventType ?? null])).digest("hex");
  if (Buffer.byteLength(serialized) > 4096) throw new Error("Review payload too large");
  const key = billingReviewKey(input);
  await tx.insert(billingReviewOutbox).values({ obligationKey: key, conflictDigest, payload: serialized, status: "pending", submissionState: "never_submitted", attempts: 0, nextAttemptAt: new Date(), updatedAt: new Date(), createdAt: new Date() }).onDuplicateKeyUpdate({ set: { obligationKey: key } });
  const existing = (await tx.select().from(billingReviewOutbox).where(eq(billingReviewOutbox.obligationKey, key)).limit(1).for("update"))[0];
  if (existing.status === "accepted" && existing.payload === null) {
    if (existing.conflictDigest !== conflictDigest) console.error("[BillingReview] operator reconciliation required", { obligationKey: key, code: "accepted_classification_conflict" });
    return;
  }
  if (existing.payload === null) throw new Error("Unresolved review payload missing");
  const previous = payloadSchema.parse(JSON.parse(existing.payload));
  // Same gift may have different trigger evidence; classification must never silently change.
  if (previous.classification !== payload.classification || (previous.evidence.itemPriceId && input.itemPriceId && previous.evidence.itemPriceId !== input.itemPriceId) || (previous.evidence.subscriptionId && input.subscriptionId && previous.evidence.subscriptionId !== input.subscriptionId)) {
    await tx.update(billingReviewOutbox).set({ status: "unknown", lastError: "classification_conflict", leaseOwner: null, leaseUntil: null, updatedAt: new Date() }).where(eq(billingReviewOutbox.id, existing.id));
    console.error("[BillingReview] operator reconciliation required", { obligationKey: key, code: "classification_conflict" });
  }
}
export function reviewEnvelope(input: BillingReviewInput, sender: string) {
  if (input.reason === "payment_failed") {
    const ref = input.invoiceId ?? input.eventId ?? "unknown";
    return { from: sender, to: ["ayodhya@skipwait.me"], subject: `skipwait.me payment failed needs review · ${ref}`, text: JSON.stringify(input) + "\n" + "Chargebee reported a FAILED payment. No money settled and no credits moved. If this was a renewal, dunning may retry; check the subscription in Chargebee and, if the customer expects to have paid, tell them it did not go through." };
  }
  if (input.reason === "upgrade_leftover_blocked") {
    const ref = input.subscriptionId ?? input.eventId ?? "unknown";
    return { from: sender, to: ["ayodhya@skipwait.me"], subject: `skipwait.me upgrade parked pending decision · ${ref}`, text: JSON.stringify(input) + "\n" + "A Free wallet with unused credits reached a paid family-plan upgrade while the leftover-credit rule is undecided. The event is recorded and the transition parked as blocked: the wallet keeps plan free with its credits, the intent stays pending. RECOVERY: decide the leftover rule, then complete the activation for this subscription (or refund in Chargebee per that decision). Nothing was granted automatically." };
  }
  const unsupported = input.reason === "unsupported_plan";
  return { from: sender, to: ["ayodhya@skipwait.me"], subject: `SkipWait billing review ${input.giftId ?? input.eventId}`, text: JSON.stringify(input) + "\n" + (unsupported ? "Unrecognised item price. Review the subscription; do not cancel or refund until classified." : "Retired plan. In Chargebee, cancel the subscription and refund any payment taken.") };
}
export async function runBillingReviewOutbox(options: { now?: () => Date; fetchImpl?: typeof fetch; database?: Db } = {}) {
  const db = options.database ?? await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = options.now ?? (() => new Date());
  // Acceptance is terminal. Purge both transport fields atomically; never reopen or rotate identity.
  await db.update(billingReviewOutbox).set({ payload: null, envelope: null, updatedAt: now() }).where(and(eq(billingReviewOutbox.status, "accepted"), lte(billingReviewOutbox.acceptedAt, new Date(now().getTime() - 7 * DAY)), isNull(billingReviewOutbox.leaseOwner), isNull(billingReviewOutbox.leaseUntil), isNotNull(billingReviewOutbox.payload)));
  const pendingCount = (await db.select({ value: count() }).from(billingReviewOutbox).where(eq(billingReviewOutbox.status, "pending")))[0]?.value ?? 0;
  const unknownCount = (await db.select({ value: count() }).from(billingReviewOutbox).where(eq(billingReviewOutbox.status, "unknown")))[0]?.value ?? 0;
  const oldest = (await db.select({ createdAt: billingReviewOutbox.createdAt }).from(billingReviewOutbox).where(eq(billingReviewOutbox.status, "pending")).orderBy(asc(billingReviewOutbox.createdAt)).limit(1))[0];
  console.info("[BillingReview] queue health", { pendingCount: Number(pendingCount), unknownCount: Number(unknownCount), oldestPendingAgeMs: oldest ? Math.max(0, now().getTime() - oldest.createdAt.getTime()) : 0 });
  const due = await db.select().from(billingReviewOutbox).where(and(eq(billingReviewOutbox.status, "pending"), lte(billingReviewOutbox.nextAttemptAt, now()), or(isNull(billingReviewOutbox.leaseUntil), lte(billingReviewOutbox.leaseUntil, now())))).orderBy(asc(billingReviewOutbox.nextAttemptAt), asc(billingReviewOutbox.id)).limit(25);
  let processed = 0, failed = Number(unknownCount);
  if (Number(unknownCount)) console.error("[BillingReview] unresolved quarantine", { unknownCount: Number(unknownCount) });
  // Outage remains failed on subsequent ticks even while individual rows are backed off.
  if (Number(pendingCount) && (!process.env.ERROR_ALERT_FROM_EMAIL || !providerConfigured())) {
    console.error("[BillingReview] configuration repair required", { code: "configuration_missing", pendingCount: Number(pendingCount) });
    failed++;
  }
  for (const candidate of due) {
    const owner = randomUUID();
    const row = await db.transaction(async tx => {
      const current = (await tx.select().from(billingReviewOutbox).where(eq(billingReviewOutbox.id, candidate.id)).limit(1).for("update"))[0];
      const at = now();
      if (current) reviewStateSchema.parse(current);
      if (!current || current.status !== "pending" || current.nextAttemptAt > at || (current.leaseUntil && current.leaseUntil > at)) return undefined;
      if (current.submissionState === "ambiguous" && current.firstAttemptAt && at.getTime() - current.firstAttemptAt.getTime() >= DAY - 60_000) {
        await tx.update(billingReviewOutbox).set({ status: "unknown", lastError: "idempotency_window_expired", leaseOwner: null, leaseUntil: null, updatedAt: at }).where(eq(billingReviewOutbox.id, current.id));
        console.error("[BillingReview] operator reconciliation required", { obligationKey: current.obligationKey, code: "idempotency_window_expired" });
        failed++;
        return undefined;
      }
      const sender = process.env.ERROR_ALERT_FROM_EMAIL;
      if (!sender || !providerConfigured()) {
        await tx.update(billingReviewOutbox).set({ updatedAt: at, lastError: "configuration_missing", nextAttemptAt: new Date(at.getTime() + 60 * 60_000) }).where(eq(billingReviewOutbox.id, current.id));
        console.error("[BillingReview] configuration repair required", { obligationKey: current.obligationKey, code: "configuration_missing" });
        return undefined;
      }
      const stored = payloadSchema.parse(JSON.parse(current.payload ?? "null"));
      const bytes = current.envelope ? frozenEnvelopeSchema.parse(JSON.parse(current.envelope)).bytes : JSON.stringify(envelopeSchema.parse(reviewEnvelope(stored.evidence, sender)));
      if (Buffer.byteLength(bytes) > 16384) throw new Error("Review envelope too large");
      envelopeSchema.parse(JSON.parse(bytes));
      const envelope = current.envelope ?? JSON.stringify({ version: 1, bytes });
      const firstAttemptAt = current.firstAttemptAt ?? at;
      await tx.update(billingReviewOutbox).set({ envelope, firstAttemptAt, submissionState: "ambiguous", updatedAt: at, leaseOwner: owner, leaseUntil: new Date(at.getTime() + 60_000), attempts: current.attempts + 1 }).where(eq(billingReviewOutbox.id, current.id));
      return { ...current, envelope, firstAttemptAt, hadPriorAmbiguity: current.submissionState === "ambiguous", attempts: current.attempts + 1 };
    }).catch(() => { failed++; return undefined; });
    if (!row) continue;
    const fence = and(eq(billingReviewOutbox.id, row.id), eq(billingReviewOutbox.leaseOwner, owner), eq(billingReviewOutbox.status, "pending"));
    try {
      const frozen = frozenEnvelopeSchema.parse(JSON.parse(row.envelope));
      envelopeSchema.parse(JSON.parse(frozen.bytes));
      const response = await (options.fetchImpl ?? fetch)(...providerRequest(frozen.bytes, row.obligationKey));
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const conflict = response.status === 409 && typeof body === "object" && body !== null && "name" in body && body.name === "invalid_idempotent_request";
        if (conflict) {
          await db.update(billingReviewOutbox).set({ updatedAt: now(), status: "unknown", lastError: "payload_conflict", leaseOwner: null, leaseUntil: null }).where(fence);
          console.error("[BillingReview] operator reconciliation required", { obligationKey: row.obligationKey, code: "payload_conflict" });
          failed++; continue;
        }
        // An explicit rate rejection did not accept this submission. Honor Retry-After.
        if ([400, 401, 403, 422, 429].includes(response.status)) {
          const delaySeconds = Number(response.headers.get("Retry-After"));
          const delay = Number.isFinite(delaySeconds) && delaySeconds > 0 ? Math.min(delaySeconds * 1000, DAY) : 60 * 60_000;
          await db.update(billingReviewOutbox).set({ updatedAt: now(), submissionState: row.hadPriorAmbiguity ? "ambiguous" : "known_rejected", lastError: "provider_rejected", nextAttemptAt: new Date(now().getTime() + delay), leaseOwner: null, leaseUntil: null }).where(fence);
          failed++; continue;
        }
        throw new Error(`provider_${response.status}`);
      }
      const receipt = parseReceipt(await response.json());
      const accepted = await db.update(billingReviewOutbox).set({ updatedAt: now(), status: "accepted", acceptedAt: now(), providerMessageId: receipt.id, lastError: null, leaseOwner: null, leaseUntil: null }).where(fence);
      if (accepted[0].affectedRows === 1) processed++;
    } catch {
      failed++;
      await db.update(billingReviewOutbox).set({ updatedAt: now(), lastError: "submission_unconfirmed", nextAttemptAt: new Date(now().getTime() + Math.min(60 * 60_000, 60_000 * 2 ** Math.min(row.attempts, 6))), leaseOwner: null, leaseUntil: null }).where(fence);
    }
  }
  return { processed, failed };
}
