// The parts of a Chargebee webhook the subscription management features read,
// parsed with Zod: what the subscription bills, its scheduled switch, pause and
// dues, and the invoice and failed transaction of a payment event. Anything
// malformed is dropped (the snapshot reads as absent), never guessed.
import { z } from "zod";
import { paymentFailureReasonFrom, type PaymentFailureReason } from "../shared/billingAccount";
import { resolvePlanItemPrice } from "../shared/billingCatalog";

const optional = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform(value => value ?? undefined);
const seconds = z.number().int().positive().transform(value => new Date(value * 1000));
const money = z.number().int().nonnegative();

const payloadSchema = z.object({
  event_type: z.string(),
  content: z.object({
    subscription: optional(z.object({
      id: z.string().min(1).max(80),
      customer_id: optional(z.string().min(1).max(80)),
      has_scheduled_changes: optional(z.boolean()),
      pause_date: optional(seconds),
      resume_date: optional(seconds),
      due_invoices_count: optional(z.number().int().nonnegative()),
      due_since: optional(seconds),
      subscription_items: optional(z.array(z.object({ item_price_id: z.string(), item_type: optional(z.string()), unit_price: optional(money) }))),
    })),
    invoice: optional(z.object({
      id: z.string().min(1).max(80),
      status: optional(z.string()),
      subscription_id: optional(z.string()),
      amount_due: optional(money),
      next_retry_at: optional(seconds),
    })),
    transaction: optional(z.object({ status: optional(z.string()), error_code: optional(z.string()), error_text: optional(z.string()) })),
  }),
});

export type SubscriptionSnapshot = {
  /** True when the payload carried the full subscription object (absent pause/scheduled fields then mean "none"). */
  hasSubscription: boolean;
  itemPriceId?: string;
  unitPrice?: number;
  customerId?: string;
  hasScheduledChanges?: boolean;
  pauseDate?: Date;
  resumeDate?: Date;
  dueInvoicesCount?: number;
  dueSince?: Date;
  invoice?: { id: string; status?: string; amountDue?: number; nextRetryAt?: Date; subscriptionId?: string };
  /** A failed collection on a payment_failed event, with the kit failure reason. */
  failure?: { code: string | null; reason: PaymentFailureReason };
};

export function parseSubscriptionSnapshot(payload: unknown): SubscriptionSnapshot | undefined {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return undefined;
  const { event_type: eventType, content } = parsed.data;
  const subscription = content.subscription;
  const items = subscription?.subscription_items ?? [];
  // The plan line: the first item the price book knows, else the first item Chargebee marks as a plan.
  const planItem = items.find(item => resolvePlanItemPrice(item.item_price_id)) ?? items.find(item => item.item_type === "plan");
  const transaction = content.transaction;
  const failed = eventType === "payment_failed" && (transaction?.status === undefined || transaction.status === "failure");
  return {
    hasSubscription: Boolean(subscription),
    itemPriceId: planItem?.item_price_id,
    unitPrice: planItem?.unit_price,
    customerId: subscription?.customer_id,
    hasScheduledChanges: subscription?.has_scheduled_changes,
    pauseDate: subscription?.pause_date,
    resumeDate: subscription?.resume_date,
    dueInvoicesCount: subscription?.due_invoices_count,
    dueSince: subscription?.due_since,
    invoice: content.invoice ? { id: content.invoice.id, status: content.invoice.status, amountDue: content.invoice.amount_due, nextRetryAt: content.invoice.next_retry_at, subscriptionId: content.invoice.subscription_id } : undefined,
    failure: failed ? { code: (transaction?.error_code ?? null)?.slice(0, 64) ?? null, reason: paymentFailureReasonFrom(transaction?.error_code, transaction?.error_text) } : undefined,
  };
}
