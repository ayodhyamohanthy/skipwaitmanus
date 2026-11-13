import { AlertTriangle, ArrowLeft, ArrowRight, Building2, Check, Clock3, LoaderCircle, LockKeyhole, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { LoadingNote } from "@/components/app-states/SystemStates";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { Button, buttonVariants } from "@/components/kit/button";
import { VerifiedPanel, VerifyLayout, VerifyProgress } from "@/components/verify/VerifyPanels";
import { VerifyRequestError, checkWorkEmailCode, enrollWorkEmail, sendWorkEmailCode } from "@/components/verify/verifyApi";
import { usePersistFn } from "@/hooks/usePersistFn";
import { useCompanyDirectory } from "@/lib/companyDirectory";
import GoalVerify from "@/pages/goal/verify/GoalVerify";
import { goalSurfaceOn } from "@/lib/goalSurfaces";

const PERSONAL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me"];
const MAX_ATTEMPTS = 5;
/** The server accepts one code request per email per 30 seconds; a shorter
 * countdown would invite a resend the server is certain to refuse. */
const RESEND_SECONDS = 30;
const EMPTY_CODE = ["", "", "", "", "", ""];
const LOCKED_MESSAGE = "Too many tries. For your safety, wait 15 minutes, then send a new code.";
const DEFAULT_COMPANY = "wipro";
type Step = "company" | "email" | "code" | "done";
const STEP_ORDER: Step[] = ["company", "email", "code", "done"];

const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);
const countdown = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export default function Verify() {
  // Goal-UI migration (D-120): the goal verify page replaces this page when its
  // build flag is on; the kit page below stays the default until QA passes.
  if (goalSurfaceOn("verify")) return <GoalVerify />;
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
  // The verifiable companies and their email domains come from the server directory.
  const directory = useCompanyDirectory();
  const companies = directory.data?.companies ?? [];
  const selected = companies.find(item => item.slug === company) ?? companies.find(item => item.slug === DEFAULT_COMPANY) ?? companies[0];
  const primaryDomain = selected?.domains[0] ?? "";
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
    if (!selected) { setStep("company"); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setEmailError(`Enter a full email address, like you@${primaryDomain}`); return; }
    if (PERSONAL_DOMAINS.includes(domain)) { setEmailError(`Personal inboxes can't prove where you work. Use your ${selected.name} email.`); return; }
    if (!selected.domains.includes(domain)) { setEmailError(`This doesn't match ${selected.name}. ${selected.name} emails end in @${primaryDomain}.`); return; }
    if (sending) return;
    showError(""); setSending(true);
    try {
      await sendWorkEmailCode(email.trim(), fetchToken);
      setCode(EMPTY_CODE); setCodeError(""); setAttempts(0); setReceipt(""); setResendIn(RESEND_SECONDS); setStep("code");
      setTimeout(() => inputs.current[0]?.focus(), 50);
    } catch (reason) { showError(messageOf(reason, "We could not send the verification code")); }
    finally { setSending(false); }
  };

  // Paste lands in whichever box has focus. A 6-digit code always fills the
  // row from the first box, so no leading digit is lost to an occupied box.
  const pasteCode = (event: ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (digits.length < 2) return;
    event.preventDefault();
    setCodeError("");
    setCode([...digits.split(""), ...EMPTY_CODE.slice(digits.length)]);
    inputs.current[Math.min(digits.length, 5)]?.focus();
  };

  const setDigit = (index: number, value: string) => {
    let digits = value.replace(/\D/g, "");
    setCodeError("");
    // Typing over a filled box gives two characters; keep the one just typed.
    if (digits.length === 2 && code[index]) digits = digits.slice(-1);
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
          if (reason instanceof VerifyRequestError && reason.status === 429) { setAttempts(MAX_ATTEMPTS); setCodeError(LOCKED_MESSAGE); return; }
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
        <LoadingNote>Checking your sign-in…</LoadingNote>
      </VerifyLayout>
    );
  }

  if (!isSignedIn) {
    return (
      <VerifyLayout screen="verify-sign-in" company={selected}>
        <VerifyProgress stepIndex={0} />
        <LockKeyhole className="mb-3 text-primary" /><h2 className="text-2xl font-semibold">Sign in to verify</h2>
        <p className="mt-1 text-muted-foreground">Sign in first — then a one-time code to your work email confirms your company.</p>
        <div className="mt-8 flex justify-end"><Link href={referrerSignInHref(typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/verify")} className={buttonVariants()}>Sign in with work email <ArrowRight /></Link></div>
      </VerifyLayout>
    );
  }

  return (
    <VerifyLayout screen="verify" company={selected}>
      <VerifyProgress stepIndex={STEP_ORDER.indexOf(step)} />

      {step === "company" ? (
        <div>
          <Building2 className="mb-3 text-primary" /><h2 className="text-2xl font-semibold">Where do you work?</h2><p className="mt-1 text-muted-foreground">Pick the company you&apos;ll refer into.</p>
          {directory.data ? (companies.length ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Company">
              {companies.map(item => (
                <button key={item.slug} type="button" role="radio" aria-checked={selected?.slug === item.slug} onClick={() => setCompany(item.slug)} className={`flex min-h-14 items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${selected?.slug === item.slug ? "border-primary bg-primary/5" : "border-border hover:border-foreground/40"}`}>
                  <span className="company-mark">{item.initials}</span>
                  <span className="min-w-0 flex-1"><strong className="block">{item.name}</strong><small className="text-muted-foreground">@{item.domains[0]}</small></span>
                  {selected?.slug === item.slug ? <Check className="text-primary" /> : null}
                </button>
              ))}
            </div>
          ) : <p className="mt-6 rounded-2xl bg-muted p-4 text-sm">No companies are open for verification yet.</p>)
            : directory.isError ? (
              <p role="alert" className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive p-4 text-sm"><AlertTriangle className="size-4 shrink-0 text-destructive" /><span className="flex-1">{directory.error.message}</span><Button variant="outline" size="sm" disabled={directory.isFetching} onClick={() => { void directory.refetch(); }}><RefreshCw />Try again</Button></p>
            ) : (
              <div className="mt-6 grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading companies">{[0, 1, 2, 3].map(index => <span key={index} className="block min-h-14 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />)}</div>
            )}
          <p className="mt-4 text-sm text-muted-foreground">Company not listed? <Link href="/suggest-company" className="text-link">Suggest it</Link> — we add companies after review.</p>
          <div className="mt-8 flex justify-end"><Button disabled={!selected} onClick={() => setStep("email")}>Continue <ArrowRight /></Button></div>
        </div>
      ) : null}

      {step === "email" ? (
        <div>
          <Mail className="mb-3 text-primary" /><h2 className="text-2xl font-semibold">Your {selected?.name ?? "work"} email</h2><p className="mt-1 text-muted-foreground">We&apos;ll send a 6-digit code. It expires in 10 minutes.</p>
          <label className="mt-6 block text-sm font-medium">Work email
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setEmailError(""); }} onKeyDown={event => { if (event.key === "Enter") void sendCode("email"); }} placeholder={`you@${primaryDomain || "company.com"}`} aria-invalid={Boolean(emailError)} aria-describedby="email-msg" className={`mt-2 h-12 w-full rounded-xl border bg-background px-4 text-base ${emailError ? "border-destructive" : "border-input"}`} />
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
              <input key={i} ref={element => { inputs.current[i] = element; }} value={digit} disabled={locked || Boolean(receipt)} onPaste={pasteCode} onChange={event => setDigit(i, event.target.value)} onKeyDown={event => { if (event.key === "Backspace" && !digit && i > 0) inputs.current[i - 1]?.focus(); if (event.key === "Enter") void check(); }} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`Digit ${i + 1}`} className={`h-14 w-full min-w-0 max-w-14 rounded-xl border bg-background text-center text-2xl font-semibold ${codeError ? "border-destructive" : "border-input"} disabled:bg-muted disabled:text-muted-foreground`} />
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

      {step === "done" && selected ? <VerifiedPanel company={selected} getToken={fetchToken} /> : null}
    </VerifyLayout>
  );
}
