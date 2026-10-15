import { useEffect, useState } from "react";
import type { AskDraft, AskDraftInput } from "@shared/askDraft";

type TokenFn = () => Promise<string | null>;
const headers = async (getToken: TokenFn, json = false): Promise<Record<string, string>> => {
  const token = await getToken();
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

/** Save (replace) the caller's draft. Throws on any failure so the dialog can say so. */
export async function saveAskDraftRemote(input: AskDraftInput, getToken: TokenFn): Promise<AskDraft> {
  const response = await fetch("/api/ask-drafts", { method: "PUT", credentials: "include", headers: await headers(getToken, true), body: JSON.stringify(input) });
  if (!response.ok) throw new Error("We could not save your draft. Try again.");
  const payload = (await response.json()) as { draft?: AskDraft };
  if (!payload.draft) throw new Error("We could not save your draft. Try again.");
  return payload.draft;
}

/** Best effort: a leftover draft only prefills an empty composer. */
export async function discardAskDraftRemote(getToken: TokenFn): Promise<void> {
  try { await fetch("/api/ask-drafts", { method: "DELETE", credentials: "include", headers: await headers(getToken) }); } catch { /* ignore */ }
}

const isDraft = (value: unknown): value is AskDraft => {
  const v = value as Partial<AskDraft> | null;
  return Boolean(v) && typeof v?.companySlug === "string" && typeof v.targetRoleUrl === "string" && typeof v.note === "string";
};

/** The caller's saved draft, or null while loading, signed out, or on any failure. */
export function useAskDraft(signedIn: boolean, getToken: TokenFn): AskDraft | null {
  const [draft, setDraft] = useState<AskDraft | null>(null);
  useEffect(() => {
    if (!signedIn) { setDraft(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/ask-drafts", { credentials: "include", headers: await headers(getToken) });
        if (!response.ok) return;
        const payload = (await response.json()) as { draft?: unknown };
        if (!cancelled && isDraft(payload.draft)) setDraft(payload.draft);
      } catch { /* the sessionStorage hand-off still works */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);
  return draft;
}
