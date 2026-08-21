import { useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { toast } from "sonner";
import { readApiJson } from "@/lib/apiResponse";

type FastTrackLink = { linkCode: string; vanityAlias: string; companyDomain: string; isActive: boolean; url: string; vanityUrl: string; suggestedBioCopy: string };

export function ReferrerFastTrackCard() {
  const { getToken, isSignedIn } = useClerkAuth();
  const [link, setLink] = useState<FastTrackLink | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/referrer-fast-track/me", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ link?: FastTrackLink; error?: string }>(response, "Fast-Track Link unavailable");
        if (!response.ok) throw new Error(payload.error || "Fast-Track Link unavailable");
        if (active) setLink(payload.link || null);
      } catch (error) {
        if (active) toast(error instanceof Error ? error.message : "Fast-Track Link unavailable");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  const shareText = useMemo(() => link ? `${link.suggestedBioCopy}\n\n${link.vanityUrl}` : "", [link]);
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(shareText); toast("Fast-Track Link copied."); }
    catch { toast("Copy is unavailable in this browser."); }
  };
  const shareLinkedIn = () => {
    if (!link) return;
    void copy();
    window.open("https://www.linkedin.com/in/me/", "_blank", "noopener,noreferrer");
  };

  return <section aria-label="Your Fast-Track Link" className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#0B57D0]">Your Fast-Track Link</p><h2 className="mt-1 text-lg font-semibold tracking-[-.04em] text-slate-950">Private referrals at {link?.companyDomain || "your company"}</h2><p className="mt-1 text-xs leading-5 text-slate-600">Share in your LinkedIn bio. Your name stays hidden and you decide whether to review.</p></div><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-lg font-bold text-[#0B57D0]">↗</span></div>
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-100 bg-white p-2"><code className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{loading ? "Creating vanity link…" : link?.vanityUrl?.replace(/^https?:\/\//, "") || "Private link unavailable"}</code><button type="button" onClick={() => { void copy(); }} disabled={!link} className="shrink-0 rounded-md bg-[#0B57D0] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Copy</button></div>
    <button type="button" onClick={shareLinkedIn} disabled={!link} className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm font-bold text-[#0B57D0] disabled:opacity-40">Copy for LinkedIn bio</button>
  </section>;
}
