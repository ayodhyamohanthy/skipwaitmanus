// Goal /sign-in (D-048-p3-signin; packet docs/plans/D-048-auth.md and its
// November 11 correction). Opens with one goal line, keeps D-033's choice of
// side, and puts the chosen side's sign-in in the one "Your next step" block.
// FOUNDER-LOCKED login rule (D-030 as amended by D-049/D-057): job seekers use
// a personal email and password, a social provider or a saved passkey (GoalSeekerForm);
// referrers use the work-email code only (GoalReferrerCodeForm), never personal
// email, social or passkey. Return targets are the kit page's, unchanged.
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { BetaNoticeLine } from "@/components/BetaNotice";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { ONE_TAP_PAY_SIGNIN } from "@/lib/oneTap";
import { safeReturnTo } from "@/lib/referrerSignIn";
import { cn } from "@/lib/utils";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";
import { safeSignInReturnTo } from "@shared/authReturnTo";
import { PASSWORD_AUTH_COPY, USE_PASSWORD_SIGN_IN_COPY, USE_PASSWORD_SIGN_IN_REASON, USE_WORK_EMAIL_CODE_REASON } from "@shared/passwordAuth";
import { GoalReferrerCodeForm } from "./GoalReferrerCodeForm";
import { GoalAuthFrame } from "./GoalAuthFrame";
import { GoalPasskeyManageLink, GoalSeekerForm, SEEKER_EMAIL_FIELD_ID } from "./GoalSeekerForm";

export const GOAL_PAGE = { goalLine: "Sign in to find or give a referral." } as const;

type Intent = "seeker" | "referrer";

/** Where each side lands after signing in: the job search, or referrer setup (work-email verification). */
const INTENT_RETURN_TO: Readonly<Record<Intent, string>> = { seeker: "/explore", referrer: "/referrer-setup" };

const SIDES = [
  { id: "seeker", title: "Find a referral", sub: "I am looking for a job", Icon: Sparkles },
  { id: "referrer", title: "Give a referral", sub: "I work at a company", Icon: ShieldCheck },
] as const;

const COPY: Readonly<Record<Intent, { lead: string; reason: string }>> = {
  seeker: {
    lead: "Send referral requests to verified employees at the companies you want. Browsing companies needs no account.",
    reason: "Sign in with a personal email or a social account.",
  },
  referrer: {
    lead: "See referral requests for your company and choose who you refer. Basic referring is free.",
    reason: "Sign in with your company email. A one-time code proves where you work.",
  },
};

const LINK = "underline decoration-g-control-edge underline-offset-[3px] transition-colors duration-(--g-dur-hover) ease-g-out hover:decoration-g-ink";

function searchParam(name: string): string | null {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(name);
}

export default function GoalSignInPage() {
  const [intent, setIntent] = useState<Intent>(() => (searchParam("intent") === "referrer" ? "referrer" : "seeker"));
  const requestedReturnTo = searchParam("returnTo");
  const referrerReturnTo = safeReturnTo(requestedReturnTo, INTENT_RETURN_TO.referrer);
  // D-095: a seeker returns to a purchase only with one-tap pay on; /admin and passkey management always return.
  const seekerReturnTo = ONE_TAP_PAY_SIGNIN || requestedReturnTo?.startsWith("/admin") || requestedReturnTo === "/sign-in?passkeys=manage"
    ? safeSignInReturnTo(requestedReturnTo, window.location.origin) ?? INTENT_RETURN_TO.seeker
    : INTENT_RETURN_TO.seeker;
  const reason = searchParam("reason");
  const reasonCopy = intent === "referrer" && reason === USE_WORK_EMAIL_CODE_REASON ? PASSWORD_AUTH_COPY.use_work_email_code
    : intent === "seeker" && reason === USE_PASSWORD_SIGN_IN_REASON ? USE_PASSWORD_SIGN_IN_COPY : "";
  const copy = COPY[intent];

  return (
    <GoalAuthFrame
      screen="sign-in"
      page="sign-in"
      goalLine={GOAL_PAGE.goalLine}
      lead={<p>{copy.lead}</p>}
      skip={intent === "seeker" ? { label: "Continue with email", onActivate: () => document.getElementById(SEEKER_EMAIL_FIELD_ID)?.focus() } : undefined}
    >
      <BetaNoticeLine tone="goal" />
      {reasonCopy && <p role="status" className="mt-4 text-g-meta text-g-ink-2">{reasonCopy}</p>}
      <div role="group" aria-label="I am here to" className="mt-6 grid grid-cols-2 gap-3">
        {SIDES.map(({ id, title, sub, Icon }) => {
          const selected = intent === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => setIntent(id)}
              className={cn(
                "relative min-h-11 rounded-g-tile border p-4 text-left transition-colors duration-(--g-dur-hover) ease-g-out",
                selected ? "border-g-ink bg-g-surface-selected" : "border-g-control-edge bg-g-surface hover:bg-g-surface-hover",
              )}
            >
              <Icon aria-hidden="true" className="size-4 text-g-ink-2" strokeWidth={1.75} />
              <span className="mt-2 block text-g-label text-g-ink">{title}</span>
              <span className="mt-0.5 block text-g-meta text-g-ink-3">{sub}</span>
              {selected ? <Check aria-hidden="true" className="absolute right-3 top-3 size-4 text-g-ink" strokeWidth={1.75} /> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-6">
        <GoalNextStep reason={copy.reason}>
          {intent === "referrer"
            ? <div data-testid="referrer-work-email-otp" className="mt-4"><GoalReferrerCodeForm onSignedIn={() => window.location.assign(referrerReturnTo)} /></div>
            : <GoalSeekerForm returnTo={seekerReturnTo} />}
        </GoalNextStep>
      </div>
      {intent === "referrer"
        ? <p className="mt-4 text-g-meta text-g-ink-3">Work email only. We never use personal email or social logins for referrers.</p>
        : <div className="mt-2"><GoalPasskeyManageLink /></div>}
      <p className="mt-6 border-t border-g-hairline pt-5 text-g-meta text-g-ink-3">
        By continuing, you agree to the <Link href="/terms" className={LINK}>Terms</Link> and acknowledge the <Link href="/privacy" className={LINK}>Privacy Policy</Link>. {MONEY_SENTENCE_SHORT} A referral never guarantees an interview.
      </p>
    </GoalAuthFrame>
  );
}
