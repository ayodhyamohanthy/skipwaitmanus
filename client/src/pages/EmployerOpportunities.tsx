import { ArrowLeft, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { AccountMenu } from "@/components/AccountMenu";
import { Brand } from "@/components/Brand";
import { readApiJson } from "@/lib/apiResponse";

type Opportunity = { id: number; companyDomain: string; kind: "hiring_now" | "walk_in"; roleTitle: string; location: string | null; compensation: string | null; isActive: boolean; sponsoredTier: "featured" | "spotlight" | null; sponsoredUntil: string | null; isSponsored: boolean };
type Tier = "featured" | "spotlight";
const SPONSOR_TIERS: Array<{ id: Tier; label: string; days: number; cost: number }> = [{ id: "featured", label: "Featured", days: 7, cost: 10 }, { id: "spotlight", label: "Spotlight", days: 30, cost: 25 }];

export default function EmployerOpportunities() {
  const [, go] = useLocation();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sponsorFor, setSponsorFor] = useState<Opportunity | null>(null);
  const [tier, setTier] = useState<Tier>("featured");
  const [sponsoring, setSponsoring] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/employer/opportunities", { credentials: "include" });
      const payload = await readApiJson<{ opportunities?: Opportunity[]; error?: string }>(response, "We could not load your opportunities");
      if (!response.ok) throw new Error(payload.error || "We could not load your opportunities");
      setOpportunities(payload.opportunities || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load your opportunities"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const sponsor = async () => {
    if (!sponsorFor) return;
    setSponsoring(true);
    try {
      const response = await fetch(`/api/employer/opportunities/${sponsorFor.id}/sponsor`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier }) });
      const payload = await readApiJson<{ sponsorship?: { tier: Tier; creditsSpent: number }; error?: string }>(response, "We could not sponsor this role");
      if (!response.ok) throw new Error(payload.error || "We could not sponsor this role");
      toast(`Sponsored as ${payload.sponsorship?.tier ?? tier}.`);
      setSponsorFor(null);
      void load();
    } catch (sponsorError) { toast(sponsorError instanceof Error ? sponsorError.message : "We could not sponsor this role"); }
    finally { setSponsoring(false); }
  };

  const selectedTier = SPONSOR_TIERS.find(item => item.id === tier) ?? SPONSOR_TIERS[0];

  return <main data-skipwait-screen="employer-opportunities" className="min-h-dvh bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex min-h-dvh max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between"><button type="button" onClick={() => go("/employer")} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button><AccountMenu /></header><section className="mt-4 shrink-0"><h1 className="text-[1.65rem] font-semibold leading-[.98] tracking-[-.055em]">Sponsor a role.</h1><p className="mt-2 text-sm leading-6 text-slate-600">Sponsored roles sit above organic posts in seeker feeds until the window ends.</p></section>{error ? <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : loading ? <div className="mt-5 grid gap-3">{[0, 1].map(index => <div key={index} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />)}</div> : !opportunities.length ? <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-10 text-center"><p className="text-sm font-bold text-slate-800">No opportunities yet.</p><p className="mt-1 text-sm text-slate-600">Verify a work email and post an opening first — sponsorship is one tap after that.</p></div> : <ul className="mt-5 grid gap-3 pb-8">{opportunities.map(opportunity => <li key={opportunity.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-sm font-bold text-slate-900">{opportunity.roleTitle}</h2><p className="mt-1 truncate text-[11px] text-[#78716c]">{[opportunity.companyDomain, opportunity.location].filter(Boolean).join(" · ")}</p></div>{opportunity.isSponsored ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800"><Sparkles className="h-3.5 w-3.5" />Sponsored</span> : null}</div><div className="mt-3"><button type="button" onClick={() => { setSponsorFor(opportunity); setTier(opportunity.sponsoredTier ?? "featured"); }} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-[#0B57D0] px-3 py-2.5 text-xs font-bold text-white"><Sparkles className="h-3.5 w-3.5" />{opportunity.isSponsored ? "Extend sponsorship" : "Sponsor this role"}</button></div></li>)}</ul>}{sponsorFor && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center"><div role="dialog" aria-modal="true" aria-label={`Sponsor ${sponsorFor.roleTitle}`} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-[-.03em]">Sponsor {sponsorFor.roleTitle}</h2><p className="mt-1 text-xs text-slate-600">{sponsorFor.companyDomain}</p></div><button type="button" aria-label="Close sponsor dialog" onClick={() => setSponsorFor(null)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500"><X className="h-4 w-4" /></button></div><div className="mt-4 grid gap-2">{SPONSOR_TIERS.map(item => <button key={item.id} type="button" aria-pressed={tier === item.id} onClick={() => setTier(item.id)} className={`rounded-xl border p-3.5 text-left ${tier === item.id ? "border-[#0B57D0] bg-blue-50" : "border-slate-200 bg-white"}`}><span className="flex items-center justify-between"><span className="text-sm font-bold text-slate-900">{item.label} · {item.days} days</span><span className="text-xs font-bold text-[#0B57D0]">{item.cost} credits</span></span></button>)}</div><button type="button" disabled={sponsoring} onClick={() => void sponsor()} className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-[#0B57D0] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{sponsoring ? "Sponsoring…" : `Sponsor for ${selectedTier.cost} credits`}</button><p className="mt-2 text-center text-[11px] text-slate-500">Credits are deducted immediately. The window runs {selectedTier.days} days.</p></div></div>}</div></main>;
}
