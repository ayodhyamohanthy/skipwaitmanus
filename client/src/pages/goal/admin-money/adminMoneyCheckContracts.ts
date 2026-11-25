import { z } from "zod";

const timestamp = z.string().refine(value => !Number.isNaN(Date.parse(value)));

export const moneyCheckRunSchema = z.strictObject({
  ranAt: timestamp,
  findingsFound: z.boolean(),
  emailSent: z.boolean(),
  subject: z.string().nullable(),
  findings: z.string().nullable(),
});
export type MoneyCheckRun = z.infer<typeof moneyCheckRunSchema>;

export const moneyCheckAlertStatusSchema = z.strictObject({
  latestOutcome: z.string().nullable(),
  latestAt: timestamp.nullable(),
  lastSuccessAt: timestamp.nullable(),
  failuresLast7Days: z.number().int().nonnegative(),
  ownerNotReached: z.boolean(),
});
export type MoneyCheckAlertStatus = z.infer<typeof moneyCheckAlertStatusSchema>;

export const testAlertResponseSchema = z.strictObject({ sentAt: timestamp, sent: z.boolean() });

export const abandonedCheckoutResultSchema = z.strictObject({
  cutoff: timestamp,
  candidates: z.number().int().nonnegative(),
  accounts: z.number().int().nonnegative(),
  oldest: timestamp.nullable(),
  newest: timestamp.nullable(),
  byCurrency: z.array(z.strictObject({ currency: z.string(), count: z.number().int().nonnegative() })),
  applied: z.boolean(),
  closed: z.number().int().nonnegative(),
});
export type AbandonedCheckoutResult = z.infer<typeof abandonedCheckoutResultSchema>;

export function responseError(payload: unknown, fallback: string): string {
  const parsed = z.object({ error: z.string().min(1) }).safeParse(payload);
  return parsed.success ? parsed.data.error : fallback;
}
