// Goal /forgot-password (D-048-p3-signin, packet section 6 step 3). The same
// POST /api/auth/password/forgot as the kit page, and the same neutral answer:
// the server says { ok: true } whether or not the account exists
// (server/passwordResetRoutes.ts), so this page never hints either way. The
// goal line stays the only h1 in both states; each state names its own title
// in an h2 and keeps one commit in the next-step block (section 4 rule 14).
import { CircleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalField, GoalTextInput } from "@/components/goal/GoalField";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { useOnlineStatus } from "@/components/goal/useOnlineStatus";
import { GoalAuthFrame, NETWORK_MESSAGE, serverWords } from "./GoalAuthFrame";

export const GOAL_PAGE = { goalLine: "Get back into your account." } as const;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const OFFLINE_REASON = "You are offline. Your email is kept; send the link when you are back online.";

export default function GoalForgotPassword() {
  const online = useOnlineStatus();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [triedOffline, setTriedOffline] = useState(false);
  const valid = EMAIL.test(email.trim());

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!online) { setTriedOffline(true); return; }
    if (!valid || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) { setError(serverWords(payload, "We could not send the link. Try again.")); return; }
      setSent(true);
    } catch {
      setError(NETWORK_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GoalAuthFrame screen="forgot-password" page="forgot-password" goalLine={GOAL_PAGE.goalLine} back={{ href: "/sign-in", label: "Back to sign in" }}
      lead={<p>We email a link that lets you set a new password. It works for 1 hour, once.</p>}>
      <div className="mt-8">
        {sent ? (
          <GoalNextStep>
            <h2 className="mt-3 text-g-label text-g-ink">Check your email</h2>
            <p className="mt-1 text-g-meta text-g-ink-2">If an account exists for <span className="break-all text-g-ink">{email.trim()}</span>, a reset link is on its way. It works for 1 hour, once.</p>
            <div className="mt-4 grid gap-2">
              <GoalButton variant="primary" asChild className="w-full"><Link href="/sign-in">Back to sign in</Link></GoalButton>
              <GoalButton variant="ghost" className="w-full" onClick={() => { setSent(false); setError(""); }}>Use a different email</GoalButton>
            </div>
          </GoalNextStep>
        ) : (
          <GoalNextStep reason="Enter the email you use for SkipWait.">
            <form className="mt-4 grid gap-3" onSubmit={send} noValidate>
              <GoalField label="Account email" htmlFor="forgot-email">
                <GoalTextInput id="forgot-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email}
                  onChange={event => { setEmail(event.target.value); setError(""); }} />
              </GoalField>
              {error ? (
                <p role="alert" className="flex items-start gap-2 text-g-meta text-g-crimson">
                  <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{error}
                </p>
              ) : null}
              {!online && (triedOffline || email) ? <p role="status" className="text-g-meta text-g-ink-2">{OFFLINE_REASON}</p> : null}
              <GoalButton type="submit" variant="primary" className="w-full" busy={busy} busyLabel="Sending…"
                disabledReason={online && !valid ? "Enter a valid email address" : undefined}>Send reset link</GoalButton>
            </form>
          </GoalNextStep>
        )}
      </div>
    </GoalAuthFrame>
  );
}
