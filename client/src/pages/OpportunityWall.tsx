import { Brand } from "@/components/Brand";
import { readReferralDraft, saveReferralDraft } from "@/lib/pwaContinuity";
import { BadgeCheck, BriefcaseBusiness, CalendarDays, ChevronRight, Clock3, MapPin, Share2, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

type Opportunity = {
  id: number;
  companyDomain: string;
  kind: "hiring_now" | "walk_in";
  roleTitle: string;
  targetRoleUrl: string | null;
  location: string | null;
  walkInAt: string | null;
  walkInEndsAt: string | null;
  createdAt: string;
};

function formatWalkIn(opportunity: Opportunity) {
  if (!opportunity.walkInAt) return "Walk-in details shared";
  const start = new Date(opportunity.walkInAt);
  const date = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (!opportunity.walkInEndsAt) return `${date} · ${time}`;
  const end = new Date(opportunity.walkInEndsAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}–${end}`;
}

export default function OpportunityWall() {
  const [, go] = useLocation();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/opportunities", { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "We could not load opportunities right now");
        if (active) setOpportunities(payload.opportunities || []);
      })
      .catch((reason: Error) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const useOpportunity = (opportunity: Opportunity) => {
    if (!opportunity.targetRoleUrl) {
      toast("This walk-in does not include a direct role link yet. You can still attend with the shared details.");
      return;
    }
    const draft = readReferralDraft();
    localStorage.setItem("bridge-target-url", opportunity.targetRoleUrl);
    saveReferralDraft({ name: draft?.name || "", targetUrl: opportunity.targetRoleUrl });
    go("/start");
  };
  const shareCompanyCoverage = async (companyDomain: string) => {
    const inviteLink = `${window.location.origin}/referrer?company=${encodeURIComponent(companyDomain)}&source=opportunity-wall`;
    const text = `A verified employee shared a hiring signal at ${companyDomain} on skipwait.me. If you work there, you can strengthen private company coverage with your work email. Your identity stays hidden from Job Seekers.\n\n${inviteLink}`;
    try {
      if (navigator.share) { await navigator.share({ title: `Private company coverage at ${companyDomain}`, text, url: inviteLink }); return; }
      await navigator.clipboard.writeText(text);
      toast("Private company invite copied. Share it only with someone who works there.");
    } catch {
      toast("Share cancelled. Nothing was sent.");
    }
  };

  return <main data-skipwait-screen="opportunity-wall" className="min-h-screen bg-slate-50 text-slate-950">
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-6"><Brand /><button onClick={() => go("/start")} className="hidden rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0847AD] sm:inline-flex">Request a referral</button></div></header>
    <section className="mx-auto max-w-6xl px-5 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-14">
      <div className="grid items-end gap-6 lg:grid-cols-[1fr_276px]"><div><p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#0B57D0]"><Sparkles className="h-3.5 w-3.5" />Verified company signals</p><h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[.98] tracking-[-.055em] sm:text-6xl">Find an opening. Keep the people behind it private.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">Browse company-level hiring and walk-in opportunities shared by verified employees. You do not need an account to explore or choose an opportunity.</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></span><div><p className="text-sm font-bold text-slate-900">Identity stays hidden</p><p className="mt-1 text-xs leading-5 text-slate-600">No employee names, emails, or public profiles appear here.</p></div></div></div></div>

      {error && <div role="alert" className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {loading ? <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(index => <div key={index} className="h-[300px] animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div> : opportunities.length ? <div className="mt-9 grid gap-4 lg:grid-cols-[minmax(0,1fr)_270px]"><div className="grid gap-4 sm:grid-cols-2">{opportunities.map(opportunity => <article key={opportunity.id} className="flex min-h-[300px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${opportunity.kind === "walk_in" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-[#0B57D0]"}`}>{opportunity.kind === "walk_in" ? <CalendarDays className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}{opportunity.kind === "walk_in" ? "Walk-in" : "Private referrals open"}</span><span className="text-[11px] font-semibold text-slate-400">Verified company signal</span></div><div className="mt-7"><p className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">{opportunity.companyDomain}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em] text-slate-950">{opportunity.roleTitle}</h2><p className="mt-3 text-sm leading-6 text-slate-600">A verified employee shared this company opportunity without exposing their identity.</p></div><div className="mt-auto pt-6"><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">{opportunity.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#0B57D0]" />{opportunity.location}</span>}<span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-[#0B57D0]" />{opportunity.kind === "walk_in" ? formatWalkIn(opportunity) : "Hiring now"}</span></div><button onClick={() => useOpportunity(opportunity)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0847AD] active:scale-[.98]">{opportunity.targetRoleUrl ? "Use this opportunity" : "Walk-in details"}<ChevronRight className="h-4 w-4" /></button><button type="button" onClick={() => { void shareCompanyCoverage(opportunity.companyDomain); }} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 active:scale-[.98]"><Share2 className="h-3.5 w-3.5 text-[#0B57D0]" />Help build private coverage</button></div></article>)}</div><aside className="rounded-2xl bg-slate-950 p-6 text-white shadow-sm"><UsersRound className="h-6 w-6 text-blue-200" /><h2 className="mt-5 text-xl font-semibold tracking-[-.03em]">Work somewhere that is hiring?</h2><p className="mt-3 text-sm leading-6 text-slate-300">Share a trusted company signal without becoming publicly searchable.</p><button onClick={() => go("/post-opportunity")} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-blue-50">Share an opportunity <ChevronRight className="h-4 w-4" /></button><div className="mt-6 border-t border-white/15 pt-5 text-xs leading-5 text-slate-400">Work-email verification happens only when you choose to participate. It never publishes your identity.</div></aside></div> : <section className="mt-9 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm sm:p-12"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-[#0B57D0]"><BriefcaseBusiness className="h-6 w-6" /></span><h2 className="mt-5 text-2xl font-semibold tracking-[-.035em]">No shared opportunities yet.</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">If you already have a direct employer job link, start a private referral request. If you work somewhere that is hiring, share the first company signal.</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><button onClick={() => go("/start")} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0847AD]">Request a referral</button><button onClick={() => go("/post-opportunity")} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50">Share an opportunity</button></div></section>}
    </section>
  </main>;
}
