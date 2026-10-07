import { AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Building2, Check, Clock3, LockKeyhole, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link, useLocation } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

type Company = { name: string; slug: string; initials: string; domain: string };
const COMPANIES: Company[] = [
  { name: "SkipWait", slug: "skipwait", initials: "SW", domain: "skipwait.me" },
  { name: "Wipro", slug: "wipro", initials: "W", domain: "wipro.com" },
  { name: "Go Neutrinos", slug: "go-neutrinos", initials: "GN", domain: "goneutrinos.com" },
  { name: "TCS", slug: "tcs", initials: "T", domain: "tcs.com" },
  { name: "Merkle", slug: "merkle", initials: "M", domain: "merkle.com" },
];
const PERSONAL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me"];
const MAX_ATTEMPTS = 5;
type Step = "company" | "email" | "code" | "done";

export default function Verify() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [step, setStep] = useState<Step>("company");
  const [company, setCompany] = useState("wipro");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [codeError, setCodeError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const [validUntil, setValidUntil] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const selected = COMPANIES.find(item => item.slug === company) ?? COMPANIES[1];
  const locked = attempts >= MAX_ATTEMPTS;

  useEffect(() => {
    if (step !== "code" || resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, resendIn]);

  const postOtp = async (path: string, body: unknown) => {
    const token = await fetchToken();
    const response = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const payload = await readApiJson<{ sent?: boolean; verified?: boolean; receipt?: unknown; expiresAt?: string; error?: string; retryAfterSeconds?: number }>(response, "Work-email verification is unavailable right now");
    if (!response.ok) {
      const retry = typeof payload.retryAfterSeconds === "number" ? payload.retryAfterSeconds : 0;
      throw new Error(payload.error || "Work-email verification is unavailable right now" + (retry > 0 ? ` Try again in ${Math.ceil(retry / 60)} minutes.` : ""));
    }
    return payload;
  };

  const sendCode = async () => {
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setEmailError(`Enter a full email address, like you@${selected.domain}`); return; }
    if (PERSONAL_DOMAINS.includes(domain)) { setEmailError(`Personal inboxes can't prove where you work. Use your ${selected.name} email.`); return; }
    if (domain !== selected.domain) { setEmailError(`This doesn't match ${selected.name}. ${selected.name} emails end in @${selected.domain}.`); return; }
    setEmailError(""); setSending(true);
    try {
      await postOtp("/api/work-email/otp/send", { email });
      setCode(["", "", "", "", "", ""]); setCodeError(""); setAttempts(0); setResendIn(30); setStep("code");
      setTimeout(() => inputs.current[0]?.focus(), 50);
    } catch (reason) { setEmailError(reason instanceof Error ? reason.message : "We could not send the verification code"); }
    finally { setSending(false); }
  };

  const setDigit = (index: number, value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length > 1) {
      const next = digits.slice(0, 6).split("");
      setCode([...next, ...Array(6 - next.length).fill("")]);
      inputs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    const next = [...code];
    next[index] = digits;
    setCode(next); setCodeError("");
    if (digits && index < 5) inputs.current[index + 1]?.focus();
  };

  const check = async () => {
    if (code.join("").length < 6 || verifying || locked) return;
    setVerifying(true); setCodeError("");
    try {
      const payload = await postOtp("/api/work-email/otp/verify", { email, code: code.join("") });
      if (payload.verified) {
        if (typeof payload.expiresAt === "string") setValidUntil(payload.expiresAt);
        setStep("done");
      }
    } catch (reason) {
      const count = attempts + 1;
      setAttempts(count);
      setCodeError(count >= MAX_ATTEMPTS
        ? "Too many tries. For your safety, wait 15 minutes before trying again."
        : `${reason instanceof Error ? reason.message : "That code isn't right."} ${MAX_ATTEMPTS - count} ${MAX_ATTEMPTS - count === 1 ? "try" : "tries"} left.`);
    } finally { setVerifying(false); }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="verify-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">Referrer verification</p>
        <h1 className="mt-2 text-3xl font-semibold">Prove you&apos;re inside.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Sign in first — a one-time code to your work email confirms your company. Seekers see a Verified badge, never your email.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  const stepIndex = ["company", "email", "code", "done"].indexOf(step);
  return (
    <main data-skipwait-screen="verify" className="page-content">
      <div className="mb-6"><span className="eyebrow">Referrer verification</span><h1 className="mt-2 text-4xl font-semibold">Prove you&apos;re inside<span className="brand-dot">.</span></h1><p className="mt-2 max-w-xl text-[var(--muted-foreground)]">A one-time code to your work email. Seekers see a &ldquo;Verified&rdquo; badge — never your email address.</p></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-8">
          <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Verification progress">
            {["Company", "Work email", "Code", "Verified"].map((label, i) => (
              <li key={label} className="min-w-0">
                <span className={`block h-1.5 rounded-full ${i <= stepIndex ? "bg-[var(--primary)]" : "bg-[var(--muted)]"}`} />
                <span className={`mt-2 block truncate text-xs ${i === stepIndex ? "font-semibold" : "text-[var(--muted-foreground)]"}`}>{label}</span>
              </li>
            ))}
          </ol>

          {step === "company" ? (
            <div>
              <Building2 className="mb-3 text-[var(--primary)]" /><h2 className="text-2xl font-semibold">Where do you work?</h2><p className="mt-1 text-[var(--muted-foreground)]">Pick the company you&apos;ll refer into.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Company">
                {COMPANIES.map(item => (
                  <button key={item.slug} type="button" role="radio" aria-checked={company === item.slug} onClick={() => setCompany(item.slug)} className={`flex min-h-14 items-center gap-3 rounded-2xl border p-3 text-left ${company === item.slug ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
                    <span className="company-mark">{item.initials}</span>
                    <span className="min-w-0 flex-1"><strong className="block">{item.name}</strong><small className="text-[var(--muted-foreground)]">@{item.domain}</small></span>
                    {company === item.slug ? <Check className="text-[var(--primary)]" /> : null}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-sm text-[var(--muted-foreground)]">Company not listed? More companies open as verified referrers join.</p>
              <div className="mt-8 flex justify-end"><button type="button" className="brand-button" onClick={() => setStep("email")}>Continue <ArrowRight /></button></div>
            </div>
          ) : null}

          {step === "email" ? (
            <div>
              <Mail className="mb-3 text-[var(--primary)]" /><h2 className="text-2xl font-semibold">Your {selected.name} email</h2><p className="mt-1 text-[var(--muted-foreground)]">We&apos;ll send a 6-digit code. It expires in 10 minutes.</p>
              <label className="mt-6 block text-sm font-medium">Work email
                <input type="email" inputMode="email" autoComplete="email" value={email} onChange={event => { setEmail(event.target.value); setEmailError(""); }} onKeyDown={event => { if (event.key === "Enter") void sendCode(); }} placeholder={`you@${selected.domain}`} aria-invalid={Boolean(emailError)} className={`mt-2 h-12 w-full rounded-xl border bg-[var(--background)] px-4 text-base ${emailError ? "border-[var(--destructive)]" : "border-[var(--input)]"}`} />
              </label>
              <p className={`mt-2 flex items-start gap-2 text-sm ${emailError ? "text-[var(--destructive)]" : "text-[var(--muted-foreground)]"}`}>
                {emailError ? <><AlertTriangle className="mt-0.5 size-4 shrink-0" />{emailError}</> : <><LockKeyhole className="mt-0.5 size-4 shrink-0" />Used only to verify. Never shown, never used for marketing.</>}
              </p>
              <div className="mt-8 flex justify-between gap-3">
                <button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={() => setStep("company")}><ArrowLeft />Back</button>
                <button type="button" className="brand-button" disabled={sending} onClick={() => { void sendCode(); }}>{sending ? "Sending…" : <>Send code <ArrowRight /></>}</button>
              </div>
            </div>
          ) : null}

          {step === "code" ? (
            <div>
              <ShieldCheck className="mb-3 text-[var(--primary)]" /><h2 className="text-2xl font-semibold">Enter the code</h2>
              <p className="mt-1 text-[var(--muted-foreground)]">Sent to <strong className="break-all">{email}</strong>. <button type="button" className="text-link" onClick={() => setStep("email")}>Change</button></p>
              <div className="mt-6 flex gap-2 sm:gap-3" role="group" aria-label="6-digit code">
                {code.map((digit, i) => (
                  <input key={i} ref={element => { inputs.current[i] = element; }} value={digit} disabled={locked} onChange={event => setDigit(i, event.target.value)} onKeyDown={event => { if (event.key === "Backspace" && !digit && i > 0) inputs.current[i - 1]?.focus(); if (event.key === "Enter") void check(); }} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} aria-label={`Digit ${i + 1}`} className={`h-14 w-full min-w-0 max-w-14 rounded-xl border bg-[var(--background)] text-center text-2xl font-semibold ${codeError ? "border-[var(--destructive)]" : "border-[var(--input)]"}`} />
                ))}
              </div>
              {codeError ? <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-[var(--destructive)]"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{codeError}</p> : null}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--muted-foreground)]">
                {resendIn > 0 ? <span className="flex items-center gap-1"><Clock3 className="size-4" />Resend in 0:{String(resendIn).padStart(2, "0")}</span> : <button type="button" className="text-link" onClick={() => { void sendCode(); }}><RefreshCw className="size-4" />Resend code</button>}
                <span>Check spam or quarantine — some company filters hold codes.</span>
              </div>
              <div className="mt-8 flex justify-between gap-3">
                <button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={() => setStep("email")}><ArrowLeft />Back</button>
                <button type="button" className="brand-button" disabled={locked || code.join("").length < 6 || verifying} onClick={() => { void check(); }}>{verifying ? "Verifying…" : <>Verify <Check /></>}</button>
              </div>
            </div>
          ) : null}

          {step === "done" ? (
            <div className="text-center">
              <span className="mx-auto mb-4 grid size-20 place-items-center rounded-full bg-[var(--accent)]"><BadgeCheck className="size-10 text-[var(--primary)]" /></span>
              <h2 className="text-2xl font-semibold">You&apos;re verified at {selected.name}.</h2>
              <p className="mx-auto mt-2 max-w-md text-[var(--muted-foreground)]">Seekers now see a &ldquo;Verified at {selected.name}&rdquo; badge. Your name and email stay hidden until you accept a request.</p>
              <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-[var(--border)] p-4 text-left">
                <span className="eyebrow">What seekers see</span>
                <div className="mt-3 flex items-center gap-3">
                  <span className="company-mark">{selected.initials}</span>
                  <span><strong className="flex items-center gap-1">Someone at {selected.name} <BadgeCheck className="size-4 text-[var(--primary)]" /></strong></span>
                </div>
              </div>
              <p className="mt-4 text-sm text-[var(--muted-foreground)]">{validUntil ? `Valid until ${new Date(validUntil).toLocaleDateString()}. Re-verify any time from Settings.` : "We'll ask you to re-verify periodically, or sooner if your company email stops working."}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <button type="button" className="brand-button" onClick={() => go("/referrer-setup")}>Set up referring <ArrowRight /></button>
              </div>
            </div>
          ) : null}
        </section>
        <aside className="space-y-4">
          <div className="rounded-3xl bg-[var(--muted)] p-5"><span className="eyebrow">Why a code?</span><p className="mt-2 text-sm">It proves you can receive email at {selected.name} today. It doesn&apos;t prove your role or that {selected.name} endorses SkipWait.</p></div>
          <div className="rounded-3xl border border-[var(--border)] p-5 text-sm"><span className="eyebrow">We store</span><ul className="mt-2 space-y-2"><li className="flex gap-2"><Check className="size-4 shrink-0 text-[var(--primary)]" />A one-way fingerprint of your email</li><li className="flex gap-2"><Check className="size-4 shrink-0 text-[var(--primary)]" />Company and verification date</li><li className="flex gap-2"><Check className="size-4 shrink-0 text-[var(--primary)]" />Never the code or your inbox</li></ul></div>
          <div className="rounded-3xl border border-[var(--border)] p-5 text-sm"><span className="eyebrow">Left your company?</span><p className="mt-2 text-[var(--muted-foreground)]">Your badge is removed at the next re-check. Open requests are returned to seekers with a kind note.</p></div>
        </aside>
      </div>
    </main>
  );
}
