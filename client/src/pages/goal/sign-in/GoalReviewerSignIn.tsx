// Goal /reviewer-sign-in (D-048-p3-signin, packet section 4 rule 9). The
// founder-approved demo sign-in for website and payment review: unlinked,
// noindex, and never a doorway. Same POST /api/auth/reviewer/sign-in as the
// kit page; the server answers 404 unless REVIEWER_LOGIN_ENABLED is "true"
// (server/_core/reviewerLogin.ts), so this page says review sign-in is off
// instead of promising it works. Only a same-origin landing is followed, the
// server's own 401/429 words are shown, and the typed password never renders.
// No social button, personal-email path, sign-up link or code fallback.
import { CircleAlert } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalField, GoalTextInput } from "@/components/goal/GoalField";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalAuthFrame, NETWORK_MESSAGE, serverWords } from "./GoalAuthFrame";

export const GOAL_PAGE = { goalLine: "Review SkipWait with a demo account." } as const;

const SWITCHED_OFF = "Review sign-in is switched off on this site.";

function landingOf(body: unknown): string {
  const redirectTo = body && typeof body === "object" ? (body as { redirectTo?: unknown }).redirectTo : undefined;
  return typeof redirectTo === "string" && /^\/(?!\/)/.test(redirectTo) ? redirectTo : "/plans";
}

export default function GoalReviewerSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/reviewer/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email, password }) });
      const payload: unknown = await response.json().catch(() => ({}));
      if (response.status === 404) { setError(SWITCHED_OFF); setBusy(false); return; }
      if (!response.ok) { setError(serverWords(payload, "We could not sign in.")); setBusy(false); return; }
      window.location.assign(landingOf(payload));
      setBusy(false);
    } catch {
      setError(NETWORK_MESSAGE);
      setBusy(false);
    }
  }

  return (
    <GoalAuthFrame screen="reviewer-sign-in" page="reviewer-sign-in" goalLine={GOAL_PAGE.goalLine} back={null}
      lead={<p>For website and payment review. These accounts hold demo data only, and a session here is an ordinary signed-in session.</p>}>
      <div className="mt-8">
        <GoalNextStep reason="Use the review account details you were given.">
          <form className="mt-4 grid gap-3" onSubmit={submit} noValidate>
            <GoalField label="Review account email" htmlFor="reviewer-email">
              <GoalTextInput id="reviewer-email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={event => { setEmail(event.target.value); setError(""); }} />
            </GoalField>
            <GoalField label="Password" htmlFor="reviewer-password">
              <GoalTextInput id="reviewer-password" type="password" autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value); setError(""); }} />
            </GoalField>
            {error ? (
              <p role="alert" className="flex items-start gap-2 text-g-meta text-g-crimson">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{error}
              </p>
            ) : null}
            <GoalButton type="submit" variant="primary" className="w-full" busy={busy} busyLabel="Signing in…"
              disabledReason={!email.trim() || !password ? "Enter the review email and password" : undefined}>Sign in to review</GoalButton>
          </form>
        </GoalNextStep>
      </div>
    </GoalAuthFrame>
  );
}
