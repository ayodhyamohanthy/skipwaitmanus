import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Brand } from "@/components/Brand";
import { Menu } from "lucide-react";
import { SignedIn } from "@/_core/auth";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export default function Home() {
  const [, go] = useLocation();
  const [acceptedReferrals, setAcceptedReferrals] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const loadImpact = async () => {
      try {
        const response = await fetch("/api/referral-impact"); const payload = await response.json() as { acceptedReferrals?: unknown };
        if (active && response.ok && typeof payload.acceptedReferrals === "number") setAcceptedReferrals(Math.max(0, Math.floor(payload.acceptedReferrals)));
      } catch { if (active) setAcceptedReferrals(null); }
    };
    void loadImpact(); const timer = window.setInterval(() => { void loadImpact(); }, 120_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return <main className="min-h-dvh bg-[#F5F4EF] text-[#191713] sm:min-h-screen">
    <header className="bg-[#191713] text-[#F5F4EF]"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:h-auto sm:px-6 sm:py-5"><Brand dark /><div className="hidden items-center gap-7 sm:flex"><button onClick={() => go("/referrer")} className="text-sm font-semibold text-[#F5F4EF]/80 hover:text-[#F5F4EF]">I give referrals</button><button onClick={() => go("/privacy")} className="text-sm font-semibold text-[#F5F4EF]/80 hover:text-[#F5F4EF]">Privacy &amp; trust</button><button onClick={() => go("/start")} className="rounded-lg bg-[#F5F4EF] px-4 py-2.5 text-sm font-bold text-[#191713] hover:bg-white">Request a referral</button></div><div className="sm:hidden"><Sheet><SheetTrigger asChild><button type="button" aria-label="Open navigation menu" className="grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-transparent text-[#F5F4EF] transition active:scale-[.97]"><Menu className="h-5 w-5" /></button></SheetTrigger><SheetContent side="right" className="w-[min(84vw,20rem)] border-[#E2DDD2] bg-white p-0"><SheetHeader className="border-b border-[#ECE8DD] px-5 py-5"><SheetTitle className="text-left text-base">Menu</SheetTitle><SheetDescription className="sr-only">Public navigation</SheetDescription></SheetHeader><nav className="flex flex-col gap-1 p-3" aria-label="Mobile navigation"><SheetClose asChild><button type="button" onClick={() => go("/referrer")} className="min-h-12 rounded-lg px-4 text-left text-sm font-semibold text-[#191713] hover:bg-[#F5F4EF]">I give referrals</button></SheetClose><SheetClose asChild><button type="button" onClick={() => go("/privacy")} className="min-h-12 rounded-lg px-4 text-left text-sm font-semibold text-[#191713] hover:bg-[#F5F4EF]">Privacy &amp; trust</button></SheetClose><SheetClose asChild><button type="button" onClick={() => go("/start")} className="mt-3 min-h-12 rounded-lg bg-[#191713] px-4 text-left text-sm font-bold text-[#F5F4EF]">Request a referral</button></SheetClose></nav></SheetContent></Sheet></div></div></header>
    <section className="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:grid sm:items-center sm:gap-12 sm:px-6 sm:py-16 lg:grid-cols-[1.08fr_.92fr] lg:gap-16 lg:py-20">
      <div>
        <h1 className="font-display max-w-2xl text-balance text-[3.4rem] font-semibold uppercase leading-[.92] tracking-[0.005em] sm:text-[4.5rem]">Skip the wait<span className="text-[#E8442E]">.</span></h1>
        <p className="mt-4 max-w-xl text-base leading-6 text-[#3F3B33] sm:mt-5 sm:text-lg sm:leading-7">A private referral from someone inside beats a cold application. Put the right opportunity in front of the right person.</p>
        <dl aria-label="Live referral proof" className="mt-7 grid max-w-xl grid-cols-2 divide-x divide-[#E2DDD2] rounded-xl border border-[#E2DDD2] bg-white">
          <div className="px-4 py-3"><dt className="font-mono text-[11px] font-bold uppercase tracking-[.12em] text-[#625D52]">Accepted</dt><dd className="tnum mt-1 font-mono text-2xl font-bold text-[#191713]">{acceptedReferrals ?? "–"}</dd></div>
          <div className="px-4 py-3"><dt className="font-mono text-[11px] font-bold uppercase tracking-[.12em] text-[#625D52]">Free monthly</dt><dd className="tnum mt-1 font-mono text-2xl font-bold text-[#191713]">3</dd></div>
        </dl>
        <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-[4px] border border-[#191713] px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[#191713]"><Check className="h-3.5 w-3.5 text-[#E8442E]" strokeWidth={3} />Identities stay hidden</p>
        <div className="mt-5 grid gap-3 sm:max-w-xl sm:grid-cols-2">
          <button onClick={() => go("/start")} className="group flex min-h-[96px] items-center justify-between rounded-2xl bg-[#191713] p-5 text-left text-[#F5F4EF] shadow-[0_10px_24px_-12px_rgba(25,23,19,0.5)] transition active:scale-[.98] sm:min-h-[146px]"><span><span className="block font-display text-xl font-semibold uppercase tracking-[0.01em] sm:mt-1">I need a referral</span><span className="mt-1 block text-sm leading-5 text-[#F5F4EF]/70">Share the role. Add your resume.</span><span className="mt-3 hidden items-center gap-1 text-sm font-bold text-[#F5F4EF] sm:inline-flex">Ask for a referral <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></span><ArrowUpRight className="h-5 w-5 shrink-0 text-[#E8442E]" /></button>
          <button onClick={() => go("/referrer")} className="group flex min-h-[96px] items-center justify-between rounded-2xl border border-[#191713] bg-white p-5 text-left transition active:scale-[.98] sm:min-h-[146px]"><span><span className="block font-display text-xl font-semibold uppercase tracking-[0.01em] text-[#191713] sm:mt-1">I give referrals</span><span className="mt-1 block text-sm leading-5 text-[#625D52]">Review the request. Help your way.</span><span className="mt-3 hidden items-center gap-1 text-sm font-bold text-[#191713] sm:inline-flex">Give a referral <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></span><ArrowUpRight className="h-5 w-5 shrink-0 text-[#E8442E]" /></button>
        </div>
        <SignedIn><p className="mt-5 text-sm font-semibold text-[#625D52]">Signed in — your requests and inbox live in the account menu on every screen.</p></SignedIn>
      </div>
      <aside className="mt-10 rounded-2xl border border-[#E2DDD2] bg-white p-7 sm:mt-0"><h2 className="font-display text-[1.9rem] font-semibold uppercase leading-[.95] tracking-[0.01em]">How the handoff works</h2><ol className="mt-6 space-y-5"><WorkflowStep number="1" title="Share the role" body="Job seekers post the opportunity and the documents that make their case." /><WorkflowStep number="2" title="Get reviewed" body="A verified employee at that company chooses whether to help. Names stay hidden." /><WorkflowStep number="3" title="Move forward" body="Claimed requests open a private conversation. No fees, no spam, no exposure." /></ol><button onClick={() => go("/start")} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-4 py-3 text-sm font-bold text-[#F5F4EF]">Start your request <ArrowRight className="h-4 w-4" /></button></aside>
    </section>
  </main>;
}

function WorkflowStep({ number, title, body }: { number: string; title: string; body: string }) { return <li className="flex gap-4"><span aria-hidden="true" className="tnum grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#191713] font-display text-sm font-semibold text-[#F5F4EF]">{number}</span><div><p className="text-sm font-bold text-[#191713]">{title}</p><p className="mt-1 text-sm leading-6 text-[#625D52]">{body}</p></div></li>; }
