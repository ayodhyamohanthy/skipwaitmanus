// Goal work-email sign-in for referrers (D-030/D-049/D-057, FOUNDER-LOCKED):
// the six-digit work-email code IS the login - never personal email, social
// login or password. Goal-styled twin of the kit ReferrerOtpSignIn with the
// same /api/auth/otp/send + /api/auth/otp/verify contract and server copy.
import { useState } from "react";
import { GoalButton, GoalField, GoalTextInput } from "@/components/goal";
import { forgetSignInEmail, rememberedSignInEmail, rememberSignInEmail } from "@/lib/rememberedSignInEmail";

const ERROR_CLASS = "rounded-[10px] border border-g-crimson/40 p-3 text-g-small text-g-crimson";

export function GoalOtpSignIn({ onSignedIn }: { onSignedIn?: () => void } = {}) {
  const [email, setEmail] = useState(() => rememberedSignInEmail("referrer"));
  const [remembered, setRemembered] = useState(() => rememberedSignInEmail("referrer") !== "");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const send = async () => {
    if (busy) return;
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
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/otp/verify", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.signedIn) { setError(body.error || "That code could not be verified."); return; }
      rememberSignInEmail("referrer", email);
      if (onSignedIn) onSignedIn(); else window.location.reload();
    } catch { setError("That code could not be verified."); } finally { setBusy(false); }
  };

  if (stage === "email") {
    return (
      <div className="w-full">
        <p className="text-g-small leading-[1.6] text-g-ink">See the role, resume, and forwardable note before you choose. Decline or ask for context. Nothing is sent from your account.</p>
        <p className="mt-2 text-g-meta text-g-ink-3">Work email verifies company access; it stays private.</p>
        <div className="mt-4">
          <GoalField label="Company email" htmlFor="goal-otp-referrer-email">
            <GoalTextInput id="goal-otp-referrer-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} inputMode="email" placeholder="you@company.com" value={email}
              onChange={event => { setEmail(event.target.value); setError(""); }}
              onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void send(); } }} />
          </GoalField>
        </div>
        {remembered ? <button type="button" className="mt-2 text-g-meta font-semibold text-g-ink underline underline-offset-2" onClick={() => { forgetSignInEmail("referrer"); setRemembered(false); setEmail(""); setError(""); document.getElementById("goal-otp-referrer-email")?.focus(); }}>Not you? Forget this email</button> : null}
        {error ? <p role="alert" className={`mt-3 ${ERROR_CLASS}`}>{error}</p> : null}
        <div className="mt-4"><GoalButton variant="primary" busy={busy} busyLabel="Sending code…" disabledReason={email.trim() ? undefined : "Enter your company email first."} onClick={() => { void send(); }}>Send sign-in code</GoalButton></div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-[10px] border border-g-hairline bg-g-surface-sunken p-4">
      <p className="text-g-small font-semibold text-g-ink">Code sent to {email.trim().toLowerCase()}</p>
      {notice ? <p role="status" className="mt-1 text-g-meta text-g-emerald">{notice}</p> : null}
      <div className="mt-3">
        <GoalField label="Six-digit code" htmlFor="goal-otp-referrer-code">
          <GoalTextInput id="goal-otp-referrer-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus placeholder="123456" value={code}
            onChange={event => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
            onKeyDown={event => { if (event.key === "Enter" && code.length === 6) { event.preventDefault(); void verify(); } }}
            className="font-semibold tracking-[.3em]" />
        </GoalField>
      </div>
      {error ? <p role="alert" className={`mt-3 ${ERROR_CLASS}`}>{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <GoalButton variant="primary" busy={busy} busyLabel="Verifying…" disabledReason={code.length === 6 ? undefined : "Enter the six-digit code first."} onClick={() => { void verify(); }}>Verify &amp; sign in</GoalButton>
        <GoalButton variant="outline" onClick={() => { setStage("email"); setCode(""); setNotice(""); setError(""); }}>Change email</GoalButton>
      </div>
    </div>
  );
}
