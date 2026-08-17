import { useState } from "react";
import { useSignIn, useSignUp } from "@clerk/react/legacy";
import { normalizeWorkEmail, workEmailError } from "@/lib/workEmail";

type Method = "email_code" | "email_link";
type Flow = "email" | "method" | "code" | "link";
type AttemptKind = "signIn" | "signUp";

const employeeEmailKey = "skipwait:employee-sign-in-email";

function isMissingIdentifier(error: unknown) {
  const entries = (error as { errors?: Array<{ code?: string }> })?.errors ?? [];
  return entries.some(entry => entry.code === "form_identifier_not_found");
}

function displayError(error: unknown, fallback: string) {
  const entries = (error as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors ?? [];
  return entries[0]?.longMessage || entries[0]?.message || (error instanceof Error ? error.message : fallback);
}

export function WorkEmailSignIn() {
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [flow, setFlow] = useState<Flow>("email");
  const [attemptKind, setAttemptKind] = useState<AttemptKind>("signIn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const normalizedEmail = normalizeWorkEmail(email);

  const rememberCompanyEmail = () => {
    if (typeof window !== "undefined") window.sessionStorage.setItem(employeeEmailKey, normalizedEmail);
  };

  const completeSession = async (result: { status?: string | null; createdSessionId?: string | null }, setActive: (params: { session: string }) => Promise<unknown>) => {
    if (result.status !== "complete" || !result.createdSessionId) throw new Error("We could not complete your secure work-email sign-in. Try the latest email again.");
    rememberCompanyEmail();
    await setActive({ session: result.createdSessionId });
  };

  const startSignUp = async (method: Method) => {
    if (!signUp) throw new Error("Secure employee sign-in is still loading. Try again in a moment.");
    const result = await signUp.create({ emailAddress: normalizedEmail });
    setAttemptKind("signUp");
    rememberCompanyEmail();
    if (result.status === "complete") {
      await completeSession(result, setActiveSignUp as (params: { session: string }) => Promise<unknown>);
      return;
    }
    if (method === "email_code") {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setFlow("code");
    } else {
      const emailLink = signUp.createEmailLinkFlow();
      await emailLink.startEmailLinkFlow({ redirectUrl: window.location.href });
      setFlow("link");
    }
  };

  const chooseMethod = async (method: Method) => {
    const validation = workEmailError(email);
    if (validation) { setError(validation); setFlow("email"); return; }
    if (!signInLoaded || !signUpLoaded || !signIn) { setError("Secure employee sign-in is still loading. Try again in a moment."); return; }
    setBusy(true); setError("");
    try {
      const result = await signIn.create({ identifier: normalizedEmail, transfer: false });
      setAttemptKind("signIn");
      rememberCompanyEmail();
      if (result.status === "complete") {
        await completeSession(result, setActiveSignIn as (params: { session: string }) => Promise<unknown>);
        return;
      }
      const factor = result.supportedFirstFactors?.find((candidate: { strategy?: string }) => candidate.strategy === method) as { emailAddressId?: string } | undefined;
      if (!factor?.emailAddressId) throw new Error("This company email is not set up for passwordless sign-in. Try the other email option.");
      if (method === "email_code") {
        await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
        setFlow("code");
      } else {
        await signIn.prepareFirstFactor({ strategy: "email_link", emailAddressId: factor.emailAddressId, redirectUrl: window.location.href });
        setFlow("link");
      }
    } catch (caught) {
      if (isMissingIdentifier(caught)) {
        try { await startSignUp(method); }
        catch (signUpError) { setError(displayError(signUpError, "We could not start secure company-email access.")); }
      } else setError(displayError(caught, "We could not start secure company-email access."));
    } finally { setBusy(false); }
  };

  const confirmCode = async () => {
    if (code.length !== 6) { setError("Enter the six-digit code from your company email."); return; }
    if (!signIn || !signUp) { setError("Secure employee sign-in is still loading. Try again in a moment."); return; }
    setBusy(true); setError("");
    try {
      if (attemptKind === "signIn") {
        const result = await signIn.attemptFirstFactor({ strategy: "email_code", code });
        await completeSession(result, setActiveSignIn as (params: { session: string }) => Promise<unknown>);
      } else {
        const result = await signUp.attemptEmailAddressVerification({ code });
        await completeSession(result, setActiveSignUp as (params: { session: string }) => Promise<unknown>);
      }
    } catch (caught) { setError(displayError(caught, "That code could not be verified. Check the latest code and try again.")); }
    finally { setBusy(false); }
  };

  if (flow === "email") return <div className="mt-7"><label className="block text-xs font-semibold text-slate-700">Company email<input aria-label="Company email for secure employee sign in" value={email} onChange={event => { setEmail(event.target.value); setError(""); }} type="email" autoComplete="email" placeholder="you@company.com" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#0B57D0]" /></label><p className="mt-2 text-xs leading-5 text-slate-500">Personal email providers, passwords, and social sign-in are not used for private referral access.</p>{error && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}<button type="button" onClick={() => { const validation = workEmailError(email); if (validation) { setError(validation); return; } setFlow("method"); }} className="mt-4 inline-flex rounded-lg bg-[#0B57D0] px-5 py-3 text-sm font-semibold text-white">Continue with work email</button></div>;

  if (flow === "method") return <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-900">How should we verify {normalizedEmail}?</p><p className="mt-1 text-xs leading-5 text-slate-600">Choose either option. Both go only to this company email.</p>{error && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}<div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy} onClick={() => { void chooseMethod("email_code"); }} className="rounded-lg bg-[#0B57D0] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Sending…" : "Send one-time code"}</button><button type="button" disabled={busy} onClick={() => { void chooseMethod("email_link"); }} className="rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-[#0B57D0] disabled:opacity-50">Email secure link</button></div><button type="button" disabled={busy} onClick={() => { setFlow("email"); setError(""); }} className="mt-3 text-xs font-semibold text-slate-600 underline">Use a different company email</button></div>;

  if (flow === "code") return <div className="mt-7 rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-semibold text-slate-900">Code sent to {normalizedEmail}</p><label className="mt-3 block text-xs font-semibold text-slate-700">One-time code<input aria-label="Secure employee sign-in code" value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="mt-1.5 w-full rounded-lg border border-blue-100 bg-white px-3 py-3 text-sm font-semibold tracking-[.32em] outline-none focus:border-[#0B57D0]" /></label>{error && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || code.length < 6} onClick={() => { void confirmCode(); }} className="rounded-lg bg-[#0B57D0] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Verifying…" : "Verify code"}</button><button type="button" disabled={busy} onClick={() => { setFlow("method"); setCode(""); setError(""); }} className="rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-[#0B57D0]">Use secure link instead</button></div></div>;

  return <div className="mt-7 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-900">Secure link sent to {normalizedEmail}</p><p className="mt-1 text-xs leading-5 text-emerald-800">Open the latest link in that email to continue privately. It is valid for a limited time.</p><button type="button" disabled={busy} onClick={() => { setFlow("method"); setError(""); }} className="mt-3 text-xs font-semibold text-emerald-900 underline">Choose a different verification method</button></div>;
}
