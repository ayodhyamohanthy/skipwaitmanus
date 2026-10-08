import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";

type PublicShareCard = { companyDomain: string; status: "accepted"; inviteCode?: string };

export default function ShareCard() {
  const [, params] = useRoute("/share-card/:token");
  const [reloadKey, setReloadKey] = useState(0);
  const token = params?.token ?? "";
  const cardQuery = useQuery({
    queryKey: ["referral-share-card", token, reloadKey],
    enabled: Boolean(token),
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch(`/api/referral-share-cards/public/${encodeURIComponent(token)}`, { credentials: "omit" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.card) throw new Error("unavailable");
      return payload.card as PublicShareCard;
    },
  });
  const card = cardQuery.data ?? null;
  const unavailable = !token || (cardQuery.isError && !cardQuery.isFetching);
  const retry = () => { setReloadKey(key => key + 1); };
  const companyDomain = card?.companyDomain ?? "the company";
  const joinHref = card?.inviteCode ? `/start?invite=${encodeURIComponent(card.inviteCode)}` : "/start";
  return <main data-skipwait-screen="share-card" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">{!card && !unavailable ? <div role="status" aria-busy="true" aria-live="polite" className="h-44 animate-pulse rounded-xl bg-white" /> : unavailable ? <div role="alert" className="text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#f0f0f0] text-[#505050]"><ShieldCheck className="h-5 w-5" /></span><h1 className="mt-5 text-2xl font-semibold tracking-[-.04em]">Share card unavailable</h1><p className="mt-2 text-sm leading-6 text-[#505050]">This voluntary milestone card may have been removed. Nothing was changed.</p><button type="button" onClick={retry} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[#e5e5e5] bg-white px-4 py-2.5 text-sm font-bold text-black">Try again</button></div> : <><span className="grid h-12 w-12 place-items-center rounded-xl bg-[#f5f5f5] text-black"><CheckCircle2 className="h-6 w-6" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-black">Skipwait.me · private referral</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.02em]">Accepted at {companyDomain}</h1><p className="mt-5 text-sm leading-6 text-[#505050]">A private referral request was accepted at <strong>{companyDomain}</strong>.</p><p className="mt-4 rounded-xl bg-[#f5f5f5] px-4 py-3 text-sm font-semibold leading-5 text-black">Shared voluntarily. No hiring outcome is implied.</p><Link href={joinHref} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#141414] px-5 py-3.5 text-sm font-bold text-white">Get your own referral <ArrowRight className="h-4 w-4" /></Link></>}</section></div></main>;
}
