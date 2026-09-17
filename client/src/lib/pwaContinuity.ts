export type ReferralDraft = { name: string; targetUrl: string; updatedAt: number };
export type CredentialCapability = { get?: unknown; preventSilentAccess?: unknown } | null | undefined;
export type SessionEventTarget = { addEventListener: (event: string, listener: () => void) => void; removeEventListener: (event: string, listener: () => void) => void };
export type VisibilityDocument = SessionEventTarget & { visibilityState: string };
export type CredentialGetter = { get?: (options?: CredentialRequestOptions) => Promise<unknown> } | null | undefined;

const DRAFT_KEY = "skipwait-pwa-referral-draft";
const SESSION_KEY = "skipwait-pwa-session-verified-at";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(): StorageLike | null {
  // Some privacy modes block storage entirely and throw on mere access.
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export function readReferralDraft(storage: StorageLike | null = getStorage()): ReferralDraft | null {
  if (!storage) return null;
  try {
    const draft = JSON.parse(storage.getItem(DRAFT_KEY) || "null") as Partial<ReferralDraft> | null;
    const targetUrl = typeof draft?.targetUrl === "string" ? draft.targetUrl : "";
    const name = typeof draft?.name === "string" ? draft.name : null;
    const updatedAt = typeof draft?.updatedAt === "number" && Number.isFinite(draft.updatedAt) ? draft.updatedAt : undefined;
    if (!targetUrl.trim() || name === null || updatedAt === undefined) return null;
    return { name, targetUrl, updatedAt };
  } catch {
    return null;
  }
}

export function saveReferralDraft(draft: Omit<ReferralDraft, "updatedAt">, storage: StorageLike | null = getStorage()): void {
  if (!storage) return;
  try { storage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: Date.now() })); } catch { /* persistence is best-effort */ }
}

export function clearReferralDraft(storage: StorageLike | null = getStorage()): void {
  try { storage?.removeItem(DRAFT_KEY); } catch { /* persistence is best-effort */ }
}

export function markSecureSessionVerified(storage: StorageLike | null = getStorage()): void {
  try { storage?.setItem(SESSION_KEY, String(Date.now())); } catch { /* persistence is best-effort */ }
}

export function readSecureSessionVerifiedAt(storage: StorageLike | null = getStorage()): number | null {
  if (!storage) return null;
  try {
    const value = Number(storage.getItem(SESSION_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch { return null; }
}

export function supportsBrowserCredentialMediation(credentials: CredentialCapability): boolean {
  return Boolean(credentials && (typeof credentials.get === "function" || typeof credentials.preventSilentAccess === "function"));
}

export async function requestSavedDeviceCredential(credentials: CredentialGetter): Promise<"credential" | "empty" | "unsupported" | "fallback"> {
  if (!credentials?.get) return "unsupported";
  try {
    const getLegacyCredential = credentials.get as (this: unknown, options: { mediation: "optional"; password: true }) => Promise<unknown>;
    const credential = await getLegacyCredential.call(credentials, { mediation: "optional", password: true });
    return credential ? "credential" : "empty";
  } catch {
    return "fallback";
  }
}

export function registerSecureSessionRestoration(refresh: () => void, targetWindow: SessionEventTarget, targetDocument: VisibilityDocument): () => void {
  const restore = () => refresh();
  const restoreWhenVisible = () => { if (targetDocument.visibilityState === "visible") restore(); };
  targetWindow.addEventListener("focus", restore);
  targetWindow.addEventListener("online", restore);
  targetDocument.addEventListener("visibilitychange", restoreWhenVisible);
  return () => {
    targetWindow.removeEventListener("focus", restore);
    targetWindow.removeEventListener("online", restore);
    targetDocument.removeEventListener("visibilitychange", restoreWhenVisible);
  };
}
