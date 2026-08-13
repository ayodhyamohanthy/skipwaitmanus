import { ArrowRight, CheckCircle2, HeartHandshake } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { Brand } from "@/components/Brand";
import { startLogin } from "@/const";
import { requestSavedDeviceCredential, supportsBrowserCredentialMediation } from "@/lib/pwaContinuity";

export default function Home() {
  const [, go] = useLocation();
  const [deviceSignIn, setDeviceSignIn] = useState(false);
  const canUseDeviceSignIn = typeof navigator !== "undefined" && supportsBrowserCredentialMediation(navigator.credentials);
  const useSavedDeviceSignIn = async () => {
    setDeviceSignIn(true);
    await requestSavedDeviceCredential(navigator.credentials);
    startLogin();
  };

  return <main className="min-h-screen bg-[#FCFCFE] text-slate-950">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Brand />
      <button onClick={() => go("/start")} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Start free</button>
    </header>
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-16 lg:grid-cols-2 lg:pt-24">
      <div>
        <p className="inline-flex rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">Warm introductions, without the awkwardness</p>
        <h1 className="mt-6 text-balance text-5xl font-semibold leading-[.98] tracking-[-.065em] sm:text-6xl">Make the referral ask people want to act on.</h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Job Seekers bring the role and evidence. Referrers get the context, the documents, and a clean starting point for the hiring-manager email.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button onClick={() => go("/start")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-semibold text-white">Ask for a warm introduction <ArrowRight className="h-4 w-4" /></button>
          <button onClick={() => go("/referrer")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold">Review a referral request <HeartHandshake className="h-4 w-4" /></button>
        </div>
        {canUseDeviceSignIn && <button onClick={() => void useSavedDeviceSignIn()} disabled={deviceSignIn} className="mt-4 text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-violet-700 disabled:opacity-50">{deviceSignIn ? "Opening secure sign-in…" : "Use saved device sign-in"}</button>}
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />3 requests included</span>
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Referrers stay in control</span>
        </div>
      </div>
      <div className="rounded-[28px] bg-slate-950 p-7 text-white shadow-[0_25px_65px_rgba(29,22,72,.24)] sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-violet-300">A better ask, on both sides</p>
        <div className="mt-7 space-y-6">
          <div>
            <p className="text-lg font-semibold">For Job Seekers</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">Stop sending vague messages into the void. Share the exact role and your evidence, then let a real employee decide whether to introduce you.</p>
          </div>
          <div className="border-t border-white/10 pt-6">
            <p className="text-lg font-semibold">For Referrers</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">Help without the back-and-forth. Review the opportunity and documents in one place, then write the introduction in your own voice—or decline with care.</p>
          </div>
        </div>
      </div>
    </section>
  </main>;
}
