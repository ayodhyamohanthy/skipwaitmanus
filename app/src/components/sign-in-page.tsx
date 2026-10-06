import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import door from "@/assets/launch-door.jpg";

type Intent = "seeker" | "referrer";

export function SignInPage() {
  const [intent, setIntent] = useState<Intent>("seeker");
  const [emailMode, setEmailMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [preview, setPreview] = useState(false);

  function showPreview(event?: FormEvent) {
    event?.preventDefault();
    setPreview(true);
  }

  return <main className="auth-page">
    <section className="auth-story" aria-label="SkipWait introduction">
      <Link className="wordmark auth-wordmark" to="/">SkipWait<span className="brand-dot">.</span></Link>
      <img src={door} alt="An open blue door with a yellow path" width={1600} height={1008} />
      <div className="auth-story-copy"><span className="eyebrow">A WARMER WAY IN</span><h1>One sign-in.<br />More open doors.</h1><p>Explore first. Sign in only when you’re ready to ask for—or offer—a real introduction.</p></div>
      <div className="auth-story-proof"><ShieldCheck /><span><strong>Private by default</strong>Your details stay yours until you choose to share.</span></div>
    </section>
    <section className="auth-panel"><div className="auth-panel-inner">
      <Link className="auth-back" to="/"><ArrowLeft /> Back to home</Link>
      <div className="auth-heading"><span className="auth-step">YOUR DOOR STARTS HERE</span><h2>{preview ? "That’s the whole flow." : "Welcome to SkipWait."}</h2><p>{preview ? "This design preview stops before creating or accessing an account." : "Choose how you’ll use SkipWait. You can change this later."}</p></div>
      {preview ? <div className="auth-preview-state"><span className="preview-check"><Check /></span><div><strong>Simple, private, ready.</strong><p>The live product would now securely continue into your {intent === "seeker" ? "job search" : "referrer setup"}.</p></div><Button onClick={() => setPreview(false)}>Return to sign in <ArrowRight /></Button><Button asChild variant="ghost"><Link to="/explore">Keep exploring</Link></Button></div> : <>
        <div className="intent-switch" role="group" aria-label="How do you want to use SkipWait?"><Button type="button" variant="ghost" className={intent === "seeker" ? "selected" : ""} aria-pressed={intent === "seeker"} onClick={() => setIntent("seeker")}><Sparkles />Find a referral</Button><Button type="button" variant="ghost" className={intent === "referrer" ? "selected" : ""} aria-pressed={intent === "referrer"} onClick={() => setIntent("referrer")}><ShieldCheck />Give a referral</Button></div>
        <div className="auth-context"><span>{intent === "seeker" ? "Explore companies and send a thoughtful request." : "Choose who you help and keep your identity private."}</span><Check /></div>
        {!emailMode ? <div className="auth-options"><Button type="button" variant="outline" className="google-button" onClick={() => showPreview()}><span className="google-g" aria-hidden="true">G</span>Continue with Google</Button><div className="auth-divider"><span>or</span></div><Button type="button" onClick={() => setEmailMode(true)}><Mail />Continue with email</Button></div> : <form className="auth-form" onSubmit={showPreview}><label htmlFor="email">Email address</label><div className="auth-input"><Mail /><input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></div><label htmlFor="password">Password</label><div className="auth-input"><LockKeyhole /><input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="Enter your password" autoComplete="current-password" minLength={8} required /><Button type="button" variant="ghost" size="icon" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div><div className="auth-form-meta"><Button type="button" variant="link" asChild><Link to="/forgot-password">Forgot password?</Link></Button></div><Button type="submit">Sign in <ArrowRight /></Button><Button type="button" variant="ghost" onClick={() => setEmailMode(false)}>Use another method</Button></form>}
        <p className="auth-new">New to SkipWait? <Button variant="link" onClick={() => setPreview(true)}>Create a free account</Button></p><p className="auth-terms">By continuing, you agree to the Terms and acknowledge the Privacy Policy. Referrals are free and never guarantee an interview.</p>
      </>}
    </div></section>
  </main>;
}