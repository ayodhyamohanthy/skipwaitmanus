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
        <div className="mb-4 text-sm leading-5 text-black"><p className="font-semibold">See the role, resume, and forwardable note before you choose. Decline or ask for context. Nothing is sent from your account.</p><p className="mt-2 text-xs text-[#505050]">Work email verifies company access; it stays private.</p></div>
        <label htmlFor="otp-referrer-email" className="block text-xs font-semibold text-black">Company email</label>
        <input id="otp-referrer-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} inputMode="email" placeholder="you@company.com" value={email}
          onChange={event => { setEmail(event.target.value); setError(""); }}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void send(); } }}
          className="mt-1.5 min-h-12 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#131311]" />
        {error && <p role="alert" className="mt-3 rounded-lg bg-[#b91c1c]/10 p-3 text-sm text-[#B91C1C]">{error}</p>}
        <button type="button" disabled={busy || !email.trim()} onClick={() => { void send(); }} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[#131311] px-5 py-3.5 text-sm font-semibold text-white">
          {busy ? "Sending code…" : "Send sign-in code"}
        </button>
      </div>
    );
  }
  return (
    <div className="w-full rounded-xl border border-[#d9d9d1] bg-[#e9e9e2] p-4">
      <p className="text-sm font-semibold text-black">Code sent to {email.trim().toLowerCase()}</p>
      {notice && <p role="status" className="mt-1 text-xs text-[#15803d]">{notice}</p>}
      <label htmlFor="otp-referrer-code" className="mt-3 block text-xs font-semibold text-black">Six-digit code</label>
      <input id="otp-referrer-code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code}
        onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
        onKeyDown={event => { if (event.key === "Enter" && code.length === 6) { event.preventDefault(); void verify(); } }}
        className="mt-1.5 min-h-12 w-full rounded-lg border border-[#d9d9d1] bg-white px-3 py-2.5 text-sm font-semibold tracking-[.3em] outline-none focus:border-[#131311]" />
      {error && <p role="alert" className="mt-3 rounded-lg bg-[#b91c1c]/10 p-3 text-sm text-[#B91C1C]">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy || code.length !== 6} onClick={() => { void verify(); }} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-[#131311] px-4 py-3 text-sm font-semibold text-white">
          {busy ? "Verifying…" : "Verify & sign in"}
        </button>
        <button type="button" onClick={() => { setStage("email"); setCode(""); setNotice(""); }} className="min-h-12 rounded-lg border border-[#e5e5e5] bg-white px-4 py-3 text-sm font-semibold text-[#505050]">Change email</button>
      </div>
    </div>
  );
}
