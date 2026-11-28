import { z } from "zod";

// D-193: activated by D-174-no-expiry-release together with ASK_NO_EXPIRY_ENABLED (D-411; QA journey e2e/reconfirm-money.e2e.ts).
export const ASK_RECONFIRM_ENABLED = true;
export const RECONFIRM_AFTER_DAYS = 30;

export const askReconfirmParamsSchema = z.strictObject({
  requestId: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)),
});
export const askReconfirmBodySchema = z.strictObject({});

export const askReconfirmResponseSchema = z.strictObject({
  requestId: z.number().int().positive(),
  confirmed: z.literal(true),
});
export type AskReconfirmResponse = z.infer<typeof askReconfirmResponseSchema>;
