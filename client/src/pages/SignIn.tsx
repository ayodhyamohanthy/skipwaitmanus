import { useState } from "react";
import { ArrowLeft, Check, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";

/**
 * Kit v4 `/sign-in` (screens/web/03_sign-in__default.png,
 * app/src/components/sign-in-page.tsx).
 *
 * THREE PRODUCTION DEVIATIONS from the kit's design preview, each deliberate:
 *
 * 1. The kit's local email + password form and its "Forgot password?" link are
 *    NOT built. Sign-in is delegated to WorkOS AuthKit (`openSignIn`), which
 *    owns credentials. The kit's own approved-stack table names WorkOS as the
 *    sign-in provider, so a local credential store would be a second, weaker
 *    one. This is the D3 boundary.
 * 2. Both method buttons open the same WorkOS-hosted page, which presents
 *    Google and email itself. The two buttons are kept because the kit's copy
 *    is approved and both do lead to a real sign-in, but the METHOD is chosen
 *    on the hosted page, not here.
 * 3. The kit's "That's the whole flow" preview state is gone. It existed only
 *    because the design preview could not create an account; this page can.
 *
 * The intent switch is a real control: it sets the context line and is the
 * hook a post-sign-in router uses to send seekers to /requests and referrers
 * to /referrer. It does not change which credentials are accepted.
 */

type Intent = "seeker" | "referrer";

export default function SignIn() {
  const { openSignIn } = useAuth();
  const [intent, setIntent] = useState<Intent>("seeker");

  const start = () => { void openSignIn(); };

  return (
    <main data-skipwait-screen="sign-in" className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-secondary lg:block" aria-label="SkipWait introduction">
        <Link href="/" className="absolute left-10 top-8 z-10 text-2xl font-bold">
          SkipWait<span className="text-primary">.</span>
        </Link>
        <img src="/launch-door.jpg" alt="An open blue door with a yellow path" className="absolute inset-0 size-full object-cover object-bottom" />
        <div className="relative z-10 max-w-lg px-10 pt-[17%]">
          <p className="eyebrow">A warmer way in</p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05]">
            One sign-in.<br />More open doors.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
            Explore first. Sign in only when you're ready to ask for—or offer—a real introduction.
          </p>
        </div>
        <div className="absolute bottom-9 left-10 z-10 flex max-w-sm items-start gap-3 rounded-lg border-2 border-foreground bg-background p-4">
          <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-xs leading-5">
            <strong className="block text-sm">Private by default</strong>
            Your details stay yours until you choose to share.
          </span>
        </div>
      </section>

      <section className="grid place-items-center px-6 py-10 lg:px-14">
        <div className="w-full max-w-md">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
            <ArrowLeft className="size-4" aria-hidden="true" />Back to home
          </Link>

          <div className="mt-10">
            <p className="eyebrow text-primary">Your door starts here</p>
            <h2 className="mt-3 text-4xl font-semibold">Welcome to SkipWait.</h2>
            <p className="mt-2 text-sm text-muted-foreground">Choose how you'll use SkipWait. You can change this later.</p>
          </div>

          <div role="group" aria-label="How do you want to use SkipWait?" className="mt-6 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1.5">
            <button
              type="button"
              aria-pressed={intent === "seeker"}
              onClick={() => setIntent("seeker")}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-md text-xs font-semibold ${intent === "seeker" ? "bg-background text-foreground" : "text-muted-foreground"}`}
            >
              <Sparkles className="size-4" aria-hidden="true" />Find a referral
            </button>
            <button
              type="button"
              aria-pressed={intent === "referrer"}
              onClick={() => setIntent("referrer")}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-md text-xs font-semibold ${intent === "referrer" ? "bg-background text-foreground" : "text-muted-foreground"}`}
            >
              <ShieldCheck className="size-4" aria-hidden="true" />Give a referral
            </button>
          </div>

          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <span>
              {intent === "seeker"
                ? "Explore companies and send a thoughtful request."
                : "Choose who you help and keep your identity private."}
            </span>
            <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
          </p>

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={start}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-foreground bg-background px-5 text-sm font-semibold"
            >
              <span aria-hidden="true" className="font-bold">G</span>Continue with Google
            </button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              onClick={start}
              className="brand-button flex items-center justify-center gap-2 bg-primary text-primary-foreground"
            >
              <Mail className="size-4" aria-hidden="true" />Continue with email
            </button>
          </div>

          <p className="mt-5 text-sm">
            New to SkipWait?{" "}
            <button type="button" onClick={start} className="text-link font-semibold">Create a free account</button>
          </p>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            By continuing, you agree to the <Link href="/terms" className="text-link">Terms</Link> and acknowledge the{" "}
            <Link href="/privacy" className="text-link">Privacy Policy</Link>. Referrals are free and never guarantee an interview.
          </p>
        </div>
      </section>
    </main>
  );
}
