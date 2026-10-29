// Goal /verify (D-048-p3-verify; packet docs/plans/D-048-auth.md).
// Goal-first rebuild of the work-email code step a referrer must pass before
// they can review a referral request. /verify is wrapped in AppShell, whose
// W0 frame is already the goal shell, so this body carries no second frame.
// The data and API flow is the kit page's, imported read-only: the directory
// hook, verifyApi's three calls, referrerData's two reads and
// referrerSignInHref. Nothing here changes who may sign in or what a code
// proves (D-030, D-049, D-057).
import { ArrowLeft, ArrowRight, BadgeCheck, Check, Clock3, LockKeyhole, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalField, GoalNextStep, GoalSkeletonRows, GoalTextInput, useOnlineStatus } from "@/components/goal";
import { checkWorkEmailCode, enrollWorkEmail, sendWorkEmailCode, VerifyRequestError } from "@/components/verify/verifyApi";
import { fetchProfileHandle, fetchReferrerPreferences, type TokenSource } from "@/components/referrer-home/referrerData";
import { usePersistFn } from "@/hooks/usePersistFn";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { useCompanyDirectory, type PublicCompany } from "@/lib/companyDirectory";

export const GOAL_PAGE = { goalLine: "Refer someone at your company." } as const;

// Client-side pre-checks and the resend window mirror the kit page's own
// behaviour (Verify.tsx): the server stays the authority for every one of
// them, and every server answer is shown in the server's words.
const PERSONAL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me"];
const MAX_ATTEMPTS = 5;
/** The server accepts one code request per email per 30 seconds. */
const RESEND_SECONDS = 30;
const EMPTY_CODE = ["", "", "", "", "", ""];
const LOCKED_MESSAGE = "Too many tries. For your safety, wait 15 minutes, then send a new code.";
const DEFAULT_COMPANY = "wipro";

type Step = "company" | "email" | "code" | "done";
const STEP_ORDER: Step[] = ["company", "email", "code", "done"];
const STAGES = ["Company", "Work email", "Code", "Verified"] as const;

const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);
const countdown = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Where "View my profile" goes: the public page when a handle exists, else the handle field. */
const profileHref = (handle: string | null | undefined) => (handle ? `/p/${encodeURIComponent(handle)}` : "/profile?focus=handle");

/** Dot-and-text stages: /verify's four steps map onto none of GoalStatus's ask states. */
function StageLine({ current }: { current: number }) {
  return (
    <ol className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Verification progress">
      {STAGES.map((label, index) => (
        <li key={label} aria-current={index === current ? "step" : undefined} className="flex items-center gap-2">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${index <= current ? "bg-g-ink" : "bg-g-hairline"}`} />
          <span className={`text-g-meta ${index === current ? "font-semibold text-g-ink" : "text-g-ink-3"}`}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** The one frame every state shares: the goal line is the only h1 on the page. */
function Frame({ screen, stage, children }: { screen: string; stage: number; children: ReactNode }) {
  return (
    <main data-skipwait-screen={screen} data-goal-page="verify" className="g-scope mx-auto w-full max-w-[1120px] bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-8 gdesk:py-8">
      <header className="max-w-[720px]">
        <h1 className="text-balance text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
        <p className="mt-3 max-w-[620px] text-g-body text-g-ink-2">A one-time code to your work email confirms where you work today. People see a verified badge — never your address.</p>
      </header>
      <StageLine current={stage} />
      <div className="mt-6 max-w-[760px]">{children}</div>
    </main>
  );
}

function Stage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h2 className="text-g-heading text-g-ink">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The done panel. Both reads are independent and neither blocks the badge:
 * a failed preference read drops the function name, a failed handle read
 * falls back to the handle field.
 */
function VerifiedResult({ company, fetchToken }: { company: Pick<PublicCompany, "name" | "initials">; fetchToken: TokenSource }) {
  const preferences = useQuery({ queryKey: ["goal-verify", "referrer-preferences"], queryFn: () => fetchReferrerPreferences(fetchToken), retry: false, staleTime: 60_000 });
  const handle = useQuery({ queryKey: ["goal-verify", "profile-handle"], queryFn: () => fetchProfileHandle(fetchToken), retry: false, staleTime: 60_000 });
  const primaryFunction = preferences.data?.preferAreas[0];
  return (
    <>
      <div className="mt-3 flex items-center gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-g-tile border border-g-hairline"><BadgeCheck className="size-5 text-g-ink" strokeWidth={1.75} /></span>
        <p className="text-g-heading text-g-ink">You&apos;re verified at {company.name}.</p>
      </div>
      <p className="mt-3 text-g-meta leading-[1.6] text-g-ink-2">People whose referral requests you review see a verified badge at {company.name}. Your name and address stay hidden until you accept one.</p>
      <div className="mt-4 rounded-g-tile border border-g-hairline p-4">
        <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">What people see</p>
        <div className="mt-3 flex items-center gap-3">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-g-tile border border-g-hairline text-g-meta font-semibold">{company.initials}</span>
          <span>
            <strong className="flex items-center gap-1 text-g-label text-g-ink">Someone at {company.name} <BadgeCheck aria-hidden="true" className="size-4" strokeWidth={1.75} /></strong>
            <small className="block text-g-meta text-g-ink-3">Verified via work email{primaryFunction ? ` · ${primaryFunction}` : ""}</small>
          </span>
        </div>
      </div>
      <p className="mt-3 text-g-meta text-g-ink-3">Your badge stays on your account. Verify again here if your work email changes.</p>
      <div className="mt-4">
        <GoalButton variant="outline" asChild><Link href={profileHref(handle.data)}>View my profile</Link></GoalButton>
      </div>
    </>
  );
}

export default function GoalVerify() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
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
  // A correct code yields a single-use receipt; keep it in memory only, so a
  // failed enrolment retries without spending a new code.
  const [receipt, setReceipt] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
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
      <Frame screen="verify-loading" stage={0}>
        <p role="status" className="text-g-meta text-g-ink-2">Checking your sign-in…</p>
        <GoalSkeletonRows density="company" count={3} className="mt-4 px-0" />
      </Frame>
    );
  }

  if (!isSignedIn) {
    return (
      <Frame screen="verify-signed-out" stage={0}>
        <GoalNextStep reason="A work-email sign-in comes first, then the one-time code that proves where you work today.">
          <Stage title="Sign in to verify">
            <p className="mt-2 flex items-start gap-2 text-g-meta leading-[1.6] text-g-ink-2"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />Work email only. Never a personal address, never a social login.</p>
            <div className="mt-5">
              <GoalButton variant="primary" touch="large" asChild>
                <Link href={referrerSignInHref(typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/verify")}>Sign in with work email<ArrowRight className="size-4" aria-hidden="true" /></Link>
              </GoalButton>
            </div>
          </Stage>
        </GoalNextStep>
      </Frame>
    );
  }

  if (step === "done" && selected) {
    return (
      <Frame screen="verify-done" stage={3}>
        <GoalNextStep reason="Choose the roles you can review and how many referral requests fit your week.">
          <VerifiedResult company={selected} fetchToken={fetchToken} />
          <div className="mt-5">
            <GoalButton variant="primary" touch="large" asChild><Link href="/referrer-setup">Set up referring<ArrowRight className="size-4" aria-hidden="true" /></Link></GoalButton>
          </div>
        </GoalNextStep>
      </Frame>
    );
  }

  if (step === "company") {
    return (
      <Frame screen="verify-company" stage={0}>
        <GoalNextStep reason={directory.isError ? "We could not load the companies. Try again to see who you can verify at." : "Pick the company you can open a work email at today."}>
          <Stage title="Where do you work?">
            {directory.data ? (companies.length ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Company">
                {companies.map(item => (
                  <button key={item.slug} type="button" role="radio" aria-checked={selected?.slug === item.slug} onClick={() => setCompany(item.slug)} className={`flex min-h-14 items-center gap-3 rounded-g-tile border p-3 text-left transition-colors ${selected?.slug === item.slug ? "border-g-ink" : "border-g-hairline hover:border-g-control-edge"}`}>
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-g-tile border border-g-hairline text-g-meta font-semibold">{item.initials}</span>
                    <span className="min-w-0 flex-1"><strong className="block text-g-label text-g-ink">{item.name}</strong><small className="block text-g-meta text-g-ink-3">@{item.domains[0]}</small></span>
                    {selected?.slug === item.slug ? <Check aria-hidden="true" className="size-4 shrink-0 text-g-ink" strokeWidth={1.75} /> : null}
                  </button>
                ))}
              </div>
            ) : <p className="mt-4 rounded-g-tile bg-g-surface-hover p-4 text-g-meta text-g-ink-2">No companies are open for verification yet.</p>)
              : directory.isError ? (
                <p role="alert" className="mt-4 rounded-g-tile border border-g-crimson p-4 text-g-meta text-g-ink">{directory.error.message}</p>
              ) : <GoalSkeletonRows density="company" count={4} className="mt-4 px-0" />}
            <p className="mt-4 text-g-meta text-g-ink-3">Company not listed? <Link href="/suggest-company" className="underline underline-offset-2 hover:no-underline">Suggest it</Link> — we add companies after review.</p>
            <div className="mt-5">
              {directory.isError ? (
                <GoalButton variant="primary" touch="large" busy={directory.isFetching} busyLabel="Trying again…" onClick={() => { void directory.refetch(); }}>Try again</GoalButton>
              ) : (
                <GoalButton variant="primary" touch="large" disabledReason={selected ? undefined : "No company is open for verification yet"} onClick={() => setStep("email")}>Continue<ArrowRight className="size-4" aria-hidden="true" /></GoalButton>
              )}
            </div>
          </Stage>
        </GoalNextStep>
      </Frame>
    );
  }

  if (step === "email") {
    return (
      <Frame screen="verify-email" stage={1}>
        <GoalNextStep reason="We send a six-digit code to that address. It expires in 10 minutes.">
          <Stage title={`Your ${selected?.name ?? "work"} email`}>
            <div className="mt-4">
              <GoalField label="Work email" htmlFor="goal-verify-email" help="Used only to verify. Never shown, never used for marketing.">
                <GoalTextInput
                  id="goal-verify-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  invalid={Boolean(emailError)}
                  onChange={event => { setEmail(event.target.value); setEmailError(""); }}
                  onKeyDown={event => { if (event.key === "Enter") void sendCode("email"); }}
                  placeholder={`you@${primaryDomain || "company.com"}`}
                />
              </GoalField>
              {emailError ? <p role="alert" className="mt-2 text-g-meta text-g-crimson">{emailError}</p> : null}
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <GoalButton variant="ghost" onClick={() => setStep("company")}><ArrowLeft className="size-4" aria-hidden="true" />Back</GoalButton>
              <GoalButton variant="primary" touch="large" busy={sending} busyLabel="Sending…" disabledReason={!online ? "Reconnect to send the code." : undefined} onClick={() => { void sendCode("email"); }}>Send code<ArrowRight className="size-4" aria-hidden="true" /></GoalButton>
            </div>
          </Stage>
        </GoalNextStep>
      </Frame>
    );
  }

  return (
    <Frame screen="verify-code" stage={2}>
      <GoalNextStep reason="Enter the six digits from your work email.">
        <Stage title="Enter the code">
          <p className="mt-2 text-g-meta text-g-ink-2">Sent to <strong className="break-all text-g-ink">{email.trim()}</strong>. <button type="button" className="underline underline-offset-2 hover:no-underline" onClick={backToEmail}>Change</button></p>
          <div className="mt-4 flex gap-2 sm:gap-3" role="group" aria-label="6-digit code">
            {code.map((digit, i) => (
              <input
                key={i}
                ref={element => { inputs.current[i] = element; }}
                value={digit}
                disabled={locked || Boolean(receipt)}
                onPaste={pasteCode}
                onChange={event => setDigit(i, event.target.value)}
                onKeyDown={event => { if (event.key === "Backspace" && !digit && i > 0) inputs.current[i - 1]?.focus(); if (event.key === "Enter") void check(); }}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${i + 1}`}
                className={`h-14 w-full min-w-0 max-w-14 rounded-g-control border bg-g-surface text-center text-g-heading text-g-ink disabled:bg-g-surface-hover disabled:text-g-ink-3 ${codeError ? "border-g-crimson" : "border-g-control-edge"}`}
              />
            ))}
          </div>
          {codeError ? <p role="alert" className="mt-3 flex items-start gap-2 text-g-meta text-g-crimson"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{codeError}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-g-meta text-g-ink-3">
            {resendIn > 0
              ? <span className="flex items-center gap-1"><Clock3 aria-hidden="true" className="size-4" />Resend in {countdown(resendIn)}</span>
              : <button type="button" className="flex items-center gap-1 underline underline-offset-2 hover:no-underline" disabled={sending} onClick={() => { void sendCode("code"); }}><RefreshCw aria-hidden="true" className="size-4" />{sending ? "Sending…" : "Resend code"}</button>}
            <span>Check spam or quarantine — some company filters hold codes.</span>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <GoalButton variant="ghost" onClick={backToEmail}><ArrowLeft className="size-4" aria-hidden="true" />Back</GoalButton>
            <GoalButton variant="primary" touch="large" busy={verifying} busyLabel="Verifying…" disabledReason={!online ? "Reconnect to verify the code." : locked ? LOCKED_MESSAGE : !receipt && entered.length < 6 ? "Enter all six digits first" : undefined} onClick={() => { void check(); }}>Verify<Check className="size-4" aria-hidden="true" /></GoalButton>
          </div>
        </Stage>
      </GoalNextStep>
    </Frame>
  );
}
