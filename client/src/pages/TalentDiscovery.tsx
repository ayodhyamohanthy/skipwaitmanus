import { ArrowLeft, BadgeCheck, Lock, Search, Send, Unlock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { AccountMenu } from "@/components/AccountMenu";
import { Brand } from "@/components/Brand";
import { readApiJson } from "@/lib/apiResponse";

const UNLOCK_CREDIT_COST = 5;
type TalentRow = { displayRef: string; headline: string | null; location: string | null; skills: string[]; isUnlocked: boolean };
type UnlockedProfile = { displayRef: string; headline: string | null; location: string | null; skills: string[]; experience: string | null; expertise: string | null };

export default function TalentDiscovery() {
  const [, go] = useLocation();
  const [talent, setTalent] = useState<TalentRow[]>([]);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [openedProfile, setOpenedProfile] = useState<UnlockedProfile | null>(null);
  const [introSentTo, setIntroSentTo] = useState<string | null>(null);

  const loadTalent = async (nextQuery = query, nextLocation = location) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams(); if (nextQuery.trim()) params.set("query", nextQuery.trim()); if (nextLocation.trim()) params.set("location", nextLocation.trim());
      const response = await fetch(`/api/employer/talent${params.size ? `?${params.toString()}` : ""}`, { credentials: "include" });
      const payload = await readApiJson<{ talent?: TalentRow[]; error?: string }>(response, "We could not load the talent list");
      if (!response.ok) throw new Error(payload.error || "We could not load the talent list");
      setTalent(payload.talent || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load the talent list"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [talentResponse, accountResponse] = await Promise.all([fetch("/api/employer/talent", { credentials: "include" }), fetch("/api/employer/account", { credentials: "include" })]);
        const talentPayload = await readApiJson<{ talent?: TalentRow[]; error?: string }>(talentResponse, "We could not load the talent list");
        if (!talentResponse.ok) throw new Error(talentPayload.error || "Employer access is required");
        const accountPayload = await readApiJson<{ account?: { credits: number } | null }>(accountResponse, "Employer account unavailable");
        if (active) { setTalent(talentPayload.talent || []); setCredits(accountPayload.account?.credits ?? null); }
      } catch (loadError) { if (active) setError(loadError instanceof Error ? loadError.message : "We could not load the talent list"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const unlockTalent = async (row: TalentRow) => {
    setUnlockingId(row.displayRef);
    // Optimistic: decrement local credits and flip the row immediately.
    const previousCredits = credits;
    const previousUnlocked = row.isUnlocked;
    setCredits(current => (current === null ? current : Math.max(0, current - UNLOCK_CREDIT_COST)));
    setTalent(current => current.map(item => item.displayRef === row.displayRef ? { ...item, isUnlocked: true } : item));
    try {
      const response = await fetch(`/api/employer/talent/${encodeURIComponent(row.displayRef)}/unlock`, { method: "POST", credentials: "include" });
      const payload = await readApiJson<{ unlocked?: boolean; remaining?: number; error?: string; credits?: number }>(response, "We could not unlock this profile");
      if (response.status === 402) {
        setCredits(previousCredits);
        setTalent(current => current.map(item => item.displayRef === row.displayRef ? { ...item, isUnlocked: previousUnlocked } : item));
        toast(`${payload.error || "Not enough unlock credits"} — buy credits to continue`);
        go("/employer/billing");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "We could not unlock this profile");
      if (typeof payload.remaining === "number") setCredits(payload.remaining);
      toast(`${row.displayRef} unlocked. They control whether to respond.`);
    } catch (unlockError) {
      setCredits(previousCredits);
      setTalent(current => current.map(item => item.displayRef === row.displayRef ? { ...item, isUnlocked: previousUnlocked } : item));
      toast(unlockError instanceof Error ? unlockError.message : "We could not unlock this profile");
    } finally { setUnlockingId(null); }
  };

  const openProfile = async (row: TalentRow) => {
    try {
      const response = await fetch(`/api/employer/talent/${encodeURIComponent(row.displayRef)}`, { credentials: "include" });
      const payload = await readApiJson<{ profile?: UnlockedProfile; error?: string }>(response, "We could not load this profile");
      if (response.status === 402) { toast("Unlock this profile with credits first"); return; }
      if (!response.ok || !payload.profile) throw new Error(payload.error || "We could not load this profile");
      setOpenedProfile(payload.profile);
    } catch (openError) { toast(openError instanceof Error ? openError.message : "We could not load this profile"); }
  };

  const sendIntroRequest = async (row: TalentRow) => {
    // The unlock already notified the seeker; this re-pings them with an
    // explicit intro request through the platform (never a direct email).
    try {
      const response = await fetch(`/api/employer/talent/${encodeURIComponent(row.displayRef)}/intro`, { method: "POST", credentials: "include" });
      if (response.ok || response.status === 409) setIntroSentTo(row.displayRef);
      else toast("We could not send the intro request");
    } catch { toast("We could not send the intro request"); }
  };

  const creditLabel = useMemo(() => (credits === null ? "—" : String(credits)), [credits]);

  return <main data-skipwait-screen="talent-discovery" className="min-h-dvh bg-[#F5F4EF] px-5 py-4 text-[#191713]"><div className="mx-auto flex min-h-dvh max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between"><button type="button" onClick={() => go("/employer")} className="inline-flex items-center gap-1 text-sm font-semibold text-[#625D52]"><ArrowLeft className="h-4 w-4" />Back</button><AccountMenu /></header><section className="mt-4 shrink-0"><h1 className="text-[1.65rem] font-semibold leading-[.98] tracking-[-.02em]">Talent discovery.</h1><p className="mt-2 text-sm leading-6 text-[#625D52]">Anonymized, opt-in seekers only. Every profile stays hidden until the person chooses to respond.</p><form onSubmit={event => { event.preventDefault(); void loadTalent(); }} className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#625D52]" /><input aria-label="Search talent" value={query} onChange={event => setQuery(event.target.value)} placeholder="Skill, headline, or keyword" className="w-full rounded-lg border border-[#E2DDD2] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#191713]" /></label><input aria-label="Filter by location" value={location} onChange={event => setLocation(event.target.value)} placeholder="Location" className="flex-1 rounded-lg border border-[#E2DDD2] px-3 py-2.5 text-sm outline-none focus:border-[#191713]" /><button type="submit" className="rounded-lg bg-[#191713] px-4 py-2.5 text-sm font-semibold text-white">Search</button></form><p className="mt-3 text-xs font-semibold text-[#625D52]">Credits: <strong className="text-[#2E2B25]">{creditLabel}</strong> · Unlock costs {UNLOCK_CREDIT_COST} · <Link href="/employer/billing" className="text-[#191713]">Buy credits</Link></p></section>{error ? <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : loading ? <div className="mt-5 grid gap-3">{[0, 1, 2].map(index => <div key={index} className="h-32 animate-pulse rounded-xl border border-[#E2DDD2] bg-white" />)}</div> : !talent.length ? <div className="mt-5 rounded-xl border border-dashed border-[#E2DDD2] p-10 text-center"><p className="text-sm font-bold text-[#2E2B25]">No opt-in talent matches yet.</p><p className="mt-1 text-sm text-[#625D52]">Try a broader skill, or check back as more seekers opt in.</p></div> : <ul className="mt-5 grid gap-3 pb-8">{talent.map(row => <li key={row.displayRef} className="rounded-xl border border-[#E2DDD2] bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-sm font-bold text-[#191713]">{row.displayRef}</h2><p className="mt-1 truncate text-xs text-[#625D52]">{row.headline || "Skipwait member"}</p></div>{row.isUnlocked ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />Unlocked</span> : <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#ECE8DD] px-2.5 py-1 text-[11px] font-bold text-[#625D52]"><Lock className="h-3.5 w-3.5" />Locked</span>}</div>{row.skills.length ? <div className="mt-3 flex flex-wrap gap-1.5">{row.skills.map(skill => <span key={skill} className="rounded-full bg-[#ECE8DD] px-2.5 py-1 text-[11px] font-semibold text-[#3F3B33]">{skill}</span>)}</div> : null}{row.location ? <p className="mt-3 text-xs text-[#625D52]">{row.location}</p> : null}{openedProfile && openedProfile.displayRef === row.displayRef ? <div className="mt-3 rounded-lg border border-[#E2DDD2] bg-[#F5F4EF] p-3 text-xs leading-5 text-[#3F3B33]">{openedProfile.experience ? <p><strong>Experience:</strong> {openedProfile.experience}</p> : null}{openedProfile.expertise ? <p className="mt-1"><strong>Expertise:</strong> {openedProfile.expertise}</p> : null}{!openedProfile.experience && !openedProfile.expertise ? <p>No additional details shared yet.</p> : null}</div> : null}<div className="mt-4 flex gap-2">{row.isUnlocked ? <><button type="button" onClick={() => void openProfile(row)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[#D5CFC0] bg-white px-3 py-2.5 text-xs font-bold text-[#191713] hover:border-[#BFDBFE] hover:bg-[#E8F0FE]/50">View profile</button><button type="button" disabled={introSentTo === row.displayRef} onClick={() => void sendIntroRequest(row)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#191713] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60"><Send className="h-3.5 w-3.5" />{introSentTo === row.displayRef ? "Intro sent" : "Send intro request"}</button></> : <button type="button" disabled={unlockingId === row.displayRef} onClick={() => void unlockTalent(row)} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-[#191713] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60"><Unlock className="h-3.5 w-3.5" />Unlock · {UNLOCK_CREDIT_COST} credits</button>}</div></li>)}</ul>}</div></main>;
}
