import { MailCheck } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import type { PasswordMode } from "./PasswordForm";

type CheckEmailStepProps = { readonly email: string; readonly origin: PasswordMode; readonly onBack: () => void };

/**
 * "Check your email" after sign-up, or after a sign-in that must prove the inbox first (D-049, D-078 ruling 2).
 * There is no code to type: the emailed link sets the password on /reset-password and signs in there. The words
 * never say whether the address has an account, and referrers are pointed to their work-email code.
 */
export function CheckEmailStep({ email, origin, onBack }: CheckEmailStepProps) {
  return <div className="auth-form" data-testid="seeker-check-email" aria-live="polite">
    <p className="flex items-center gap-2 text-sm font-semibold"><MailCheck className="size-4" aria-hidden="true" />Check your email</p>
    <p className="text-xs leading-relaxed text-muted-foreground">
      {origin === "sign_up"
        ? <>If <strong className="break-all text-foreground">{email}</strong> can use a password on SkipWait, we&apos;ve sent it a link to set one. Open it to finish creating your account.</>
        : <>To keep your account safe, this address needs confirming first. If <strong className="break-all text-foreground">{email}</strong> can sign in with a password, we&apos;ve sent it a link to set your password and finish signing in.</>}
    </p>
    <p className="text-xs leading-relaxed text-muted-foreground">Already have an account with this email? The link sets a new password for that same account. It works once and can take a few minutes, so check spam too.</p>
    <p className="text-xs leading-relaxed text-muted-foreground">Give referrals? Referrers have no password: <Link href="/sign-in?intent=referrer" className="text-link">sign in with your work email</Link>.</p>
    <Button type="button" variant="ghost" onClick={onBack}>Use a different email</Button>
  </div>;
}
