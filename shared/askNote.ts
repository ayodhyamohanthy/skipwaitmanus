import { z } from "zod";

/*
 * The seeker's note on an ask (POST /api/company-referrals), stored as
 * referralRequests.personalPitch and shown back to the seeker as `pitch` on
 * GET /api/company-referrals/mine.
 *
 * The app sends the note as `candidateMessage`. `personalPitch` (the stored
 * field's name) is accepted as well, so an API caller using that name never
 * loses the note to the placeholder. A note that is not text, or two different
 * notes in one ask, is refused with a plain message instead of being dropped.
 */

/** Longest note stored; longer input is cut to this length (the app caps it lower). */
export const ASK_NOTE_MAX_LENGTH = 2000;

/** Stored in place of a note when the seeker sends none. */
export const NO_PERSONAL_NOTE_TEXT = "No personal note was included with this referral request.";

export const ASK_NOTE_NOT_TEXT_ERROR = "Your note must be plain text.";
export const ASK_NOTE_CONFLICT_ERROR = "Your note was sent twice with different text. Send it once.";

const noteFieldSchema = z.string().nullish();

/** Only the note fields; the rest of the ask body is validated by the route. */
export const askNoteInputSchema = z.object({ candidateMessage: noteFieldSchema, personalPitch: noteFieldSchema });

export type AskNoteResolution =
  | { readonly ok: true; readonly personalPitch: string }
  | { readonly ok: false; readonly error: string };

function cleanNote(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, ASK_NOTE_MAX_LENGTH) : null;
}

/** Resolve the note to store from an ask body that already passed the route's shape checks. */
export function resolveAskNote(body: object): AskNoteResolution {
  const parsed = askNoteInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: ASK_NOTE_NOT_TEXT_ERROR };
  const fromCandidateMessage = cleanNote(parsed.data.candidateMessage);
  const fromPersonalPitch = cleanNote(parsed.data.personalPitch);
  if (fromCandidateMessage && fromPersonalPitch && fromCandidateMessage !== fromPersonalPitch) return { ok: false, error: ASK_NOTE_CONFLICT_ERROR };
  return { ok: true, personalPitch: fromCandidateMessage ?? fromPersonalPitch ?? NO_PERSONAL_NOTE_TEXT };
}
