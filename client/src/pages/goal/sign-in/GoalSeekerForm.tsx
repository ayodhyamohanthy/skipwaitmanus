// The job seeker's next step on the goal /sign-in (D-048-p3-signin): the kit-free
// twin of components/SeekerSignIn.tsx, which still serves the kit page and stays
// untouched. FOUNDER-LOCKED login rule (D-030 as amended by D-049): personal
// email by a six-digit code, or a social login that goes straight to the
// provider - all on skipwait.me, never a hosted AuthKit page. The email field is
// up front (D-095 item 2) and "Send sign-in code" is the page's one black commit.
import type { FormEvent } from "react";
import { GoalButton, GoalField, GoalNextStep, GoalTextInput, useOnlineStatus } from "@/components/goal";
import { CODE_LENGTH, useEmailCodeSignIn } from "./useEmailCodeSignIn";
import { CodeSentLine, FieldError, ForgetEmail } from "./SignInParts";

/** The same five providers, in the same order, as components/SeekerSignIn.tsx
 *  SEEKER_SOCIAL; signInGoal.test.tsx fails if the two lists drift. */
export const GOAL_SEEKER_SOCIAL = [
  { id: "google", label: "Google" },
  { id: "microsoft", label: "Microsoft" },
  { id: "github", label: "GitHub" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "slack", label: "Slack" },
] as const;

/** The WorkOS hand-off the kit uses (SeekerSignIn.tsx seekerSocialUrl), byte for byte. */
export function goalSeekerSocialUrl(provider: string, returnTo: string): string {
  return `/api/auth/workos/sign-in?${new URLSearchParams({ returnTo, provider })}`;
}

const SEEKER_ROUTES = { send: "/api/auth/workos/email-code/send", verify: "/api/auth/workos/email-code/verify" } as const;
const EMAIL_ID = "goal-seeker-email";
const CODE_ID = "goal-seeker-code";
const ERROR_ID = "goal-seeker-error";

export function GoalSeekerForm({ returnTo }: { returnTo: string }) {
  const online = useOnlineStatus();
  const flow = useEmailCodeSignIn({ role: "seeker", routes: SEEKER_ROUTES, onSignedIn: () => window.location.assign(returnTo) });
  const focusEmail = () => document.getElementById(EMAIL_ID)?.focus();

  if (flow.stage === "code") {
    return (
      <GoalNextStep reason="Enter the code from the email to finish signing in.">
        <form data-testid="seeker-sign-in" noValidate className="mt-4 grid gap-4" onSubmit={(event: FormEvent) => { event.preventDefault(); void flow.verify(online); }}>
          <CodeSentLine email={flow.sentTo} />
          <GoalField label="Six-digit code" htmlFor={CODE_ID}>
            <GoalTextInput id={CODE_ID} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={CODE_LENGTH} autoFocus placeholder="123456"
              className="tracking-[0.3em] tabular-nums" value={flow.code} onChange={event => flow.setCode(event.target.value)}
              invalid={flow.error !== ""} describedBy={flow.error ? ERROR_ID : undefined} />
          </GoalField>
          <FieldError id={ERROR_ID} message={flow.error} />
          <GoalButton type="submit" variant="primary" touch="large" className="w-full" busy={flow.busy} busyLabel="Checking…">Sign in</GoalButton>
          <GoalButton type="button" variant="ghost" className="w-full" onClick={flow.restart}>Use a different email</GoalButton>
        </form>
      </GoalNextStep>
    );
  }

  return (
    <GoalNextStep reason="We will email you a six-digit code. New to skipwait.me? The same code creates your account.">
      <form data-testid="seeker-sign-in" noValidate className="mt-4 grid gap-4" onSubmit={(event: FormEvent) => { event.preventDefault(); void flow.send(online); }}>
        <GoalField label="Email address" htmlFor={EMAIL_ID}>
          <GoalTextInput id={EMAIL_ID} name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com"
            value={flow.email} onChange={event => flow.setEmail(event.target.value)}
            invalid={flow.error !== ""} describedBy={flow.error ? ERROR_ID : undefined} />
        </GoalField>
        {flow.remembered ? <ForgetEmail onForget={() => { flow.forget(); focusEmail(); }} /> : null}
        <FieldError id={ERROR_ID} message={flow.error} />
        <GoalButton type="submit" variant="primary" touch="large" className="w-full" busy={flow.busy} busyLabel="Sending code…">Send sign-in code</GoalButton>
        {/* Keyboard and screen-reader route back to the email field, as the kit keeps it. */}
        <button type="button" className="sr-only" onClick={focusEmail}>Continue with email</button>
      </form>
      <div className="mt-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-g-hairline" />
        <span className="text-g-meta text-g-ink-3">or continue with</span>
        <span className="h-px flex-1 bg-g-hairline" />
      </div>
      {/* Each provider goes straight to its own sign-in page; nothing is shared until you choose one. */}
      <ul className="mt-4 grid grid-cols-2 gap-2" aria-label="Continue with an account you already have">
        {GOAL_SEEKER_SOCIAL.map((provider, index) => (
          <li key={provider.id} className={index === 0 ? "col-span-2" : undefined}>
            <GoalButton type="button" variant="outline" className="w-full border-g-control-edge hover:border-g-ink hover:bg-g-surface-hover" aria-label={`Continue with ${provider.label}`}
              onClick={() => window.location.assign(goalSeekerSocialUrl(provider.id, returnTo))}>
              {provider.label}
            </GoalButton>
          </li>
        ))}
      </ul>
    </GoalNextStep>
  );
}
