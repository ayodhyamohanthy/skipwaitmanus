import { z } from "zod";

/**
 * Hand-off from a company door's request dialog (/explore/:slug) into the real
 * ask composer (/ask). Nothing is sent from the dialog: it only carries the job
 * link and fit note forward so the seeker reviews, attaches a resume and sends
 * from /ask. Tab-scoped (sessionStorage) so a fit note never outlives the
 * browsing session, short-lived, and validated on read because browser storage
 * is an untrusted boundary.
 */
export const ASK_PREFILL_KEY = "skipwait-ask-prefill";
export const ASK_NOTE_LIMIT = 600;
export const ASK_PREFILL_TTL_MS = 60 * 60 * 1000;

export const askPrefillSchema = z.strictObject({
  companySlug: z.string().min(1).max(64),
  targetRoleUrl: z.string().min(1).max(2048),
  note: z.string().max(ASK_NOTE_LIMIT),
  savedAt: z.number().int().nonnegative(),
});

export type AskPrefill = z.infer<typeof askPrefillSchema>;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function sessionStore(): StorageLike | null {
  // Privacy modes can block storage entirely and throw on mere access.
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}

export function saveAskPrefill(input: Omit<AskPrefill, "savedAt">, storage: StorageLike | null = sessionStore(), now: number = Date.now()): boolean {
  const parsed = askPrefillSchema.safeParse({ companySlug: input.companySlug, targetRoleUrl: input.targetRoleUrl.trim(), note: input.note.trim().slice(0, ASK_NOTE_LIMIT), savedAt: now });
  if (!parsed.success || !storage) return false;
  try { storage.setItem(ASK_PREFILL_KEY, JSON.stringify(parsed.data)); return true; } catch { return false; }
}

export function readAskPrefill(storage: StorageLike | null = sessionStore(), now: number = Date.now()): AskPrefill | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ASK_PREFILL_KEY);
    if (!raw) return null;
    const parsed = askPrefillSchema.safeParse(JSON.parse(raw));
    if (parsed.success && now - parsed.data.savedAt <= ASK_PREFILL_TTL_MS) return parsed.data;
    storage.removeItem(ASK_PREFILL_KEY);
    return null;
  } catch {
    return null;
  }
}

export function clearAskPrefill(storage: StorageLike | null = sessionStore()): void {
  try { storage?.removeItem(ASK_PREFILL_KEY); } catch { /* persistence is best-effort */ }
}
