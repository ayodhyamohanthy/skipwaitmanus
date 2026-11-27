// Goal /sign-in (D-048-p3-signin; packet docs/plans/D-048-auth.md and its
// November 11 correction). Opens with one goal line, keeps D-033's choice of
// side, and puts the chosen side's sign-in in the one "Your next step" block.
// FOUNDER-LOCKED login rule (D-030 as amended by D-049/D-057): job seekers use
// a personal email with password (or, under D-406, an emailed link + code),
// a social provider or a saved passkey (GoalSeekerForm);
// referrers use the work-email code only (GoalReferrerCodeForm), never personal
// email, social or passkey. Return targets are the kit page's, unchanged.
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "wouter";
import { BetaNoticeLine } from "@/components/BetaNotice";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { ONE_TAP_PAY_SIGNIN } from "@/lib/oneTap";
import { safeReturnTo } from "@/lib/referrerSignIn";
import { safeSignInReturnTo } from "@shared/authReturnTo";
import { cn } from "@/lib/utils";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";
import { PASSWORD_AUTH_COPY, USE_PASSWORD_SIGN_IN_COPY, USE_PASSWORD_SIGN_IN_REASON, USE_WORK_EMAIL_CODE_REASON } from "@shared/passwordAuth";
import { EMAIL_LINK_MARKER, EMAIL_SIGN_IN_LINK_ENABLED, parseEmailSignInHash, type EmailLinkPlane, type EmailSignInLink } from "@shared/emailSignIn";
import { GoalEmailLinkConfirm } from "./GoalEmailLinkConfirm";
import { GoalReferrerCodeForm } from "./GoalReferrerCodeForm";
import { GoalAuthFrame } from "./GoalAuthFrame";
import { GoalPasskeyManageLink, GoalSeekerForm, SEEKER_EMAIL_FIELD_ID } from "./GoalSeekerForm";

export const GOAL_PAGE = { goalLine: "Sign in to find or give a referral." } as const;

/** D-414: comparison and real-phone acceptance precede activation. */
export const MOBILE_SIGNIN_V2 = false;

const PHONE_QUERY = "(max-width: 640px)";
function subscribePhone(onChange: () => void) {
  const query = window.matchMedia?.(PHONE_QUERY);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}
const isPhone = () => window.matchMedia?.(PHONE_QUERY).matches ?? window.innerWidth < 641;
const notPhone = () => false;

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

/** D-406: an emailed sign-in link opens /sign-in with the email and code in the fragment. */
type EmailedLinkState = { status: "absent" } | { status: "invalid"; plane: EmailLinkPlane } | { status: "valid"; link: EmailSignInLink };

function emailedLink(enabled: boolean): EmailedLinkState {
  if (!enabled || typeof window === "undefined") return { status: "absent" };
  const hash = window.location.hash;
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (body !== EMAIL_LINK_MARKER && !body.startsWith(`${EMAIL_LINK_MARKER}&`)) return { status: "absent" };
  const link = parseEmailSignInHash(hash);
  if (link) return { status: "valid", link };
  const params = new URLSearchParams(body.slice(EMAIL_LINK_MARKER.length + 1));
  return { status: "invalid", plane: params.get("p") === "r" ? "r" : "s" };
}

export default function GoalSignInPage({ emailLinkEnabled = EMAIL_SIGN_IN_LINK_ENABLED, mobileSignInEnabled = MOBILE_SIGNIN_V2 }: { emailLinkEnabled?: boolean; mobileSignInEnabled?: boolean } = {}) {
  const [link, setLink] = useState<EmailedLinkState>(() => emailedLink(emailLinkEnabled));
  const linkPlane = link.status === "valid" ? link.link.plane : link.status === "invalid" ? link.plane : null;
  const [intent, setIntent] = useState<Intent>(() => (linkPlane === "r" || searchParam("intent") === "referrer" ? "referrer" : "seeker"));
  const phone = useSyncExternalStore(subscribePhone, isPhone, notPhone);
  const compact = mobileSignInEnabled && phone;
  const [roleChosen, setRoleChosen] = useState(() => link.status !== "absent" || searchParam("intent") === "seeker" || searchParam("intent") === "referrer");
  useEffect(() => {
    if (link.status === "absent") return;
    // Clear every marked link, including malformed ones, without changing the path or query.
    try { window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search); } catch { /* best effort */ }
  }, [link.status]);
  const requestedReturnTo = searchParam("returnTo");
  const referrerReturnTo = safeReturnTo(requestedReturnTo, INTENT_RETURN_TO.referrer);
  const origin = typeof window === "undefined" ? "https://skipwait.me" : window.location.origin;
  // D-095: a seeker returns to a purchase only with one-tap pay on; /admin and passkey management always return.
  const seekerReturnTo = ONE_TAP_PAY_SIGNIN || requestedReturnTo?.startsWith("/admin") || requestedReturnTo === "/sign-in?passkeys=manage"
    ? safeSignInReturnTo(requestedReturnTo, origin) ?? INTENT_RETURN_TO.seeker
    : INTENT_RETURN_TO.seeker;
  const reason = searchParam("reason");
  const workEmailRefused = intent === "referrer" && reason === USE_WORK_EMAIL_CODE_REASON;
  const passwordElsewhere = intent === "seeker" && reason === USE_PASSWORD_SIGN_IN_REASON;
  const copy = COPY[intent];

  if (compact) {
    const choosing = !roleChosen && link.status === "absent";
    const roleLabel = intent === "seeker" ? "I want a referral" : "I can refer someone";
    return (
      <GoalAuthFrame screen="sign-in" page="sign-in" compact
        goalLine={choosing ? "What brings you here?" : intent === "seeker" ? "Sign in to get referred." : "Sign in with your work email."}>
        {choosing ? (
          <div role="group" aria-label="I am here to" className="mt-6 grid gap-3">
            {SIDES.map(({ id, Icon }) => (
              <button key={id} type="button" onClick={() => { setIntent(id); setRoleChosen(true); }}
                className="flex min-h-20 items-center gap-3 rounded-g-tile border border-g-control-edge p-4 text-left hover:bg-g-surface-hover">
                <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
                <span><span className="block text-g-label">{id === "seeker" ? "I want a referral" : "I can refer someone"}</span>
                  <span className="mt-1 block text-g-meta text-g-ink-2">{id === "seeker" ? "Get introduced by someone inside." : "Help people through your company's process."}</span></span>
              </button>
            ))}
          </div>
        ) : (
          <>
            {link.status === "absent" ? (
              <div className="mt-2 flex min-h-11 items-center justify-between gap-2 text-g-meta text-g-ink-2">
                <span>You chose {roleLabel}</span>
                <button type="button" className="min-h-11 px-2 font-semibold text-g-ink underline underline-offset-2" onClick={() => setRoleChosen(false)}>Switch</button>
              </div>
            ) : null}
            <section aria-label="Your next step" className="mt-3">
              {workEmailRefused ? <p role="status" className="mb-2 text-g-meta text-g-crimson">{PASSWORD_AUTH_COPY.use_work_email_code}</p> : null}
              {passwordElsewhere ? <p role="status" className="mb-2 text-g-meta text-g-crimson">{USE_PASSWORD_SIGN_IN_COPY}</p> : null}
              {link.status !== "absent"
                ? <GoalEmailLinkConfirm link={link.status === "valid" ? link.link : null} returnTo={linkPlane === "r" ? referrerReturnTo : seekerReturnTo} onRestart={() => { setLink({ status: "absent" }); setIntent(linkPlane === "r" ? "referrer" : "seeker"); setRoleChosen(true); }} />
                : intent === "referrer"
                  ? <div data-testid="referrer-work-email-otp"><GoalReferrerCodeForm compact onSignedIn={() => window.location.assign(referrerReturnTo)} /></div>
                  : <GoalSeekerForm compact returnTo={seekerReturnTo} emailLinkEnabled={emailLinkEnabled} />}
            </section>
            {intent === "referrer" ? <p className="mt-4 text-g-meta text-g-ink-2">Always free. Referrers are never paid.</p> : null}
          </>
        )}
        <p className="mt-auto pt-4 text-g-badge text-g-ink-3">By continuing, you agree to the <Link href="/terms" className={LINK}>Terms</Link> and acknowledge the <Link href="/privacy" className={LINK}>Privacy Policy</Link>.</p>
      </GoalAuthFrame>
    );
  }
  return (
    <GoalAuthFrame
      screen="sign-in"
      page="sign-in"
      goalLine={GOAL_PAGE.goalLine}
      lead={<p>{copy.lead}</p>}
      skip={intent === "seeker" ? { label: "Continue with email", onActivate: () => document.getElementById(SEEKER_EMAIL_FIELD_ID)?.focus() } : undefined}
    >
      <BetaNoticeLine tone="goal" />
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
          {workEmailRefused ? <p role="status" className="mt-2 text-g-meta text-g-crimson">{PASSWORD_AUTH_COPY.use_work_email_code}</p> : null}
          {passwordElsewhere ? <p role="status" className="mt-2 text-g-meta text-g-crimson">{USE_PASSWORD_SIGN_IN_COPY}</p> : null}
          {link.status !== "absent"
            ? <GoalEmailLinkConfirm link={link.status === "valid" ? link.link : null} returnTo={linkPlane === "r" ? referrerReturnTo : seekerReturnTo} onRestart={() => { setLink({ status: "absent" }); if (link.status === "valid") setIntent(link.link.plane === "r" ? "referrer" : "seeker"); }} />
            : intent === "referrer"
              ? <div data-testid="referrer-work-email-otp" className="mt-4"><GoalReferrerCodeForm onSignedIn={() => window.location.assign(referrerReturnTo)} /></div>
              : <GoalSeekerForm returnTo={seekerReturnTo} emailLinkEnabled={emailLinkEnabled} />}
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
