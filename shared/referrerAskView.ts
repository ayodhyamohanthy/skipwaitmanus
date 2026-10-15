import { z } from "zod";

/*
 * How a referrer sees the files on an ask (D-019, privacy promise: "Before
 * acceptance, a Referrer sees neither the Job Seeker's name nor resume").
 *
 * Before acceptance a file is "locked": its id, type and size only, so the
 * card can say how many files wait. Never the file name (resume file names
 * routinely carry the seeker's full name) and never a link.
 *
 * After acceptance a file is "open": its name, and a link while the referrer's
 * document access is active (null once that access has ended).
 */

/** Wire value kept from the first locked shape; it means "opens after acceptance". */
export const LOCKED_ATTACHMENT_AVAILABILITY = "after_claim" as const;

export const lockedAskAttachmentSchema = z.object({
  id: z.number().int().positive(),
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
  return { id: row.id, mimeType: row.mimeType, fileSize: row.fileSize, availability: LOCKED_ATTACHMENT_AVAILABILITY };
}

export function toOpenAskAttachment(row: AskAttachmentRow, documentAccessActive: boolean): OpenAskAttachment {
  return { id: row.id, fileName: row.fileName, mimeType: row.mimeType, fileSize: row.fileSize, url: documentAccessActive ? `/api/documents/${row.id}` : null };
}

export function isOpenAskAttachment(attachment: ReferrerAskAttachment): attachment is OpenAskAttachment {
  return "fileName" in attachment;
}
