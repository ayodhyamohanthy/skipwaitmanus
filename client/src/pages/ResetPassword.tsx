import { ArrowLeft, ArrowRight, LinkIcon, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

/**
 * Kit v4 `/reset-password` (screens/web/…, app/src/routes/reset-password.tsx).
 *
 * WHY THIS IS NOT THE KIT'S FORM. The kit designs two password fields with a
 * live rule checklist (10 characters, a number or symbol, both fields match) and
 * a "Password updated — you're signed in" confirmation. None of it can be true
 * here: the credential lives in WorkOS, and the server has no reset route. A
 * local form would collect a password we cannot store and then report success.
 *
 * It also has a second, quieter problem worth naming: the kit renders the rule
 * checklist client-side, so it *looks* like validation while enforcing nothing
 * a server agreed to. A password policy that only exists in the browser is
 * decoration.
 *
 * So this route handles what it can actually own -- the token in the URL -- and
 * hands the credential step to WorkOS, which is where the token is valid.
 */

export default function ResetPassword() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <main data-skipwait-screen="reset-password" className="w-full max-w-md">
        <Link href="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link>

        <section className="mt-10">
          <span className="grid size-12 place-items-center rounded-2xl bg-muted" aria-hidden="true">
            <LinkIcon className="size-6 text-primary" />
          </span>
          <h1 className="mt-4 text-3xl font-semibold">Finish resetting your password</h1>
          <p className="mt-2 text-muted-foreground">
            The reset link points at WorkOS, which holds your credential. Opening it there completes the change and signs you back in.
          </p>

          <a href="/api/auth/workos/sign-in" className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Open the reset link <ArrowRight className="size-4" aria-hidden="true" />
          </a>

          <div className="mt-6 rounded-lg bg-muted p-4">
            <p className="text-sm font-semibold">Link not working?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Reset links are single-use and expire after an hour. Ask for a new one and open it in the same browser you started in.
            </p>
            <Link href="/forgot-password" className="text-link mt-3 inline-flex min-h-11 items-center text-sm font-semibold">
              Send a new link <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            Other sessions are signed out when a password changes — that is WorkOS's behaviour, not something this page performs.
          </p>
        </section>

        <Link href="/sign-in" className="text-link mt-8 inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" aria-hidden="true" />Back to sign in
        </Link>
      </main>
    </div>
  );
}
