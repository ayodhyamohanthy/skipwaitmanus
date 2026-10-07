import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Building2, Check, Clock3, LockKeyhole, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { launchCompanies } from "@/lib/marketplace-data";

export const Route = createFileRoute("/verify")({
  head: () => pageMeta("Verify your work email", "Referrers confirm their company with a one-time code sent to their work email. The email itself is never shown to seekers."),
  component: Verify,
});

const domains: Record<string, string> = { skipwait: "skipwait.me", wipro: "wipro.com", "go-neutrinos": "goneutrinos.com", tcs: "tcs.com", merkle: "merkle.com" };
const personal = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me"];
const DEMO_CODE = "123456";
type Step = "company" | "email" | "code" | "done";

function Verify() {
  const [step, setStep] = useState<Step>("company");
  const [company, setCompany] = useState("wipro");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [codeError, setCodeError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [resendIn, setResendIn] = useState(30);
  const [expired, setExpired] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const c = launchCompanies.find(x => x.slug === company)!;
  const domain = domains[company];
  const locked = attempts >= 5;

  useEffect(() => {
    if (step !== "code" || resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, resendIn]);

  function sendCode() {
    const d = email.split("@")[1]?.toLowerCase() ?? "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setEmailError("Enter a full email address, like you@" + domain);
    if (personal.includes(d)) return setEmailError("Personal inboxes can't prove where you work. Use your " + c.name + " email.");
    if (d !== domain) return setEmailError(`This doesn't match ${c.name}. ${c.name} emails end in @${domain}.`);
    setEmailError(""); setCode(["", "", "", "", "", ""]); setCodeError(""); setResendIn(30); setExpired(false); setStep("code");
    setTimeout(() => inputs.current[0]?.focus(), 50);
  }

  function setDigit(i: number, v: string) {
    const digits = v.replace(/\D/g, "");
    if (digits.length > 1) { const next = digits.slice(0, 6).split(""); setCode([...next, ...Array(6 - next.length).fill("")]); inputs.current[Math.min(next.length, 5)]?.focus(); return; }
    const next = [...code]; next[i] = digits; setCode(next); setCodeError("");
    if (digits && i < 5) inputs.current[i + 1]?.focus();
  }

  function check() {
    if (expired) return setCodeError("This code has expired. Send a new one.");
    if (code.join("") === DEMO_CODE) return setStep("done");
    const a = attempts + 1; setAttempts(a);
    setCodeError(a >= 5 ? "Too many tries. For your safety, wait 15 minutes before trying again." : `That code isn't right. ${5 - a} ${5 - a === 1 ? "try" : "tries"} left.`);
  }

  const stepIndex = ["company", "email", "code", "done"].indexOf(step);
  return <main className="page-content">
    <div className="page-heading"><div><span className="eyebrow">REFERRER VERIFICATION</span><h1>Prove you're inside<span className="brand-dot">.</span></h1><p>A one-time code to your work email. Seekers see a "Verified" badge — never your email address.</p></div><span className="preview-label">DESIGN PREVIEW</span></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-3xl border border-border bg-card p-5 sm:p-8">
        <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Verification progress">{["Company", "Work email", "Code", "Verified"].map((l, i) => <li key={l} className="min-w-0"><span className={`block h-1.5 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-muted"}`} /><span className={`mt-2 block truncate text-xs ${i === stepIndex ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{l}</span></li>)}</ol>

        {step === "company" && <div>
          <Building2 className="mb-3 text-primary" /><h2 className="text-2xl font-semibold">Where do you work?</h2><p className="mt-1 text-muted-foreground">Pick the company you'll refer into.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">{launchCompanies.map(x => <button key={x.slug} type="button" onClick={() => setCompany(x.slug)} className={`flex min-h-14 items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${company === x.slug ? "border-primary bg-primary/5" : "border-border hover:border-foreground/40"}`}><span className="company-mark">{x.initials}</span><span className="min-w-0 flex-1"><strong className="block">{x.name}</strong><small className="text-muted-foreground">@{domains[x.slug]}</small></span>{company === x.slug && <Check className="text-primary" />}</button>)}</div>
          <p className="mt-4 text-sm text-muted-foreground">Company not listed? <Link to="/suggest-company" className="text-link">Suggest it</Link> — we add companies after review.</p>
          <div className="mt-8 flex justify-end"><Button onClick={() => setStep("email")}>Continue <ArrowRight /></Button></div>
        </div>}

        {step === "email" && <div>
          <Mail className="mb-3 text-primary" /><h2 className="text-2xl font-semibold">Your {c.name} email</h2><p className="mt-1 text-muted-foreground">We'll send a 6-digit code. It expires in 10 minutes.</p>
          <label className="mt-6 block text-sm font-medium">Work email
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setEmailError(""); }} onKeyDown={e => e.key === "Enter" && sendCode()} placeholder={`you@${domain}`} aria-invalid={!!emailError} aria-describedby="email-msg" className={`mt-2 h-12 w-full rounded-xl border bg-background px-4 text-base ${emailError ? "border-destructive" : "border-input"}`} />
          </label>
          <p id="email-msg" className={`mt-2 flex items-start gap-2 text-sm ${emailError ? "text-destructive" : "text-muted-foreground"}`}>{emailError ? <><AlertTriangle className="mt-0.5 size-4 shrink-0" />{emailError}</> : <><LockKeyhole className="mt-0.5 size-4 shrink-0" />Used only to verify. Never shown, never used for marketing.</>}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="text-muted-foreground">Try states:</span>{[`name@gmail.com`, `name@other.com`, `name@${domain}`].map(s => <button key={s} type="button" className="rounded-full border border-border px-3 py-1 hover:bg-muted" onClick={() => { setEmail(s); setEmailError(""); }}>{s}</button>)}</div>
          <div className="mt-8 flex justify-between gap-3"><Button variant="ghost" onClick={() => setStep("company")}><ArrowLeft />Back</Button><Button onClick={sendCode}>Send code <ArrowRight /></Button></div>
        </div>}

        {step === "code" && <div>
          <ShieldCheck className="mb-3 text-primary" /><h2 className="text-2xl font-semibold">Enter the code</h2><p className="mt-1 text-muted-foreground">Sent to <strong className="text-foreground break-all">{email}</strong>. <button type="button" className="text-link" onClick={() => setStep("email")}>Change</button></p>
          <div className="mt-6 flex gap-2 sm:gap-3" role="group" aria-label="6-digit code">{code.map((d, i) => <input key={i} ref={el => { inputs.current[i] = el; }} value={d} disabled={locked} onChange={e => setDigit(i, e.target.value)} onKeyDown={e => { if (e.key === "Backspace" && !d && i > 0) inputs.current[i - 1]?.focus(); if (e.key === "Enter") check(); }} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`Digit ${i + 1}`} className={`h-14 w-full min-w-0 max-w-14 rounded-xl border bg-background text-center text-2xl font-semibold ${codeError ? "border-destructive" : "border-input"} disabled:opacity-50`} />)}</div>
          {codeError && <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{codeError}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {resendIn > 0 ? <span className="flex items-center gap-1"><Clock3 className="size-4" />Resend in 0:{String(resendIn).padStart(2, "0")}</span> : <button type="button" className="text-link flex items-center gap-1" onClick={() => { setResendIn(30); setExpired(false); setCode(["", "", "", "", "", ""]); setCodeError(""); }}><RefreshCw className="size-4" />Resend code</button>}
            <span>Check spam or quarantine — some company filters hold codes.</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="text-muted-foreground">Preview code <strong>{DEMO_CODE}</strong> · try states:</span><button type="button" className="rounded-full border border-border px-3 py-1 hover:bg-muted" onClick={() => setExpired(true)}>Expire code</button><button type="button" className="rounded-full border border-border px-3 py-1 hover:bg-muted" onClick={() => { setAttempts(5); setCodeError("Too many tries. For your safety, wait 15 minutes before trying again."); }}>Lock out</button><button type="button" className="rounded-full border border-border px-3 py-1 hover:bg-muted" onClick={() => { setAttempts(0); setCodeError(""); setExpired(false); }}>Reset</button></div>
          <div className="mt-8 flex justify-between gap-3"><Button variant="ghost" onClick={() => setStep("email")}><ArrowLeft />Back</Button><Button disabled={locked || code.join("").length < 6} onClick={check}>Verify <Check /></Button></div>
        </div>}

        {step === "done" && <div className="text-center">
          <span className="mx-auto mb-4 grid size-20 place-items-center rounded-full bg-accent"><BadgeCheck className="size-10 text-primary" /></span>
          <h2 className="text-2xl font-semibold">You're verified at {c.name}.</h2><p className="mx-auto mt-2 max-w-md text-muted-foreground">Seekers now see a "Verified at {c.name}" badge. Your name and email stay hidden until you accept a request.</p>
          <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-border p-4 text-left"><span className="eyebrow">WHAT SEEKERS SEE</span><div className="mt-3 flex items-center gap-3"><span className="company-mark">{c.initials}</span><span><strong className="flex items-center gap-1">Someone at {c.name} <BadgeCheck className="size-4 text-primary" /></strong><small className="text-muted-foreground">Verified via work email · Design</small></span></div></div>
          <p className="mt-4 text-sm text-muted-foreground">We'll ask you to re-verify every 90 days, or sooner if your company email stops working.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3"><Button variant="outline" asChild><Link to="/p/$handle" params={{ handle: "preview" }}>View my profile</Link></Button><Button asChild><Link to="/referrer-setup">Set up referring <ArrowRight /></Link></Button></div>
        </div>}
      </section>
      <aside className="space-y-4">
        <div className="rounded-3xl bg-muted p-5"><span className="eyebrow">WHY A CODE?</span><p className="mt-2 text-sm">It proves you can receive email at {c.name} today. It doesn't prove your role or that {c.name} endorses SkipWait.</p></div>
        <div className="rounded-3xl border border-border p-5 text-sm"><span className="eyebrow">WE STORE</span><ul className="mt-2 space-y-2"><li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />A one-way fingerprint of your email</li><li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />Company and verification date</li><li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />Never the code or your inbox</li></ul></div>
        <div className="rounded-3xl border border-border p-5 text-sm"><span className="eyebrow">LEFT YOUR COMPANY?</span><p className="mt-2 text-muted-foreground">Your badge is removed at the next re-check. Open requests are returned to seekers with a kind note.</p></div>
      </aside>
    </div>
  </main>;
}
