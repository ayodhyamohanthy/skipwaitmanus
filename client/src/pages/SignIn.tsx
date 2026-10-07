import { ArrowLeft, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { startLogin } from "../const";

type Intent = "seeker" | "referrer";

export default function SignIn() {
  const [intent, setIntent] = useState<Intent>("seeker");

  return (
    <main data-skipwait-screen="sign-in" className="mx-auto grid min-h-dvh max-w-6xl md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-label="SkipWait introduction" className="hidden flex-col justify-between bg-[var(--secondary)] p-10 md:flex">
        <Link href="/" className="text-2xl font-semibold tracking-[-.03em]" aria-label="SkipWait home">SkipWait<span className="brand-dot">.</span></Link>
        <div>
          <span className="eyebrow">A warmer way in</span>
          <h1 className="mt-3 text-5xl font-semibold leading-[1.05]">One sign-in.<br />More open doors.</h1>
          <p className="mt-4 max-w-md leading-7 text-[var(--muted-foreground)]">Explore first. Sign in only when you&apos;re ready to ask for — or offer — a real introduction.</p>
          <p className="mt-8 flex max-w-sm items-start gap-3 rounded-2xl border-2 border-[var(--foreground)] bg-[var(--background)] p-4 text-sm shadow-[var(--shadow-offset)]"><ShieldCheck className="size-5 shrink-0 text-[var(--primary)]" /><span><strong>Private by default.</strong> Your details stay yours until you choose to share.</span></p>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">Referrals are free and never guarantee an interview.</p>
      </section>
      <section className="flex items-center px-5 py-8 md:px-14">
        <div className="w-full max-w-md">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]"><ArrowLeft className="size-4" />Back to home</Link>
          <p className="eyebrow mt-10">Your door starts here</p>
          <h2 className="mt-2 text-3xl font-semibold">Welcome to SkipWait.</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Choose how you&apos;ll use SkipWait. You can change this later.</p>
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-[var(--muted)] p-1.5" role="group" aria-label="How do you want to use SkipWait?">
            {(["seeker", "referrer"] as const).map(value => (
              <button key={value} type="button" aria-pressed={intent === value} onClick={() => setIntent(value)} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold ${intent === value ? "bg-[var(--background)] shadow-sm" : "text-[var(--muted-foreground)]"}`}>
                {value === "seeker" ? <><Sparkles className="size-4" />Find a referral</> : <><ShieldCheck className="size-4" />Give a referral</>}
              </button>
            ))}
          </div>
          <p className="mt-3 min-h-6 text-center text-sm text-[var(--muted-foreground)]">{intent === "seeker" ? "Explore companies and send a thoughtful request." : "Choose who you help and keep your identity private."}</p>
          <button type="button" onClick={() => startLogin()} className="brand-button mt-4 w-full">Continue securely <ArrowRight /></button>
          <p className="mt-3 text-center text-xs leading-5 text-[var(--muted-foreground)]">Work + Google sign-in via WorkOS AuthKit. Work email verifies employment separately — it is never a sign-in.</p>
          <p className="mt-6 text-center text-xs leading-5 text-[var(--muted-foreground)]">By continuing, you agree to the <Link href="/terms" className="font-semibold underline">Terms</Link> and acknowledge the <Link href="/privacy" className="font-semibold underline">Privacy Policy</Link>.</p>
        </div>
      </section>
    </main>
  );
}
