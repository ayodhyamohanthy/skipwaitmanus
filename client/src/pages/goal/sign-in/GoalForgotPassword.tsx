// D-078: neutral set/reset email flow; link lifetime is owned by WorkOS.
import { CircleAlert } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { Link } from "wouter";
import { EMAIL_MAX, passwordForgotAcceptedSchema, passwordForgotRequestSchema } from "@shared/passwordAuth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalField, GoalTextInput } from "@/components/goal/GoalField";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { useOnlineStatus } from "@/components/goal/useOnlineStatus";
import { postPasswordAuth } from "@/lib/passwordAuthClient";
import { GoalAuthFrame } from "./GoalAuthFrame";

export const GOAL_PAGE = { goalLine: "Set or reset your password" } as const;
const OFFLINE_REASON = "You are offline. Your email is kept; send the link when you are back online.";

export default function GoalForgotPassword() {
  const online = useOnlineStatus();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const valid = passwordForgotRequestSchema.safeParse({ email }).success;

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!online || !valid || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await postPasswordAuth("/api/auth/password/forgot", passwordForgotRequestSchema.parse({ email }), passwordForgotAcceptedSchema);
      if (!result.ok) { setError(result.message); return; }
      setEmail(email.trim().toLowerCase()); setSent(true);
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <GoalAuthFrame screen="forgot-password" page="forgot-password" goalLine={GOAL_PAGE.goalLine} back={{ href: "/sign-in", label: "Back to sign in" }}
    lead={<p>We email a single-use link that lets you set a password. Signed in with a code before? Use the same email for the same account.</p>}>
    <div className="mt-8">
      {sent ? <GoalNextStep>
        <h2 className="mt-3 text-g-label text-g-ink">Check your email</h2>
        <p className="mt-1 text-g-meta text-g-ink-2">If an account exists for <span className="break-all text-g-ink">{email}</span>, a reset link is on its way. Use the newest email.</p>
        <p className="mt-3 text-g-meta text-g-ink-2">No email after a few minutes? Create an account with the same address; it joins your existing account.</p>
        <div className="mt-4 grid gap-2">
          <GoalButton variant="primary" asChild className="w-full"><Link href="/sign-in">Back to sign in</Link></GoalButton>
          <GoalButton variant="ghost" className="w-full" onClick={() => { setSent(false); setError(""); }}>Use a different email</GoalButton>
        </div>
      </GoalNextStep> : <GoalNextStep reason="Enter the email you use for SkipWait.">
        <form className="mt-4 grid gap-3" onSubmit={send} noValidate>
          <GoalField label="Account email" htmlFor="forgot-email">
            <GoalTextInput id="forgot-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={EMAIL_MAX} required placeholder="you@example.com" value={email}
              onChange={event => { setEmail(event.target.value); setError(""); }} />
          </GoalField>
          {error && <p role="alert" className="flex items-start gap-2 text-g-meta text-g-crimson"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{error}</p>}
          {!online && <p role="status" className="text-g-meta text-g-ink-2">{OFFLINE_REASON}</p>}
          <GoalButton type="submit" variant="primary" className="w-full" busy={busy} busyLabel="Sending…"
            disabledReason={!online ? OFFLINE_REASON : !valid ? "Enter a valid email address" : undefined}>Send reset link</GoalButton>
        </form>
      </GoalNextStep>}
    </div>
  </GoalAuthFrame>;
}
