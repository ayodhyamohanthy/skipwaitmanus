import { ArrowLeft, ArrowRight, Check, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { startLogin } from "../const";

type Intent = "seeker" | "referrer";

export default function SignIn() {
  const [intent, setIntent] = useState<Intent>("seeker");

  return (
    <main data-skipwait-screen="sign-in" className="auth-page">
      <section className="auth-story" aria-label="SkipWait introduction">
        <Link href="/" className="wordmark auth-wordmark" aria-label="SkipWait home">SkipWait<span className="brand-dot">.</span></Link>
        <img src="/launch-door.jpg" alt="An open blue door with a yellow path leading through it" width={1600} height={1008} />
        <div className="auth-story-copy"><span className="eyebrow">A warmer way in</span><h1>One sign-in.<br />More open doors.</h1><p>Explore first. Sign in only when you&apos;re ready to ask for—or offer—a real introduction.</p></div>
        <div className="auth-story-proof"><ShieldCheck /><span><strong>Private by default</strong>Your details stay yours until you choose to share.</span></div>
      </section>
      <section className="auth-panel"><div className="auth-panel-inner">
        <Link href="/" className="auth-back"><ArrowLeft />Back to home</Link>
        <div className="auth-heading"><span className="auth-step">Your door starts here</span><h2>Welcome to SkipWait.</h2><p>Choose how you&apos;ll use SkipWait. You can change this later.</p></div>
        <div className="intent-switch" role="group" aria-label="How do you want to use SkipWait?">
          <button type="button" onClick={() => setIntent("seeker")} aria-pressed={intent === "seeker"} className={`brand-button${intent === "seeker" ? " selected" : ""}`}><Sparkles />Find a referral</button>
          <button type="button" onClick={() => setIntent("referrer")} aria-pressed={intent === "referrer"} className={`brand-button${intent === "referrer" ? " selected" : ""}`}><ShieldCheck />Give a referral</button>
        </div>
        <p className="auth-context">{intent === "seeker" ? "Explore companies and send a thoughtful request." : "Choose who you help and keep your identity private."}<Check /></p>
        <div className="auth-options">
          <button type="button" onClick={() => startLogin()} className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]"><span className="google-g" aria-hidden="true">G</span>Continue with Google</button>
          <div className="auth-divider"><span>or</span></div>
          <button type="button" onClick={() => startLogin()} className="brand-button"><Mail />Continue with email</button>
        </div>
        <p className="auth-new">New to SkipWait? <button type="button" className="text-link" onClick={() => startLogin()}>Create a free account</button></p>
        <p className="auth-new"><Link href="/forgot-password" className="text-link">Forgot password?</Link></p>
        <p className="auth-terms">By continuing, you agree to the <Link href="/terms" className="underline">Terms</Link> and acknowledge the <Link href="/privacy" className="underline">Privacy Policy</Link>. Referrals are free and never guarantee an interview.</p>
      </div></section>
    </main>
  );
}
