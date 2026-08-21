import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useRoute } from "wouter";

type PublicShareCard = { companyDomain: string; status: "accepted" };

export default function ShareCard() {
  const [, params] = useRoute("/share-card/:token");
  const [card, setCard] = useState<PublicShareCard | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const token = params?.token;
    if (!token) { setUnavailable(true); return; }
    let active = true;
    void fetch(`/api/referral-share-cards/public/${encodeURIComponent(token)}`, { credentials: "omit" }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.card) throw new Error("unavailable");
      if (active) setCard(payload.card as PublicShareCard);
    }).catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, [params?.token]);
  const companyDomain = card?.companyDomain ?? "the company";
  return <main data-skipwait-screen="share-card" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">{!card && !unavailable ? <div className="h-44 animate-pulse rounded-xl bg-slate-50" /> : unavailable ? <div className="text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500"><ShieldCheck className="h-5 w-5" /></span><h1 className="mt-5 text-2xl font-semibold tracking-[-.04em]">Share card unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-600">This voluntary milestone card may have been removed.</p></div> : <><span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-[#0B57D0]"><CheckCircle2 className="h-6 w-6" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Skipwait.me · private referral</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Accepted at {companyDomain}</h1><p className="mt-5 text-sm leading-6 text-slate-600">A private referral request was accepted at <strong>{companyDomain}</strong>.</p><p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold leading-5 text-blue-900">Shared voluntarily. No hiring outcome is implied.</p></>}</section></div></main>;
}
