import { z } from "zod";

// D-193: activation belongs to QA/expiry-clock removal, never this build.
export const ASK_RECONFIRM_ENABLED = false;
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
