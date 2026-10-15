import { z } from "zod";
import { COMPANY_SLUG_PATTERN } from "./companies";
import { isValidTargetRoleUrl } from "./referralUrl";

export const ASK_DRAFT_NOTE_LIMIT = 600;

/** PUT body. The user id is never part of it: the session decides whose draft this is. */
export const askDraftInputSchema = z.object({
  companySlug: z.string().regex(COMPANY_SLUG_PATTERN),
  targetRoleUrl: z.string().trim().max(2048).refine(value => isValidTargetRoleUrl(value), "Add a complete public job link"),
  note: z.string().trim().max(ASK_DRAFT_NOTE_LIMIT),
}).strict();

export type AskDraftInput = z.output<typeof askDraftInputSchema>;
export type AskDraft = AskDraftInput & { updatedAt: string };
