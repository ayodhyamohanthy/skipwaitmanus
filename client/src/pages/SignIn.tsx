import { ArrowLeft, ArrowRight, Check, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { startLogin } from "../const";

type Intent = "seeker" | "referrer";

/**
 * Kit v4 sign-in (app/src/components/sign-in-page.tsx). WorkOS AuthKit is the
 * only credential store, so every continuation hands off to the hosted AuthKit
 * screen: the email step only carries the address forward as a login hint and
 * the password is entered on that secure screen, never on this page.
 */
function workosEmailSignInUrl(email: string): string {
  const loginHint = email.trim().toLowerCase();
  return loginHint ? `/api/auth/workos/sign-in?${new URLSearchParams({ login_hint: loginHint })}` : "/api/auth/workos/sign-in";
}

export default function SignIn() {
  const [intent, setIntent] = useState<Intent>("seeker");
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState("");

  function continueWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.assign(workosEmailSignInUrl(email));
  }

  return <main data-skipwait-screen="sign-in" className="auth-page">
    <section className="auth-story" aria-label="SkipWait introduction">
      <Link className="wordmark auth-wordmark" href="/">SkipWait<span className="brand-dot">.</span></Link>
      <img src="/launch-door.jpg" alt="An open blue door with a yellow path" width={1600} height={1008} />
      <div className="auth-story-copy"><span className="eyebrow">A WARMER WAY IN</span><h1>One sign-in.<br />More open doors.</h1><p>Explore first. Sign in only when you’re ready to ask for—or offer—a real introduction.</p></div>
      <div className="auth-story-proof"><ShieldCheck /><span><strong>Private by default</strong>Your details stay yours until you choose to share.</span></div>
    </section>
    <section className="auth-panel"><div className="auth-panel-inner">
      <Link className="auth-back" href="/"><ArrowLeft /> Back to home</Link>
      <div className="auth-heading"><span className="auth-step">YOUR DOOR STARTS HERE</span><h2>Welcome to SkipWait.</h2><p>Choose how you’ll use SkipWait. You can change this later.</p></div>
      <div className="intent-switch" role="group" aria-label="How do you want to use SkipWait?"><Button type="button" variant="ghost" className={intent === "seeker" ? "selected" : ""} aria-pressed={intent === "seeker"} onClick={() => setIntent("seeker")}><Sparkles />Find a referral</Button><Button type="button" variant="ghost" className={intent === "referrer" ? "selected" : ""} aria-pressed={intent === "referrer"} onClick={() => setIntent("referrer")}><ShieldCheck />Give a referral</Button></div>
      <div className="auth-context"><span>{intent === "seeker" ? "Explore companies and send a thoughtful request." : "Choose who you help and keep your identity private."}</span><Check /></div>
      {!emailMode ? <div className="auth-options"><Button type="button" variant="outline" className="google-button" onClick={() => startLogin()}><span className="google-g" aria-hidden="true">G</span>Continue with Google</Button><div className="auth-divider"><span>or</span></div><Button type="button" onClick={() => setEmailMode(true)}><Mail />Continue with email</Button></div>
        : <form className="auth-form" onSubmit={continueWithEmail}>
          <label htmlFor="email">Email address</label>
          <div className="auth-input"><Mail /><input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></div>
          <p className="text-xs leading-relaxed text-muted-foreground">You’ll finish signing in on the next, secure screen.</p>
          <Button type="submit">Sign in <ArrowRight /></Button>
          <Button type="button" variant="ghost" onClick={() => setEmailMode(false)}>Use another method</Button>
        </form>}
      <p className="auth-new">New to SkipWait? <Button type="button" variant="link" onClick={() => startLogin()}>Create a free account</Button></p>
      <p className="auth-terms">By continuing, you agree to the <Link href="/terms" className="underline">Terms</Link> and acknowledge the <Link href="/privacy" className="underline">Privacy Policy</Link>. Referrals are free and never guarantee an interview.</p>
    </div></section>
  </main>;
}
