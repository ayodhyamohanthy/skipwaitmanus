import { useCallback, useEffect, useMemo, useState } from "react";
import { PauseCircle } from "lucide-react";
import { useAuth } from "@/_core/auth";
import { toast } from "sonner";
import { readApiJson } from "@/lib/apiResponse";
import { usePersistFn } from "@/hooks/usePersistFn";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type FastTrackLink = { linkCode: string; vanityAlias: string; companyDomain: string; isActive: boolean; url: string; vanityUrl: string; suggestedBioCopy: string };

/**
 * Referrer Fast-Track Link card (spec: referrer-fast-track-links-spec.md).
 *
 * States: loading (vanity link being minted) → active (Copy + LinkedIn bio
 * copy + quiet "Pause link") → paused (link no longer resolves publicly; one
 * primary "Create a new link" recovers) → error (retry, nothing else changes).
 * Pausing is reversible only by minting a fresh alias, so it sits behind a
 * confirm dialog that says exactly that.
 */
export function ReferrerFastTrackCard() {
  const { getToken, isSignedIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [link, setLink] = useState<FastTrackLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pausing, setPausing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  const reload = useCallback(() => { setPaused(false); setLoadNonce(current => current + 1); }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setLoading(true); setError("");
    void (async () => {
      try {
        const token = await fetchToken();
        const response = await fetch("/api/referrer-fast-track/me", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ link?: FastTrackLink; error?: string }>(response, "Fast-Track Link unavailable");
        if (!response.ok) throw new Error(payload.error || "Fast-Track Link unavailable");
        if (active) { setLink(payload.link || null); setPaused(payload.link ? !payload.link.isActive : false); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Fast-Track Link unavailable");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [fetchToken, isSignedIn, loadNonce]);

  const bioText = useMemo(() => link ? `${link.suggestedBioCopy}\n${link.vanityUrl}` : "", [link]);
  const copyLink = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.vanityUrl); toast("Link copied."); }
    catch { toast("Copy is unavailable in this browser."); }
  };
  const copyBio = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(bioText); toast("Bio copied — paste it in your LinkedIn bio."); }
    catch { toast("Copy is unavailable in this browser."); return; }
    window.open("https://www.linkedin.com/in/me/", "_blank", "noopener,noreferrer");
  };
  const pauseLink = async () => {
    setPausing(true); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/referrer-fast-track/me/deactivate", { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await readApiJson<{ deactivated?: boolean; error?: string }>(response, "We could not pause your Fast-Track Link");
      if (!response.ok) throw new Error(payload.error || "We could not pause your Fast-Track Link");
      setPaused(true);
      toast("Fast-Track Link paused. It no longer opens a request form.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not pause your Fast-Track Link");
    } finally { setPausing(false); }
  };

  const usable = Boolean(link) && !paused && !loading;

  return <section aria-label="Your Fast-Track Link" data-skipwait-fast-track-state={loading ? "loading" : error ? "error" : paused ? "paused" : link ? "active" : "unavailable"} className="mt-4 rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-black">Your Fast-Track Link</p><h2 className="mt-1 text-lg font-semibold tracking-[-.04em] text-black">Private referrals at {link?.companyDomain || "your company"}</h2><p className="mt-1 text-xs leading-5 text-[#505050]">{paused ? "Paused. Anyone opening the old link sees a plain “no longer active” note — never your name." : "Share in your LinkedIn bio. Your name stays hidden and you decide whether to review."}</p></div><span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-lg font-bold ${paused ? "text-[#505050]" : "text-black"}`}>{paused ? <PauseCircle className="h-5 w-5" /> : "↗"}</span></div>
    {error ? <div role="alert" className="mt-3 rounded-lg border border-[#b91c1c]/30 bg-[#b91c1c]/10 px-3 py-2.5"><p className="text-xs font-bold text-[#b91c1c]">{link ? "That didn’t go through" : "Fast-Track Link unavailable"}</p><p className="mt-0.5 text-xs leading-5 text-[#505050]">{error}{link ? " Your link is unchanged." : ""}</p><button type="button" onClick={link ? () => { void pauseLink(); } : reload} disabled={pausing || loading} className="mt-2 inline-flex min-h-9 items-center rounded-md bg-[#141414] px-3 py-1.5 text-xs font-bold text-white">{pausing || loading ? "Retrying…" : "Try again"}</button></div> : null}
    {paused ? <button type="button" onClick={reload} disabled={loading} className="mt-3 w-full rounded-lg bg-[#141414] px-3 py-2.5 text-sm font-bold text-white">{loading ? "Creating a new link…" : "Create a new link"}</button> : <>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white p-2"><code aria-live="polite" className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#505050]">{loading ? "Creating vanity link…" : link?.vanityUrl?.replace(/^https?:\/\//, "") || "Private link unavailable"}</code><button type="button" onClick={() => { void copyLink(); }} disabled={!usable} className="shrink-0 rounded-md bg-[#141414] px-3 py-2 text-xs font-bold text-white">Copy</button></div>
      {link && !loading ? <div className="mt-2 rounded-lg border border-[#e5e5e5] bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#505050]">LinkedIn bio preview</p><p className="mt-1.5 text-xs leading-5 text-[#505050]">{link.suggestedBioCopy}</p><p className="mt-1 break-all text-xs font-semibold text-black">{link.vanityUrl}</p></div> : null}
      <button type="button" onClick={() => { void copyBio(); }} disabled={!usable} className="mt-2 w-full rounded-lg border border-[#141414] bg-white px-3 py-2.5 text-sm font-bold text-black">Copy for LinkedIn bio</button>
      {link ? <AlertDialog><AlertDialogTrigger asChild><button type="button" disabled={!usable || pausing} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1.5 text-xs font-semibold text-[#505050]"><PauseCircle className="h-3.5 w-3.5" />{pausing ? "Pausing…" : "Pause link"}</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Pause your Fast-Track Link?</AlertDialogTitle><AlertDialogDescription>The link in your bio stops opening a request form right away. Requests you already received stay in your inbox. To share again later you’ll get a new link — the old address won’t come back.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep it live</AlertDialogCancel><AlertDialogAction disabled={pausing} onClick={() => void pauseLink()} className="border border-[#cfcfcf] bg-white text-black hover:bg-white">{pausing ? "Pausing…" : "Pause link"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}
    </>}
  </section>;
}
