import { ArrowRight, CheckCircle2, HeartHandshake, Sparkles } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { Brand } from "@/components/Brand";
import { startLogin } from "@/const";
import { requestSavedDeviceCredential, supportsBrowserCredentialMediation } from "@/lib/pwaContinuity";

export default function Home() {
  const [, go] = useLocation();
  const [deviceSignIn, setDeviceSignIn] = useState(false);
  const canUseDeviceSignIn = typeof navigator !== "undefined" && supportsBrowserCredentialMediation(navigator.credentials);
  const useSavedDeviceSignIn = async () => { setDeviceSignIn(true); await requestSavedDeviceCredential(navigator.credentials); startLogin(); };

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-6"><Brand /><div className="hidden items-center gap-5 sm:flex"><button onClick={() => go("/referrer")} className="text-sm font-semibold text-slate-600 hover:text-slate-950">I give referrals</button><button onClick={() => go("/start")} className="rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0847AD]">Request a referral</button></div></header>
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-5 sm:px-6 sm:pt-12 lg:grid-cols-[1.08fr_.92fr] lg:gap-14 lg:pb-24 lg:pt-20">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#0B57D0]"><Sparkles className="h-3.5 w-3.5" />Referrals, without the runaround</p>
        <h1 className="mt-5 max-w-2xl text-balance text-[2.6rem] font-semibold leading-[.94] tracking-[-.06em] sm:text-6xl">Ask for a referral.<br />Or give one.</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 sm:mt-5 sm:text-lg">Put the right opportunity in front of the right person—whether you are making the ask or making the introduction.</p>
        <div className="mt-7 sm:mt-8"><p className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-slate-500">What brings you here?</p><div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
          <button onClick={() => go("/start")} className="group flex min-h-[146px] items-center justify-between rounded-2xl bg-[#0B57D0] p-5 text-left text-white shadow-sm transition active:scale-[.98] hover:bg-[#0847AD]"><span><span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.13em] text-blue-100"><Sparkles className="h-3.5 w-3.5" />Job Seeker</span><span className="mt-3 block text-xl font-semibold">I need a referral</span><span className="mt-2 block max-w-[210px] text-sm leading-5 text-blue-100">Share the job and your resume. We set up the ask.</span><span className="mt-4 inline-flex items-center gap-1 text-sm font-bold">Ask for a referral <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></span></button>
          <button onClick={() => go("/referrer")} className="group flex min-h-[146px] items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition active:scale-[.98] hover:border-blue-200 hover:bg-blue-50/30"><span><span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.13em] text-[#0B57D0]"><HeartHandshake className="h-3.5 w-3.5" />Referrer</span><span className="mt-3 block text-xl font-semibold text-slate-950">I give referrals</span><span className="mt-2 block max-w-[210px] text-sm leading-5 text-slate-600">Review a complete request and help in your own voice.</span><span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#0B57D0]">Give a referral <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></span></button>
        </div></div>
        {canUseDeviceSignIn && <button onClick={() => void useSavedDeviceSignIn()} disabled={deviceSignIn} className="mt-5 hidden text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-[#0B57D0] disabled:opacity-50 sm:inline">{deviceSignIn ? "Opening secure sign-in…" : "Use saved device sign-in"}</button>}
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />3 requests included</span><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />You control every introduction</span></div>
      </div>
      <aside className="hidden rounded-2xl border border-slate-200 bg-white p-7 shadow-sm lg:block"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">The simple workflow</p><h2 className="mt-3 text-2xl font-semibold tracking-[-.03em]">Built for both sides of the ask.</h2><div className="mt-7 space-y-5"><WorkflowStep number="01" title="Start with the role" body="Job Seekers share the opportunity and the documents that make their case." /><WorkflowStep number="02" title="Review with context" body="Referrers see exactly what they need before choosing how to help." /><WorkflowStep number="03" title="Make a human introduction" body="The Referrer writes a thoughtful hiring-manager email in their own voice." /></div><button onClick={() => go("/start")} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 hover:border-blue-200 hover:bg-blue-50">Start your request <ArrowRight className="h-4 w-4" /></button></aside>
    </section>
  </main>;
}

function WorkflowStep({ number, title, body }: { number: string; title: string; body: string }) { return <div className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-[#0B57D0]">{number}</span><div><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{body}</p></div></div>; }
