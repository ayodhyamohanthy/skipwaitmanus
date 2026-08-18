import { useState } from "react";
import { useSignIn, useSignUp } from "@clerk/react/legacy";
import { normalizeWorkEmail, workEmailError } from "@/lib/workEmail";

type Flow = "email" | "code";
type AttemptKind = "signIn" | "signUp";

const employeeEmailKey = "skipwait:employee-sign-in-email";
export const coverageInviteSessionKey = "skipwait:company-coverage-invite";

function isMissingIdentifier(error: unknown) {
  const entries = (error as { errors?: Array<{ code?: string }> })?.errors ?? [];
  return entries.some(entry => entry.code === "form_identifier_not_found");
}

function isExistingIdentifier(error: unknown) {
  const entries = (error as { errors?: Array<{ code?: string }> })?.errors ?? [];
  return entries.some(entry => entry.code === "form_identifier_exists");
}

function displayError(error: unknown, fallback: string) {
  if (isExistingIdentifier(error)) return "This company email already has a secure profile. We will sign you in with a new code sent only to that address.";
  const entries = (error as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors ?? [];
  return entries[0]?.longMessage || entries[0]?.message || (error instanceof Error ? error.message : fallback);
}

export function WorkEmailSignIn({ inviteCode }: { inviteCode?: string }) {
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
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(employeeEmailKey, normalizedEmail);
      if (inviteCode) window.sessionStorage.setItem(coverageInviteSessionKey, inviteCode);
    }
  };

  const completeSession = async (result: { status?: string | null; createdSessionId?: string | null }, setActive: (params: { session: string }) => Promise<unknown>) => {
    if (result.status !== "complete" || !result.createdSessionId) throw new Error("We could not complete your secure work-email sign-in. Try the latest email again.");
    rememberCompanyEmail();
    await setActive({ session: result.createdSessionId });
  };

  const startExistingSignIn = async () => {
    if (!signIn) throw new Error("Secure employee sign-in is still loading. Try again in a moment.");
    const result = await signIn.create({ identifier: normalizedEmail, strategy: "email_code" });
    setAttemptKind("signIn");
    rememberCompanyEmail();
    if (result.status === "complete") {
      await completeSession(result, setActiveSignIn as (params: { session: string }) => Promise<unknown>);
      return;
    }
    const factor = result.supportedFirstFactors?.find((candidate: { strategy?: string; emailAddressId?: string; safeIdentifier?: string }) => {
      if (candidate.strategy !== "email_code" || !candidate.emailAddressId) return false;
      return !candidate.safeIdentifier || candidate.safeIdentifier.trim().toLowerCase() === normalizedEmail;
    }) as { emailAddressId?: string } | undefined;
    if (!factor?.emailAddressId) throw new Error("For your privacy, we will not send a code to a different email on this account. Sign in with the company email that owns this private Referrer profile.");
    await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
    setFlow("code");
  };

  const startSignUp = async () => {
    if (!signUp) throw new Error("Secure employee sign-in is still loading. Try again in a moment.");
    let result;
    try { result = await signUp.create({ emailAddress: normalizedEmail }); }
    catch (error) {
      if (isExistingIdentifier(error)) { await startExistingSignIn(); return; }
      throw error;
    }
    setAttemptKind("signUp");
    rememberCompanyEmail();
    if (result.status === "complete") {
      await completeSession(result, setActiveSignUp as (params: { session: string }) => Promise<unknown>);
      return;
    }
    await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    setFlow("code");
  };

  const sendCode = async () => {
    const validation = workEmailError(email);
    if (validation) { setError(validation); setFlow("email"); return; }
    if (!signInLoaded || !signUpLoaded || !signIn) { setError("Secure employee sign-in is still loading. Try again in a moment."); return; }
    setBusy(true); setError("");
    try {
      await startExistingSignIn();
    } catch (caught) {
      if (isMissingIdentifier(caught)) {
        try { await startSignUp(); }
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

  if (flow === "email") return <div className="mt-5"><label className="block text-xs font-semibold text-slate-700">Company email<input aria-label="Company email for secure employee sign in" value={email} onChange={event => { setEmail(event.target.value); setError(""); }} type="email" autoComplete="email" placeholder="you@company.com" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0B57D0]" /></label><p className="mt-2 text-xs leading-4 text-slate-500">Personal email providers, passwords, and social sign-in are not used for private referral access.</p>{error && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}<button type="button" disabled={busy} onClick={() => { void sendCode(); }} className="mt-3 inline-flex rounded-lg bg-[#0B57D0] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Sending code…" : "Send code"}</button></div>;

  return <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-3.5"><p className="text-sm font-semibold text-slate-900">Code sent to {normalizedEmail}</p><label className="mt-3 block text-xs font-semibold text-slate-700">One-time code<input aria-label="Secure employee sign-in code" value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="mt-1.5 w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm font-semibold tracking-[.32em] outline-none focus:border-[#0B57D0]" /></label>{error && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy || code.length < 6} onClick={() => { void confirmCode(); }} className="rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Verifying…" : "Verify code"}</button><button type="button" disabled={busy} onClick={() => { setFlow("email"); setCode(""); setError(""); }} className="rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#0B57D0]">Use a different company email</button></div></div>;
}
