import { useState } from "react";

/**
 * Referrer sign-in: work-email OTP IS the login. Enter company address,
 * receive code via ZeptoMail, verify -> signed in and enrolled for the
 * company's private referral inbox. No separate provider step.
 */
export function ReferrerOtpSignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const send = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/auth/otp/send", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.sent) { setError(body.error || "We could not send the code. Try again shortly."); return; }
      setNotice("Code sent to your company email.");
      setStage("code");
    } catch { setError("We could not send the code. Try again shortly."); } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/otp/verify", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.signedIn) { setError(body.error || "That code could not be verified."); return; }
      window.location.reload();
    } catch { setError("That code could not be verified."); } finally { setBusy(false); }
  };

  if (stage === "email") {
    return (
      <div className="w-full">
        <label htmlFor="otp-referrer-email" className="block text-xs font-semibold text-[#3F3B33]">Company email</label>
        <input id="otp-referrer-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} inputMode="email" placeholder="you@company.com" value={email}
          onChange={event => { setEmail(event.target.value); setError(""); }}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void send(); } }}
          className="mt-1.5 w-full rounded-lg border border-[#E2DDD2] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#191713]" />
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <button type="button" disabled={busy || !email.trim()} onClick={() => { void send(); }} className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-[#191713] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? "Sending code…" : "Send sign-in code"}
        </button>
      </div>
    );
  }
  return (
    <div className="w-full rounded-xl border border-[#F3D5C7] bg-[#F9E4DE]/60 p-4">
      <p className="text-sm font-semibold text-[#191713]">Code sent to {email.trim().toLowerCase()}</p>
      {notice && <p role="status" className="mt-1 text-xs text-emerald-700">{notice}</p>}
      <label htmlFor="otp-referrer-code" className="mt-3 block text-xs font-semibold text-[#3F3B33]">Six-digit code</label>
      <input id="otp-referrer-code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code}
        onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
        onKeyDown={event => { if (event.key === "Enter" && code.length === 6) { event.preventDefault(); void verify(); } }}
        className="mt-1.5 w-full rounded-lg border border-[#F3D5C7] bg-white px-3 py-2.5 text-sm font-semibold tracking-[.3em] outline-none focus:border-[#191713]" />
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy || code.length !== 6} onClick={() => { void verify(); }} className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#191713] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? "Verifying…" : "Verify & sign in"}
        </button>
        <button type="button" onClick={() => { setStage("email"); setCode(""); setNotice(""); }} className="rounded-lg border border-[#E2DDD2] bg-white px-4 py-3 text-sm font-semibold text-[#625D52]">Change email</button>
      </div>
    </div>
  );
}
