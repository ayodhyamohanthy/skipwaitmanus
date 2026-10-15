import { z } from "zod";
import { companyIdentityFieldsSchema } from "./companies";
import { jobFunctionFieldSchema } from "./jobFunctions";

/*
 * How a referrer sees the files on an ask (D-019, privacy promise: "Before
 * acceptance, a Referrer sees neither the Job Seeker's name nor resume").
 *
 * Before acceptance a file is "locked": its type and size only, so the card
 * can say how many files wait. Never the file name (resume file names
 * routinely carry the seeker's full name), never a link and never the file id
 * (nothing to try against GET /api/documents/:id, which refuses it anyway).
 *
 * After acceptance a file is "open": its name, and a link while the referrer's
 * document access is active (null once that access has ended).
 */

/** Wire value kept from the first locked shape; it means "opens after acceptance". */
export const LOCKED_ATTACHMENT_AVAILABILITY = "after_claim" as const;

export const lockedAskAttachmentSchema = z.object({
  mimeType: z.string().nullish(),
  fileSize: z.number().int().nonnegative().nullish(),
  availability: z.literal(LOCKED_ATTACHMENT_AVAILABILITY),
});

export const openAskAttachmentSchema = z.object({
  id: z.number().int().positive(),
  fileName: z.string(),
  mimeType: z.string().nullish(),
  fileSize: z.number().int().nonnegative().nullish(),
  url: z.string().nullish(),
});

/** Either shape; parsers read whichever the server sent. */
export const referrerAskAttachmentSchema = z.union([openAskAttachmentSchema, lockedAskAttachmentSchema]);

export type LockedAskAttachment = z.infer<typeof lockedAskAttachmentSchema>;
export type OpenAskAttachment = z.infer<typeof openAskAttachmentSchema>;
export type ReferrerAskAttachment = z.infer<typeof referrerAskAttachmentSchema>;

/** A stored attachment row as the referral store returns it (no storage key). */
export type AskAttachmentRow = { readonly id: number; readonly fileName: string; readonly mimeType?: string | null; readonly fileSize?: number | null };

export function toLockedAskAttachment(row: AskAttachmentRow): LockedAskAttachment {
  return { mimeType: row.mimeType, fileSize: row.fileSize, availability: LOCKED_ATTACHMENT_AVAILABILITY };
}

export function toOpenAskAttachment(row: AskAttachmentRow, documentAccessActive: boolean): OpenAskAttachment {
  return { id: row.id, fileName: row.fileName, mimeType: row.mimeType, fileSize: row.fileSize, url: documentAccessActive ? `/api/documents/${row.id}` : null };
}

export function isOpenAskAttachment(attachment: ReferrerAskAttachment): attachment is OpenAskAttachment {
  return "fileName" in attachment;
}

/**
 * The `request` of GET /api/company-referrals/:id/preview, as clients parse it
 * (server/referrerAskView.ts builds it; always before acceptance). Files are
 * read with the shared union so a payload that wrongly carried an open file
 * still parses, and the queue card shows only the count either way.
 */
export const referrerAskPreviewSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().nullish(),
  targetRoleUrl: z.string().nullish(),
  companyDomain: z.string().nullish(),
  ...companyIdentityFieldsSchema.shape,
  jobFunction: jobFunctionFieldSchema,
  candidateMessage: z.string().nullish(),
  attachments: z.array(referrerAskAttachmentSchema).nullish(),
});
export const referrerAskPreviewResponseSchema = z.object({ request: referrerAskPreviewSchema });
export type ReferrerAskPreview = z.infer<typeof referrerAskPreviewSchema>;
