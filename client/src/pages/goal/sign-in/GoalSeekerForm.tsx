// D-049/D-078: personal email + password, email-only link signup, five socials and saved seeker passkeys.
// The email remains first (D-095); referrers never render this form.
import { CircleAlert } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { Link } from "wouter";
import { safeSignInReturnTo } from "@shared/authReturnTo";
import { EMAIL_MAX, PASSWORD_AUTH_COPY, passwordSignInRequestSchema, passwordSignUpRequestSchema, passwordStepSchema, type PasswordAuthErrorCode } from "@shared/passwordAuth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalField, GoalTextInput } from "@/components/goal/GoalField";
import { PasskeyAutofill, PasskeyEnrollmentOffer, PasskeySignInButton, usePasskeyAvailability } from "@/components/goal/GoalPasskeySignIn";
import { useOnlineStatus } from "@/components/goal/useOnlineStatus";
import { postPasswordAuth } from "@/lib/passwordAuthClient";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { forgetSignInEmail, rememberedSignInEmail, rememberSignInEmail } from "@/lib/rememberedSignInEmail";
import { GoalCheckEmailStep } from "./GoalCheckEmailStep";
import { GoalPasswordField } from "./GoalPasswordField";
import { GOAL_SEEKER_SOCIAL, goalSeekerSocialUrl } from "./seekerSocial";

export const SEEKER_EMAIL_FIELD_ID = "seeker-email";
const OFFLINE_REASON = "You are offline. Your email is kept; try again when you are back online.";
const LINK = "inline-flex min-h-11 items-center text-g-meta text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink";
type Stage = "sign_in" | "sign_up" | "check_email" | "enroll";

export function GoalPasskeyManageLink() {
  const passkeys = usePasskeyAvailability();
  return passkeys.enabled ? <a href="/sign-in?passkeys=manage" className={LINK}>Manage saved passkeys</a> : null;
}

export function GoalSeekerForm({ returnTo }: { returnTo: string }) {
  const passkeys = usePasskeyAvailability();
  const online = useOnlineStatus();
  const [stage, setStage] = useState<Stage>("sign_in");
  const [email, setEmail] = useState(() => rememberedSignInEmail("seeker"));
  const [remembered, setRemembered] = useState(() => rememberedSignInEmail("seeker") !== "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<PasswordAuthErrorCode | "network" | null>(null);
  const [signedInReturnTo, setSignedInReturnTo] = useState("/explore");
  const destination = safeSignInReturnTo(returnTo, window.location.origin) ?? "/explore";
  const cleanEmail = email.trim().toLowerCase();
  const signup = stage === "sign_up";
  const validEmail = passwordSignUpRequestSchema.safeParse({ email }).success;
  const valid = signup ? validEmail : passwordSignInRequestSchema.safeParse({ email, password, returnTo: destination }).success;
  const clearError = () => { setError(""); setErrorCode(null); };

  function changeStage(next: Stage) {
    if (inFlight.current) return;
    setStage(next); setPassword(""); clearError();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !online || !valid) return;
    inFlight.current = true; setBusy(true); clearError();
    try {
      const request = signup
        ? passwordSignUpRequestSchema.parse({ email })
        : passwordSignInRequestSchema.parse({ email, password, returnTo: destination });
      const result = await postPasswordAuth(`/api/auth/password/${signup ? "sign-up" : "sign-in"}`, request, passwordStepSchema);
      if (!result.ok) {
        setErrorCode(result.code);
        setError(result.code === "rate_limited" && !signup ? `${result.message} You can also use Forgot password, or continue with Google.` : result.message);
        return;
      }
      if (result.data.step === "check_email") { setPassword(""); setStage("check_email"); return; }
      const target = safeSignInReturnTo(result.data.redirectTo, window.location.origin);
      if (signup || !target) { setError(PASSWORD_AUTH_COPY.temporarily_unavailable); return; }
      rememberSignInEmail("seeker", cleanEmail);
      setPassword(""); setSignedInReturnTo(target);
      let alreadyOffered = false;
      try {
        alreadyOffered = Boolean(localStorage.getItem(`skipwait_passkey_enrolled_${cleanEmail}`) || localStorage.getItem(`skipwait_passkey_dismissed_${cleanEmail}`));
      } catch { /* Restricted storage must not block sign-in. */ }
      if (passkeys.enabled && typeof window.PublicKeyCredential !== "undefined" && !alreadyOffered) { setStage("enroll"); return; }
      window.location.assign(target);
    } finally { inFlight.current = false; setBusy(false); }
  }

  if (stage === "enroll") return <div data-testid="seeker-sign-in" className="mt-4"><PasskeyEnrollmentOffer enabled={passkeys.enabled} email={cleanEmail} returnTo={signedInReturnTo} /></div>;
  if (stage === "check_email") return <GoalCheckEmailStep email={cleanEmail} onChangeEmail={() => changeStage("sign_in")} />;

  return <form data-testid="seeker-sign-in" className="mt-4 grid gap-3" onSubmit={submit} noValidate>
    {!signup && <PasskeyAutofill enabled={passkeys.enabled} returnTo={destination} />}
    <GoalField label="Email address" htmlFor={SEEKER_EMAIL_FIELD_ID} help={signup ? "We'll email you a link to set your password." : undefined}>
      <GoalTextInput id={SEEKER_EMAIL_FIELD_ID} name="email" type="email" placeholder="you@example.com" maxLength={EMAIL_MAX}
        autoComplete={!signup && passkeys.enabled ? "username webauthn" : "email"} autoCapitalize="none" spellCheck={false} required value={email}
        onChange={event => { setEmail(event.target.value); clearError(); }} />
    </GoalField>
    {remembered && <button type="button" className={LINK} aria-disabled={busy || undefined} onClick={() => {
      if (inFlight.current) return;
      forgetSignInEmail("seeker"); setRemembered(false); setEmail(""); setPassword(""); clearError(); document.getElementById(SEEKER_EMAIL_FIELD_ID)?.focus();
    }}>Not you? Forget this email</button>}
    {signup ? <p className="text-g-meta text-g-ink-2">Use a personal email address. Work emails at companies on skipwait.me sign in with a work-email code under Give a referral.</p> : <>
      <GoalPasswordField id="seeker-password" label="Password" value={password} current onChange={value => { setPassword(value); clearError(); }} />
      <Link href="/forgot-password" className={LINK}>Forgot password?</Link>
      <p className="text-g-meta text-g-ink-2">Signed in with a code before? Use Forgot password to set one. It's the same account.</p>
    </>}
    {error && <p role="alert" className="flex items-start gap-2 text-g-meta text-g-crimson"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{error}</p>}
    {errorCode === "use_work_email_code" && <a href={referrerSignInHref()} className={LINK}>Sign in with your work-email code</a>}
    {!online && <p role="status" className="text-g-meta text-g-ink-2">{OFFLINE_REASON}</p>}
    <GoalButton type="submit" variant="primary" className="w-full" busy={busy} busyLabel={signup ? "Sending link…" : "Signing in…"}
      disabledReason={!online ? OFFLINE_REASON : !valid ? signup ? "Enter a valid email address" : "Enter your email and password" : undefined}>{signup ? "Create account" : "Sign in"}</GoalButton>
    <GoalButton type="button" variant="ghost" className="w-full" disabledReason={busy ? "Sign-in in progress" : undefined} onClick={() => changeStage(signup ? "sign_in" : "sign_up")}>{signup ? "Back to sign in" : "Create a free account"}</GoalButton>
    <div className="flex items-center gap-3 text-g-meta text-g-ink-3" aria-hidden="true"><span className="h-px flex-1 bg-g-hairline" />or<span className="h-px flex-1 bg-g-hairline" /></div>
    <PasskeySignInButton enabled={passkeys.enabled && !busy} returnTo={destination} />
    <div className="grid gap-2 gdesk:grid-cols-2">
      {GOAL_SEEKER_SOCIAL.map((item, index) => <GoalButton key={item.id} type="button" variant="outline" disabledReason={busy ? "Sign-in in progress" : undefined}
        className={`w-full border-g-control-edge${index === 0 ? " gdesk:col-span-2" : ""}`} onClick={() => window.location.assign(goalSeekerSocialUrl(item.id, destination))}>Continue with {item.label}</GoalButton>)}
    </div>
  </form>;
}
