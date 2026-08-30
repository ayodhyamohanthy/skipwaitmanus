import { useState } from "react";
import { normalizeWorkEmail, workEmailError } from "@/lib/workEmail";

type Flow = "email" | "code";

const employeeEmailKey = "skipwait:employee-sign-in-email";
export const coverageInviteSessionKey = "skipwait:company-coverage-invite";

/**
 * Server-owned work-email verification. A six-digit code is created and
 * verified by skipwait.me's own API and delivered to the company address with
 * ZeptoMail (transactional). The signed-in identity stays untouched: this
 * proves ownership of the company address for employee-pool enrollment.
 */
export function WorkEmailSignIn({ inviteCode, compact = false }: { inviteCode?: string; compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [flow, setFlow] = useState<Flow>("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const normalizedEmail = normalizeWorkEmail(email);

  const rememberCompanyEmail = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(employeeEmailKey, normalizedEmail);
      if (inviteCode) window.sessionStorage.setItem(coverageInviteSessionKey, inviteCode);
    }
  };

  const sendCode = async () => {
    const validation = workEmailError(email);
    if (validation) { setError(validation); setFlow("email"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/work-email/otp/send", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: normalizedEmail }) });
      const payload = (await response.json().catch(() => ({}))) as { sent?: boolean; error?: string; retryAfterSeconds?: number };
      if (!response.ok || !payload.sent) {
        const detail = payload.error || (payload.error === undefined && payload.sent === false ? "We could not send a code right now. Try again shortly." : "We could not start secure company-email access.");
        setError(detail);
        return;
      }
      rememberCompanyEmail();
      setFlow("code");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not start secure company-email access.");
    } finally { setBusy(false); }
  };

  const confirmCode = async () => {
    if (code.length !== 6) { setError("Enter the six-digit code from your company email."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/work-email/otp/verify", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: normalizedEmail, code }) });
      const payload = (await response.json().catch(() => ({}))) as { verified?: boolean; error?: string };
      if (!response.ok || !payload.verified) { setError(payload.error || "That code could not be verified. Check the latest code and try again."); return; }
      rememberCompanyEmail();
      // Enrollment completes through the existing verified-address endpoint.
      const enroll = await fetch("/api/company-referrals/verify-work-email", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: normalizedEmail, otpVerified: true, inviteCode }) });
      const enrollPayload = (await enroll.json().catch(() => ({}))) as { verified?: boolean; error?: string };
      if (!enroll.ok || !enrollPayload.verified) { setError(enrollPayload.error || "We could not confirm this company email for private referral access."); return; }
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That code could not be verified. Check the latest code and try again.");
    } finally { setBusy(false); }
  };

  if (flow === "email") return <div className={compact ? "w-full" : "mt-5"}><label className="block"><span className={compact ? "sr-only" : "text-xs font-semibold text-slate-700"}>Company email</span><input autoFocus={compact} aria-label="Company email for secure employee sign in" value={email} onChange={event => { setEmail(event.target.value); setError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void sendCode(); } }} type="email" autoComplete="email" inputMode="email" enterKeyHint="send" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="you@company.com" className={`${compact ? "w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base" : "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"} outline-none focus:border-[#0B57D0]`} /></label>{!compact && <p className="mt-2 text-xs leading-4 text-slate-500">We email a one-time code to verify this company address. Personal email providers are not accepted.</p>}{error && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}<button type="button" disabled={busy} onClick={() => { void sendCode(); }} className={`${compact ? "mt-3 inline-flex w-full justify-center rounded-xl px-5 py-3.5" : "mt-3 inline-flex rounded-lg px-5 py-2.5"} bg-[#0B57D0] text-sm font-semibold text-white disabled:opacity-50`}>{busy ? "Sending code…" : "Send code"}</button></div>;

  return <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-3.5"><p className="text-sm font-semibold text-slate-900">Code sent to {normalizedEmail}</p><label className="mt-3 block text-xs font-semibold text-slate-700">One-time code<input aria-label="Secure employee sign-in code" value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void confirmCode(); } }} inputMode="numeric" enterKeyHint="done" autoComplete="one-time-code" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="123456" className="mt-1.5 w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm font-semibold tracking-[.32em] outline-none focus:border-[#0B57D0]" /></label>{error && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}<div className="mt-3"><button type="button" disabled={busy || code.length < 6} onClick={() => { void confirmCode(); }} className="rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Verifying…" : "Verify code"}</button></div></div>;
}
