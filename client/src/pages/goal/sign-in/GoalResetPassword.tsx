// D-078: the token is read into memory once and removed immediately. Only the explicit POST submits it.
import { Check, Circle, CircleAlert } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { Link } from "wouter";
import { safeSignInReturnTo, signInPagePath } from "@shared/authReturnTo";
import { PASSWORD_AUTH_COPY, PASSWORD_MAX, passwordPolicyChecks, passwordResetConfirmSuccessSchema, resetTokenSchema, type PasswordResetConfirmSuccess } from "@shared/passwordAuth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalField, GoalTextInput } from "@/components/goal/GoalField";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { useOnlineStatus } from "@/components/goal/useOnlineStatus";
import { postPasswordAuth } from "@/lib/passwordAuthClient";
import { GoalAuthFrame } from "./GoalAuthFrame";
import { GoalPasswordField } from "./GoalPasswordField";

export const GOAL_PAGE = { goalLine: "Set a new password and get back in." } as const;

function takeResetLink() {
  if (typeof window === "undefined") return { token: "", returnTo: "/explore" };
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const returnTo = safeSignInReturnTo(params.get("returnTo"), window.location.origin) ?? "/explore";
  window.history.replaceState(window.history.state, "", window.location.pathname);
  return { token, returnTo };
}

export default function GoalResetPassword() {
  const [link] = useState(takeResetLink);
  const online = useOnlineStatus();
  const [expired, setExpired] = useState(!resetTokenSchema.safeParse(link.token).success);
  const [expiredReason, setExpiredReason] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState<PasswordResetConfirmSuccess | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const rules = passwordPolicyChecks(password, confirm);
  const rulesPass = rules.every(rule => rule.passed);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!online || !rulesPass || expired || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await postPasswordAuth("/api/auth/password/reset/confirm", { token: link.token, password, confirm, returnTo: link.returnTo }, passwordResetConfirmSuccessSchema);
      if (!result.ok) {
        if (result.code === "expired") { setPassword(""); setConfirm(""); setExpiredReason(result.message); setExpired(true); return; }
        setError(result.message); return;
      }
      const destination = safeSignInReturnTo(result.data.redirectTo, window.location.origin);
      if (!destination) { setError(PASSWORD_AUTH_COPY.temporarily_unavailable); return; }
      setPassword(""); setConfirm(""); setDone({ ...result.data, redirectTo: destination });
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <GoalAuthFrame screen="reset-password" page="reset-password" goalLine={GOAL_PAGE.goalLine} back={{ href: "/sign-in", label: "Back to sign in" }}>
    <div className="mt-8">
      {expired ? <GoalNextStep>
        <h2 className="mt-3 text-g-label text-g-ink">This link has expired or was already used</h2>
        <p className="mt-1 text-g-meta text-g-ink-2">{expiredReason || "Request a new link and use the newest email. Each link works only once."}</p>
        <GoalButton variant="primary" asChild className="mt-4 w-full"><Link href="/forgot-password">Send a new link</Link></GoalButton>
      </GoalNextStep> : done ? <GoalNextStep>
        <h2 className="mt-3 text-g-label text-g-ink">Reset complete</h2>
        <p className="mt-1 text-g-meta text-g-ink-2">{done.signedIn ? "Your password is updated. You are signed in on this device. Other sessions were signed out for safety." : "Your password is updated. Every device signed in to this account was signed out for safety. Sign in again to continue."}</p>
        <GoalButton variant="primary" asChild className="mt-4 w-full"><Link href={done.signedIn ? done.redirectTo : signInPagePath(done.redirectTo, window.location.origin)}>{done.signedIn ? "Continue" : "Go to sign in"}</Link></GoalButton>
      </GoalNextStep> : <GoalNextStep reason="Choose a password you do not use anywhere else.">
        <form className="mt-4 grid gap-3" onSubmit={submit} noValidate>
          <GoalPasswordField id="reset-password" label="New password" value={password} onChange={value => { setPassword(value); setError(""); }} />
          <GoalField label="Confirm password" htmlFor="reset-confirm">
            <GoalTextInput id="reset-confirm" name="confirm" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} required value={confirm}
              onChange={event => { setConfirm(event.target.value); setError(""); }} />
          </GoalField>
          <ul className="grid gap-1" aria-label="Password rules">
            {rules.map(({ label, passed }) => <li key={label} data-passed={passed ? "true" : "false"} className={`flex items-center gap-2 text-g-meta ${passed ? "text-g-ink" : "text-g-ink-3"}`}>
              {passed ? <Check aria-hidden="true" className="size-4" strokeWidth={1.75} /> : <Circle aria-hidden="true" className="size-4" strokeWidth={1.75} />}{label}
            </li>)}
          </ul>
          {error && <p role="alert" className="flex items-start gap-2 text-g-meta text-g-crimson"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{error}</p>}
          {!online && <p role="status" className="text-g-meta text-g-ink-2">You are offline. Try updating your password when you are back online.</p>}
          <GoalButton type="submit" variant="primary" className="w-full" busy={busy} busyLabel="Updating…" disabledReason={!online ? "You are offline" : !rulesPass ? "Meet the three password rules first" : undefined}>Update password</GoalButton>
        </form>
      </GoalNextStep>}
    </div>
  </GoalAuthFrame>;
}
