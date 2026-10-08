import { AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, Clock3, LoaderCircle, LockKeyhole, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { Button, buttonVariants } from "@/components/kit/button";
import { VerifiedPanel, VerifyLayout, VerifyProgress } from "@/components/verify/VerifyPanels";
import { VerifyRequestError, checkWorkEmailCode, enrollWorkEmail, sendWorkEmailCode } from "@/components/verify/verifyApi";
import { usePersistFn } from "@/hooks/usePersistFn";
import { LAUNCH_COMPANIES, getLaunchCompany } from "@/lib/companies";

const PERSONAL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me"];
const MAX_ATTEMPTS = 5;
/** The server accepts one code request per email per minute; a shorter
 * countdown would invite a resend the server is certain to refuse. */
const RESEND_SECONDS = 60;
const EMPTY_CODE = ["", "", "", "", "", ""];
const LOCKED_MESSAGE = "Too many tries. For your safety, this code no longer works. Send a new one.";
const DEFAULT_COMPANY = "wipro";
type Step = "company" | "email" | "code" | "done";
const STEP_ORDER: Step[] = ["company", "email", "code", "done"];

const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);
const countdown = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export default function Verify() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [step, setStep] = useState<Step>("company");
  const [company, setCompany] = useState(DEFAULT_COMPANY);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState(EMPTY_CODE);
  const [codeError, setCodeError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  // A correct code yields a single-use receipt; keep it so a failed enrollment
  // can be retried without spending a new code.
  const [receipt, setReceipt] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const selected = getLaunchCompany(company) ?? LAUNCH_COMPANIES[1];
  const locked = attempts >= MAX_ATTEMPTS;
  const entered = code.join("");

  useEffect(() => {
    if (step !== "code" || resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, resendIn]);

  const backToEmail = () => { setReceipt(""); setCodeError(""); setStep("email"); };

  const sendCode = async (from: "email" | "code") => {
    const showError = from === "email" ? setEmailError : setCodeError;
    const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setEmailError(`Enter a full email address, like you@${selected.domain}`); return; }
    if (PERSONAL_DOMAINS.includes(domain)) { setEmailError(`Personal inboxes can't prove where you work. Use your ${selected.name} email.`); return; }
    if (domain !== selected.domain) { setEmailError(`This doesn't match ${selected.name}. ${selected.name} emails end in @${selected.domain}.`); return; }
    if (sending) return;
    showError(""); setSending(true);
    try {
      await sendWorkEmailCode(email.trim(), fetchToken);
      setCode(EMPTY_CODE); setCodeError(""); setAttempts(0); setReceipt(""); setResendIn(RESEND_SECONDS); setStep("code");
      setTimeout(() => inputs.current[0]?.focus(), 50);
    } catch (reason) { showError(messageOf(reason, "We could not send the verification code")); }
    finally { setSending(false); }
  };

  const setDigit = (index: number, value: string) => {
    const digits = value.replace(/\D/g, "");
    setCodeError("");
    if (digits.length > 1) {
      const next = digits.slice(0, 6).split("");
      setCode([...next, ...EMPTY_CODE.slice(next.length)]);
      inputs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    const next = [...code];
    next[index] = digits;
    setCode(next);
    if (digits && index < 5) inputs.current[index + 1]?.focus();
  };

  const check = async () => {
    if (verifying || locked || (!receipt && entered.length < 6)) return;
    setVerifying(true); setCodeError("");
    try {
      let proof = receipt;
      if (!proof) {
        try { proof = await checkWorkEmailCode(email.trim(), entered, fetchToken); }
        catch (reason) {
          if (!(reason instanceof VerifyRequestError) || reason.status !== 400) { setCodeError(messageOf(reason, "We could not verify the code")); return; }
          const count = attempts + 1;
          const left = MAX_ATTEMPTS - count;
          setAttempts(count);
          setCodeError(left <= 0 ? LOCKED_MESSAGE : `${reason.message} ${left} ${left === 1 ? "try" : "tries"} left.`);
          return;
        }
        setReceipt(proof);
      }
      try { await enrollWorkEmail(email.trim(), proof, fetchToken); }
      catch (reason) {
        // A rejected receipt is spent or expired: the next try needs a new code.
        if (reason instanceof VerifyRequestError && reason.status === 403) { setReceipt(""); setCode(EMPTY_CODE); }
        setCodeError(messageOf(reason, "We could not confirm this work email"));
        return;
      }
      setStep("done");
    } finally { setVerifying(false); }
  };

  if (!isLoaded) {
    return (
      <VerifyLayout screen="verify-loading" company={selected} busy>
        <VerifyProgress stepIndex={0} />
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Checking your sign-in…</p>
      </VerifyLayout>
    );
  }

  if (!isSignedIn) {
    return (
      <VerifyLayout screen="verify-sign-in" company={selected}>
        <VerifyProgress stepIndex={0} />
        <LockKeyhole className="mb-3 text-primary" /><h2 className="text-2xl font-semibold">Sign in to verify</h2>
        <p className="mt-1 text-muted-foreground">Sign in first — then a one-time code to your work email confirms your company.</p>
        <div className="mt-8 flex justify-end"><SignInButton><button type="button" className={buttonVariants()}>Sign in <ArrowRight /></button></SignInButton></div>
      </VerifyLayout>
    );
  }

  return (
    <VerifyLayout screen="verify" company={selected}>
      <VerifyProgress stepIndex={STEP_ORDER.indexOf(step)} />

      {step === "company" ? (
        <div>
          <Building2 className="mb-3 text-primary" /><h2 className="text-2xl font-semibold">Where do you work?</h2><p className="mt-1 text-muted-foreground">Pick the company you&apos;ll refer into.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Company">
            {LAUNCH_COMPANIES.map(item => (
              <button key={item.slug} type="button" role="radio" aria-checked={company === item.slug} onClick={() => setCompany(item.slug)} className={`flex min-h-14 items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${company === item.slug ? "border-primary bg-primary/5" : "border-border hover:border-foreground/40"}`}>
                <span className="company-mark">{item.initials}</span>
                <span className="min-w-0 flex-1"><strong className="block">{item.name}</strong><small className="text-muted-foreground">@{item.domain}</small></span>
                {company === item.slug ? <Check className="text-primary" /> : null}
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Company not listed? <Link href="/suggest-company" className="text-link">Suggest it</Link> — we add companies after review.</p>
          <div className="mt-8 flex justify-end"><Button onClick={() => setStep("email")}>Continue <ArrowRight /></Button></div>
        </div>
      ) : null}

      {step === "email" ? (
        <div>
          <Mail className="mb-3 text-primary" /><h2 className="text-2xl font-semibold">Your {selected.name} email</h2><p className="mt-1 text-muted-foreground">We&apos;ll send a 6-digit code. It expires in 10 minutes.</p>
          <label className="mt-6 block text-sm font-medium">Work email
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setEmailError(""); }} onKeyDown={event => { if (event.key === "Enter") void sendCode("email"); }} placeholder={`you@${selected.domain}`} aria-invalid={Boolean(emailError)} aria-describedby="email-msg" className={`mt-2 h-12 w-full rounded-xl border bg-background px-4 text-base ${emailError ? "border-destructive" : "border-input"}`} />
          </label>
          <p id="email-msg" role={emailError ? "alert" : undefined} className={`mt-2 flex items-start gap-2 text-sm ${emailError ? "text-destructive" : "text-muted-foreground"}`}>
            {emailError ? <><AlertTriangle className="mt-0.5 size-4 shrink-0" />{emailError}</> : <><LockKeyhole className="mt-0.5 size-4 shrink-0" />Used only to verify. Never shown, never used for marketing.</>}
          </p>
          <div className="mt-8 flex justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep("company")}><ArrowLeft />Back</Button>
            <Button disabled={sending} onClick={() => { void sendCode("email"); }}>{sending ? <><LoaderCircle className="animate-spin" />Sending…</> : <>Send code <ArrowRight /></>}</Button>
          </div>
        </div>
      ) : null}

      {step === "code" ? (
        <div>
          <ShieldCheck className="mb-3 text-primary" /><h2 className="text-2xl font-semibold">Enter the code</h2>
          <p className="mt-1 text-muted-foreground">Sent to <strong className="break-all text-foreground">{email.trim()}</strong>. <button type="button" className="text-link" onClick={backToEmail}>Change</button></p>
          <div className="mt-6 flex gap-2 sm:gap-3" role="group" aria-label="6-digit code">
            {code.map((digit, i) => (
              <input key={i} ref={element => { inputs.current[i] = element; }} value={digit} disabled={locked || Boolean(receipt)} onChange={event => setDigit(i, event.target.value)} onKeyDown={event => { if (event.key === "Backspace" && !digit && i > 0) inputs.current[i - 1]?.focus(); if (event.key === "Enter") void check(); }} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`Digit ${i + 1}`} className={`h-14 w-full min-w-0 max-w-14 rounded-xl border bg-background text-center text-2xl font-semibold ${codeError ? "border-destructive" : "border-input"} disabled:bg-muted disabled:text-muted-foreground`} />
            ))}
          </div>
          {codeError ? <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{codeError}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {resendIn > 0
              ? <span className="flex items-center gap-1"><Clock3 className="size-4" />Resend in {countdown(resendIn)}</span>
              : <button type="button" className="text-link flex items-center gap-1" disabled={sending} onClick={() => { void sendCode("code"); }}>{sending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{sending ? "Sending…" : "Resend code"}</button>}
            <span>Check spam or quarantine — some company filters hold codes.</span>
          </div>
          <div className="mt-8 flex justify-between gap-3">
            <Button variant="ghost" onClick={backToEmail}><ArrowLeft />Back</Button>
            <Button disabled={locked || verifying || (!receipt && entered.length < 6)} onClick={() => { void check(); }}>{verifying ? <><LoaderCircle className="animate-spin" />Verifying…</> : <>Verify <Check /></>}</Button>
          </div>
        </div>
      ) : null}

      {step === "done" ? <VerifiedPanel company={selected} /> : null}
    </VerifyLayout>
  );
}
