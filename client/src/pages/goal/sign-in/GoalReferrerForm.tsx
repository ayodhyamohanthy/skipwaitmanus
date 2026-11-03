// The referrer's next step on the goal /sign-in (D-048-p3-signin): the kit-free
// twin of components/ReferrerOtpSignIn.tsx, which still serves the kit page and
// stays untouched. FOUNDER-LOCKED login rule (D-030, D-049, D-057): a referrer
// signs in with a code sent to a work email, on every visit. This file offers no
// personal email, no social login and no password, and it calls only the
// work-email code routes; signInGoal.test.tsx scans it to keep it that way.
import type { FormEvent } from "react";
import { GoalButton, GoalField, GoalNextStep, GoalTextInput, useOnlineStatus } from "@/components/goal";
import { CODE_LENGTH, useEmailCodeSignIn } from "./useEmailCodeSignIn";
import { CodeSentLine, FieldError, ForgetEmail } from "./SignInParts";

const REFERRER_ROUTES = { send: "/api/auth/otp/send", verify: "/api/auth/otp/verify" } as const;
const EMAIL_ID = "goal-referrer-email";
const CODE_ID = "goal-referrer-code";
const ERROR_ID = "goal-referrer-error";

export function GoalReferrerForm({ onSignedIn }: { onSignedIn: () => void }) {
  const online = useOnlineStatus();
  const flow = useEmailCodeSignIn({ role: "referrer", routes: REFERRER_ROUTES, onSignedIn });

  if (flow.stage === "code") {
    return (
      <GoalNextStep reason="Enter the code from your work inbox to finish signing in.">
        <form data-testid="referrer-work-email-otp" noValidate className="mt-4 grid gap-4" onSubmit={(event: FormEvent) => { event.preventDefault(); void flow.verify(online); }}>
          <CodeSentLine email={flow.sentTo} />
          <GoalField label="Six-digit code" htmlFor={CODE_ID}>
            <GoalTextInput id={CODE_ID} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={CODE_LENGTH} autoFocus placeholder="123456"
              className="tracking-[0.3em] tabular-nums" value={flow.code} onChange={event => flow.setCode(event.target.value)}
              invalid={flow.error !== ""} describedBy={flow.error ? ERROR_ID : undefined} />
          </GoalField>
          <FieldError id={ERROR_ID} message={flow.error} />
          <GoalButton type="submit" variant="primary" touch="large" className="w-full" busy={flow.busy} busyLabel="Verifying…">Verify &amp; sign in</GoalButton>
          <GoalButton type="button" variant="ghost" className="w-full" onClick={flow.restart}>Change email</GoalButton>
        </form>
      </GoalNextStep>
    );
  }

  return (
    <GoalNextStep reason="We will send a six-digit code to your work email. It proves where you work and stays private.">
      <form data-testid="referrer-work-email-otp" noValidate className="mt-4 grid gap-4" onSubmit={(event: FormEvent) => { event.preventDefault(); void flow.send(online); }}>
        <GoalField label="Company email" htmlFor={EMAIL_ID}>
          <GoalTextInput id={EMAIL_ID} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@company.com"
            value={flow.email} onChange={event => flow.setEmail(event.target.value)}
            invalid={flow.error !== ""} describedBy={flow.error ? ERROR_ID : undefined} />
        </GoalField>
        {flow.remembered ? <ForgetEmail onForget={() => { flow.forget(); document.getElementById(EMAIL_ID)?.focus(); }} /> : null}
        <FieldError id={ERROR_ID} message={flow.error} />
        <GoalButton type="submit" variant="primary" touch="large" className="w-full" busy={flow.busy} busyLabel="Sending code…">Send sign-in code</GoalButton>
      </form>
      <p className="mt-4 text-g-meta text-g-ink-3">Work email only. We never use personal email or social logins for referrers.</p>
    </GoalNextStep>
  );
}
