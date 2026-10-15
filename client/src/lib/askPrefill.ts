import { z } from "zod";
import { REFERRER_LINK_PARAMS, referrerLinkSchema, type ReferrerLink } from "@shared/referrerLink";

/**
 * The one hand-off into the ask composer (/ask). Entry points write it and
 * /ask reads it; nothing is sent until the seeker presses Send there.
 * - A company door's request dialog (/explore/:slug): company, job link, fit note.
 * - /start (reached from /fast/:code, /refer/:company/:alias, /jobs and /wall):
 *   the job link and, when the seeker came through a referrer's personal link,
 *   that link, so the ask goes to that referrer (D-017).
 * Tab-scoped (sessionStorage) so it survives the same-tab sign-in round trip but
 * never outlives the browsing session, short-lived, cleared on send and on
 * sign-out, and validated on read because browser storage is untrusted.
 * The referrer link also travels in the /ask URL (REFERRER_LINK_PARAMS), which
 * sign-in keeps in its return address; the URL wins over storage.
 */
export const ASK_PREFILL_KEY = "skipwait-ask-prefill";
export const ASK_NOTE_LIMIT = 600;
export const ASK_PREFILL_TTL_MS = 60 * 60 * 1000;

export const askPrefillSchema = z.strictObject({
  companySlug: z.string().min(1).max(64).optional(),
  targetRoleUrl: z.string().min(1).max(2048).optional(),
  note: z.string().max(ASK_NOTE_LIMIT).optional(),
  referrerLink: referrerLinkSchema.optional(),
  savedAt: z.number().int().nonnegative(),
}).refine(prefill => Boolean(prefill.companySlug || prefill.targetRoleUrl || prefill.referrerLink), { message: "An ask hand-off needs a company, a job link or a referrer link" });

export type AskPrefill = z.infer<typeof askPrefillSchema>;
export type AskPrefillInput = Omit<AskPrefill, "savedAt">;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function sessionStore(): StorageLike | null {
  // Privacy modes can block storage entirely and throw on mere access.
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}

export function saveAskPrefill(input: AskPrefillInput, storage: StorageLike | null = sessionStore(), now: number = Date.now()): boolean {
  const candidate = {
    ...(input.companySlug !== undefined ? { companySlug: input.companySlug } : {}),
    ...(input.targetRoleUrl !== undefined ? { targetRoleUrl: input.targetRoleUrl.trim() } : {}),
    ...(input.note !== undefined ? { note: input.note.trim().slice(0, ASK_NOTE_LIMIT) } : {}),
    ...(input.referrerLink ? { referrerLink: input.referrerLink } : {}),
    savedAt: now,
  };
  const parsed = askPrefillSchema.safeParse(candidate);
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

/** The referrer link in a query string: ?fast=<code>, else ?referCompany=<slug>&referAlias=<alias>. */
export function referrerLinkFromSearch(search: string): ReferrerLink | null {
  const params = new URLSearchParams(search);
  const code = params.get(REFERRER_LINK_PARAMS.code);
  const candidate = code !== null
    ? { fastTrackCode: code }
    : { fastTrackCompanySlug: params.get(REFERRER_LINK_PARAMS.companySlug), fastTrackAlias: params.get(REFERRER_LINK_PARAMS.alias) };
  return parseReferrerLink(candidate);
}

/** "?fast=…" or "?referCompany=…&referAlias=…" for an entry page to hand the link on. */
export function referrerLinkSearch(link: ReferrerLink): string {
  const params = "fastTrackCode" in link
    ? new URLSearchParams({ [REFERRER_LINK_PARAMS.code]: link.fastTrackCode })
    : new URLSearchParams({ [REFERRER_LINK_PARAMS.companySlug]: link.fastTrackCompanySlug, [REFERRER_LINK_PARAMS.alias]: link.fastTrackAlias });
  return `?${params.toString()}`;
}

/** A referrer link from route parameters (/fast/:code, /refer/:company/:alias), or null. */
export function parseReferrerLink(candidate: unknown): ReferrerLink | null {
  const parsed = referrerLinkSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** `path` with the referrer link's query, or just `path` when there is none. */
export function withReferrerLink(path: string, link: ReferrerLink | null): string {
  return link ? `${path}${referrerLinkSearch(link)}` : path;
}

/** The query string without the referrer-link parameters (other parameters kept). */
export function searchWithoutReferrerLink(search: string): string {
  const params = new URLSearchParams(search);
  for (const name of Object.values(REFERRER_LINK_PARAMS)) params.delete(name);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/** What /ask starts from: the referrer link in its URL first, then the stored hand-off. */
export function resolveAskPrefill(search: string, storage: StorageLike | null = sessionStore(), now: number = Date.now()): AskPrefill | null {
  const stored = readAskPrefill(storage, now);
  const fromUrl = referrerLinkFromSearch(search);
  if (!fromUrl) return stored;
  return { ...(stored ?? {}), referrerLink: fromUrl, savedAt: stored?.savedAt ?? now };
}

/** The seeker chose to send to the company instead: keep the rest of the hand-off, forget the link. */
export function forgetReferrerLink(storage: StorageLike | null = sessionStore(), now: number = Date.now()): void {
  const stored = readAskPrefill(storage, now);
  if (!stored?.referrerLink) return;
  const rest: AskPrefillInput = { companySlug: stored.companySlug, targetRoleUrl: stored.targetRoleUrl, note: stored.note };
  if (!saveAskPrefill(rest, storage, stored.savedAt)) clearAskPrefill(storage);
}
