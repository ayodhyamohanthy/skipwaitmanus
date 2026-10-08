import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

/**
 * Kit v4 `/forgot-password` (screens/web/…, app/src/routes/forgot-password.tsx).
 *
 * WHY THIS IS NOT THE KIT'S FORM. The kit designs an email field that reports
 * "Check your email — a reset link is on its way". Shipping that would be a lie:
 * this app does not store passwords. Auth is WorkOS AuthKit only, and the server
 * exposes /api/auth/workos/sign-in, /callback, /admin and /logout — there is no
 * reset route, because WorkOS owns the credential.
 *
 * So a local form here could only do one of two things: pretend to send an email
 * that never arrives, or set a password that WorkOS does not know about and that
 * would be rejected at the next sign-in. Both are worse than saying where the
 * reset actually lives.
 *
 * This screen keeps the kit's composition -- wordmark, centred single-purpose
 * card, back-to-sign-in link -- and routes the person to the flow that works.
 */

export default function ForgotPassword() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <main data-skipwait-screen="forgot-password" className="w-full max-w-md">
        <Link href="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link>

        <section className="mt-10">
          <span className="grid size-12 place-items-center rounded-2xl bg-muted" aria-hidden="true">
            <KeyRound className="size-6 text-primary" />
          </span>
          <h1 className="mt-4 text-3xl font-semibold">Forgot your password?</h1>
          <p className="mt-2 text-muted-foreground">
            Your password is held by our sign-in provider, WorkOS. Reset it there and you'll come straight back here.
          </p>

          <a href="/api/auth/workos/sign-in" className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Continue to reset <ArrowRight className="size-4" aria-hidden="true" />
          </a>

          <div className="mt-6 rounded-lg bg-muted p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />SkipWait never sees your password
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              We don't store, hash or reset credentials. WorkOS verifies you and hands us a signed session — which is also why a leaked SkipWait database could never expose a password.
            </p>
          </div>
        </section>

        <Link href="/sign-in" className="text-link mt-8 inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" aria-hidden="true" />Back to sign in
        </Link>
      </main>
    </div>
  );
}
