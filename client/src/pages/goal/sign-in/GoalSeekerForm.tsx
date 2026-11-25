// The job seeker's side of the goal /sign-in (D-048-p3-signin, D-354).
// FOUNDER-LOCKED login rule (D-030 as amended by D-049/D-057): personal email
// with password, every social provider straight to WorkOS on skipwait.me,
// and device-saved passkeys. The six-digit seeker code is retired (D-049, D-078).
// New accounts are link-based (Option B, D-078 ruling 2). Referrers never render this.
import { CircleAlert, Eye, EyeOff, MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalField, GoalTextInput } from "@/components/goal/GoalField";
import { PasskeyAutofill, PasskeyEnrollmentOffer, PasskeySignInButton, usePasskeyAvailability } from "@/components/goal/GoalPasskeySignIn";
import { useOnlineStatus } from "@/components/goal/useOnlineStatus";
import { forgetSignInEmail, rememberedSignInEmail, rememberSignInEmail } from "@/lib/rememberedSignInEmail";
import { passwordStepSchema } from "@shared/passwordAuth";
import { postPasswordAuth } from "@/lib/passwordAuthClient";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { GOAL_SEEKER_SOCIAL, goalSeekerSocialUrl } from "./seekerSocial";

export type PasswordMode = "sign_in" | "sign_up";
export const LOCKED_SIGN_IN_HINT = "You can also use Forgot password, or continue with Google.";

export const SEEKER_EMAIL_FIELD_ID = "seeker-email";
const OFFLINE_REASON = "You are offline. Reconnect to sign in.";

type Stage = "credentials" | "check_email" | "enroll";

function FormError({ text }: { text: string }) {
  return text ? (
    <p role="alert" className="flex items-start gap-2 text-g-meta text-g-crimson">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{text}
    </p>
  ) : null;
}

/** "Manage saved passkeys", shown only where the server has passkeys on. */
export function GoalPasskeyManageLink() {
  const passkeys = usePasskeyAvailability();
  if (!passkeys.enabled) return null;
  return <a href="/sign-in?passkeys=manage" className="inline-flex min-h-11 items-center text-g-meta text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">Manage saved passkeys</a>;
}

export function GoalSeekerForm({ returnTo }: { returnTo: string }) {
  const passkeys = usePasskeyAvailability();
  const online = useOnlineStatus();
  const [mode, setMode] = useState<PasswordMode>("sign_in");
  const [stage, setStage] = useState<Stage>("credentials");
  const [email, setEmail] = useState(() => rememberedSignInEmail("seeker"));
  const [remembered, setRemembered] = useState(() => rememberedSignInEmail("seeker") !== "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [workEmail, setWorkEmail] = useState(false);
  const cleanEmail = email.trim().toLowerCase();
  const creating = mode === "sign_up";
  const ready = cleanEmail !== "" && (creating || password !== "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !ready || !online) return;
    setBusy(true);
    setError("");
    setWorkEmail(false);
    try {
      const result = creating
        ? await postPasswordAuth("/api/auth/password/sign-up", { email: cleanEmail }, passwordStepSchema)
        : await postPasswordAuth("/api/auth/password/sign-in", { email: cleanEmail, password, returnTo }, passwordStepSchema);

      if (!result.ok) {
        setError(result.code === "rate_limited" && !creating ? `${result.message} ${LOCKED_SIGN_IN_HINT}` : result.message);
        setWorkEmail(result.code === "use_work_email_code");
        setBusy(false);
        return;
      }

      if (result.data.step === "signed_in") {
        rememberSignInEmail("seeker", email);
        let alreadyOffered = false;
        try {
          alreadyOffered = Boolean(localStorage.getItem(`skipwait_passkey_enrolled_${cleanEmail}`) || localStorage.getItem(`skipwait_passkey_dismissed_${cleanEmail}`));
        } catch { /* storage restricted: offer again */ }
        if (passkeys.enabled && typeof window.PublicKeyCredential !== "undefined" && !alreadyOffered) {
          setStage("enroll");
          setBusy(false);
          return;
        }
        window.location.assign(result.data.redirectTo || returnTo);
        return;
      }

      setBusy(false);
      setStage("check_email");
    } catch {
      setError("We could not complete your request. Try again shortly.");
      setBusy(false);
    }
  }

  if (stage === "enroll") {
    return <div data-testid="seeker-sign-in" className="mt-4"><PasskeyEnrollmentOffer enabled={passkeys.enabled} email={cleanEmail} returnTo={returnTo} /></div>;
  }

  if (stage === "check_email") {
    return (
      <div data-testid="seeker-check-email" className="mt-4 grid gap-3" aria-live="polite">
        <p className="flex items-center gap-2 text-g-label text-g-ink font-semibold">
          <MailCheck className="size-4 text-g-emerald" aria-hidden="true" />Check your email
        </p>
        <p className="text-g-meta text-g-ink-2 leading-relaxed">
          {creating
            ? <>If <strong className="break-all text-g-ink">{cleanEmail}</strong> can use a password on skipwait.me, we&apos;ve sent it a link to set one. Open it to finish creating your account.</>
            : <>To keep your account safe, this address needs confirming first. If <strong className="break-all text-g-ink">{cleanEmail}</strong> can sign in with a password, we&apos;ve sent it a link to set your password and finish signing in.</>}
        </p>
        <p className="text-g-meta text-g-ink-3 leading-relaxed">
          Already have an account with this email? The link sets a new password for that same account. It works once and can take a few minutes, so check spam too.
        </p>
        <p className="text-g-meta text-g-ink-3 leading-relaxed">
          Give referrals? Referrers have no password: <a href={referrerSignInHref()} className="underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">sign in with your work email</a>.
        </p>
        <GoalButton type="button" variant="ghost" className="w-full" onClick={() => { setStage("credentials"); setPassword(""); setError(""); }}>Use a different email</GoalButton>
      </div>
    );
  }

  return (
    <form data-testid="seeker-sign-in" className="mt-4 grid gap-3" onSubmit={submit} noValidate>
      <PasskeyAutofill enabled={passkeys.enabled} returnTo={returnTo} />
      <GoalField
        label="Email address"
        htmlFor={SEEKER_EMAIL_FIELD_ID}
        help={creating ? "We'll email you a link to set your password. It's how we know the address is yours." : undefined}
      >
        <GoalTextInput
          id={SEEKER_EMAIL_FIELD_ID}
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete={passkeys.enabled ? "username webauthn" : "email"}
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={event => { setEmail(event.target.value); setError(""); setWorkEmail(false); }}
        />
      </GoalField>
      {remembered ? (
        <button
          type="button"
          className="min-h-11 self-start text-g-meta text-g-ink-2 underline decoration-g-control-edge underline-offset-[3px] hover:text-g-ink"
          onClick={() => { forgetSignInEmail("seeker"); setRemembered(false); setEmail(""); document.getElementById(SEEKER_EMAIL_FIELD_ID)?.focus(); }}
        >
          Not you? Forget this email
        </button>
      ) : null}

      {creating ? (
        <p className="text-g-meta text-g-ink-3 leading-relaxed">
          Use a personal email address. Work emails at companies on skipwait.me sign in with a work-email code under Give a referral.
        </p>
      ) : (
        <GoalField label="Password" htmlFor="seeker-password">
          <div className="relative flex items-center">
            <GoalTextInput
              id="seeker-password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              value={password}
              onChange={event => { setPassword(event.target.value); setError(""); setWorkEmail(false); }}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-2 p-1 text-g-ink-3 hover:text-g-ink"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(v => !v)}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <div className="mt-1">
            <Link href="/forgot-password" className="text-g-meta text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">
              Forgot password?
            </Link>
          </div>
        </GoalField>
      )}

      <FormError text={error} />
      {workEmail ? (
        <p className="text-g-meta text-g-crimson">
          <a href={referrerSignInHref()} className="underline underline-offset-[3px]">Sign in with your work-email code</a>
        </p>
      ) : null}
      {!online ? <p role="status" className="text-g-meta text-g-ink-2">{OFFLINE_REASON}</p> : null}

      <GoalButton
        type="submit"
        variant="primary"
        className="w-full"
        busy={busy}
        busyLabel={creating ? "Creating account…" : "Signing in…"}
        disabledReason={!online ? OFFLINE_REASON : !ready ? (creating ? "Enter your email" : "Enter your email and password") : undefined}
      >
        {creating ? "Create account" : "Sign in"}
      </GoalButton>

      {creating ? (
        <p className="text-center text-g-meta text-g-ink-2">
          Already have an account?{" "}
          <button type="button" className="text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink" onClick={() => { setMode("sign_in"); setError(""); }}>
            Sign in
          </button>
        </p>
      ) : (
        <>
          <p className="text-center text-g-meta text-g-ink-2">
            New to skipwait.me?{" "}
            <button type="button" className="text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink" onClick={() => { setMode("sign_up"); setError(""); }}>
              Create a free account
            </button>
          </p>
          <p className="text-center text-g-meta text-g-ink-3">
            Signed in with a code before? Use Forgot password to set one. It&apos;s the same account.
          </p>
        </>
      )}

      <div className="flex items-center gap-3 text-g-meta text-g-ink-3" aria-hidden="true"><span className="h-px flex-1 bg-g-hairline" />or<span className="h-px flex-1 bg-g-hairline" /></div>
      <PasskeySignInButton enabled={passkeys.enabled} returnTo={returnTo} />
      <div className="grid gap-2 gdesk:grid-cols-2">
        {GOAL_SEEKER_SOCIAL.map((item, index) => (
          <GoalButton key={item.id} type="button" variant="outline" className={`w-full border-g-control-edge${index === 0 ? " gdesk:col-span-2" : ""}`} onClick={() => window.location.assign(goalSeekerSocialUrl(item.id, returnTo))}>
            Continue with {item.label}
          </GoalButton>
        ))}
      </div>
    </form>
  );
}
