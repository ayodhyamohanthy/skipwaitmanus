import { Github, Mail } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/kit/button";
import { safeSignInReturnTo } from "@shared/authReturnTo";
import { PasswordForm, type PasswordMode } from "./seeker-sign-in/PasswordForm";
import { CheckEmailStep } from "./seeker-sign-in/CheckEmailStep";

/**
 * Job-seeker sign-in, fully on skipwait.me (never the hosted WorkOS page). FOUNDER-LOCKED login rule, Oct 16 2026,
 * amended by D-049 (owner, Oct 18 2026): job seekers get every social login plus personal email with a password,
 * checked server-side by WorkOS (/api/auth/password/*). There is no code to type anywhere (D-078 ruling 2): a new
 * account, or an address not yet confirmed, gets an emailed link that sets the password on /reset-password.
 * Referrers never render this (see ReferrerOtpSignIn).
 * Social buttons go straight to the provider (seekerSocialUrl always names it).
 */
/**
 * Providers offered to seekers. All five render (re-verified Oct 16 2026: WorkOS redirects each one to the
 * provider's own authorize page). Drop an id from WORKING_SOCIAL_IDS if a provider app stops accepting
 * WorkOS's callback URL, so a click never ends on a provider error page.
 */
type SocialProvider = { readonly id: string; readonly label: string; readonly mark: ReactNode };
const ALL_SOCIAL: readonly SocialProvider[] = [
  { id: "google", label: "Google", mark: "G" },
  { id: "microsoft", label: "Microsoft", mark: "M" },
  { id: "github", label: "GitHub", mark: <Github /> },
  { id: "linkedin", label: "LinkedIn", mark: "in" },
  { id: "slack", label: "Slack", mark: "S" },
];
const WORKING_SOCIAL_IDS: readonly string[] = ["google", "github", "microsoft", "linkedin", "slack"];
export const SEEKER_SOCIAL = ALL_SOCIAL.filter(p => WORKING_SOCIAL_IDS.includes(p.id));

export function seekerSocialUrl(provider: string, returnTo: string): string {
  return `/api/auth/workos/sign-in?${new URLSearchParams({ returnTo, provider })}`;
}

type Stage = { readonly kind: "options" } | { readonly kind: "password"; readonly mode: PasswordMode } | { readonly kind: "check_email"; readonly email: string; readonly origin: PasswordMode };

export function SeekerSignIn({ returnTo: requestedReturnTo = "/explore" }: { returnTo?: string }) {
  // Re-validated here so no caller can turn sign-in into an open redirect or a loop back to an auth page.
  const returnTo = safeSignInReturnTo(requestedReturnTo, typeof window === "undefined" ? "https://skipwait.me" : window.location.origin) ?? "/explore";
  const [stage, setStage] = useState<Stage>({ kind: "options" });
  const [email, setEmail] = useState("");

  if (stage.kind === "check_email") {
    return <CheckEmailStep email={stage.email} origin={stage.origin} onBack={() => setStage({ kind: "password", mode: stage.origin })} />;
  }
  const creating = stage.kind === "password" && stage.mode === "sign_up";
  return <>
    {stage.kind === "password"
      ? <PasswordForm key={stage.mode} mode={stage.mode} email={email} onEmailChange={setEmail} returnTo={returnTo} onCheckEmail={(sentTo, origin) => setStage({ kind: "check_email", email: sentTo, origin })} onBack={() => setStage({ kind: "options" })} />
      : <div className="auth-options" data-testid="seeker-sign-in">
          {SEEKER_SOCIAL.map(item => <Button key={item.id} type="button" variant="outline" className="google-button" onClick={() => window.location.assign(seekerSocialUrl(item.id, returnTo))}><span className="google-g" aria-hidden="true">{item.mark}</span>Continue with {item.label}</Button>)}
          <div className="auth-divider"><span>or</span></div>
          <Button type="button" onClick={() => setStage({ kind: "password", mode: "sign_in" })}><Mail />Continue with email</Button>
        </div>}
    <p className="auth-new">{creating
      ? <>Already have an account? <Button type="button" variant="link" onClick={() => setStage({ kind: "password", mode: "sign_in" })}>Sign in</Button></>
      : <>New to skipwait.me? <Button type="button" variant="link" onClick={() => setStage({ kind: "password", mode: "sign_up" })}>Create a free account</Button></>}</p>
  </>;
}
