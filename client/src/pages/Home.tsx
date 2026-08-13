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
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-6"><Brand /><div className="flex items-center gap-3"><button onClick={() => go("/referrer")} className="hidden text-sm font-semibold text-slate-600 sm:block">For Referrers</button><button onClick={() => go("/start")} className="rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0847AD]">Start free</button></div></header>
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_.9fr] lg:gap-14 lg:pb-24 lg:pt-24">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#0B57D0]"><Sparkles className="h-3.5 w-3.5" />Referrals, organized</p>
        <h1 className="mt-5 max-w-2xl text-balance text-5xl font-semibold leading-[.95] tracking-[-.055em] sm:text-6xl">The right referral starts with a clear request.</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">One focused workspace for Job Seekers to make the ask—and Referrers to review the role, the evidence, and the email before deciding.</p>
        <div className="mt-8 grid gap-3 sm:max-w-xl sm:grid-cols-2">
          <button onClick={() => go("/start")} className="group flex min-h-[118px] items-center justify-between rounded-xl bg-[#0B57D0] p-5 text-left text-white shadow-sm transition hover:bg-[#0847AD]"><span><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-blue-100"><Sparkles className="h-3.5 w-3.5" />Job Seeker</span><span className="mt-2 block text-lg font-semibold">Request a referral</span><span className="mt-1 block text-sm text-blue-100">Share the role and your resume.</span></span><ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></button>
          <button onClick={() => go("/referrer")} className="group flex min-h-[118px] items-center justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30"><span><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-[#0B57D0]"><HeartHandshake className="h-3.5 w-3.5" />Referrer</span><span className="mt-2 block text-lg font-semibold text-slate-950">Review a request</span><span className="mt-1 block text-sm text-slate-600">See context. Help on your terms.</span></span><ArrowRight className="h-5 w-5 text-[#0B57D0] transition-transform group-hover:translate-x-1" /></button>
        </div>
        {canUseDeviceSignIn && <button onClick={() => void useSavedDeviceSignIn()} disabled={deviceSignIn} className="mt-5 text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-[#0B57D0] disabled:opacity-50">{deviceSignIn ? "Opening secure sign-in…" : "Use saved device sign-in"}</button>}
        <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />3 requests included</span><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />You control every introduction</span></div>
      </div>
      <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">How it works</p><h2 className="mt-3 text-2xl font-semibold tracking-[-.03em]">Built for both sides of the request.</h2><div className="mt-7 space-y-5"><WorkflowStep number="01" title="Share the opportunity" body="Job Seekers add the exact role and required supporting documents." /><WorkflowStep number="02" title="Review with context" body="Referrers see what matters before spending time on a decision." /><WorkflowStep number="03" title="Make a human introduction" body="The Referrer writes the hiring-manager email in their own voice." /></div><button onClick={() => go("/start")} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 hover:border-blue-200 hover:bg-blue-50">Get started <ArrowRight className="h-4 w-4" /></button></aside>
    </section>
  </main>;
}

function WorkflowStep({ number, title, body }: { number: string; title: string; body: string }) { return <div className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-[#0B57D0]">{number}</span><div><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{body}</p></div></div>; }
