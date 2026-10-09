// Kit v4 "Set up as a referrer" dialog (app/src/routes/referrer.tsx, step
// "Verify work email.") hosting the real work-email OTP sign-in. The kit
// dialog is a preview; here the step IS the live flow: the OTP verifies the
// company address and signs the referrer in (ReferrerOtpSignIn reloads).
import { useEffect, useRef } from "react";
import { MailCheck, X } from "lucide-react";
import { Button } from "@/components/kit/button";
import { ReferrerOtpSignIn } from "@/components/ReferrerOtpSignIn";
import { ReferralCoverageInviteBanner } from "./CoverageInviteBanner";

/**
 * One-shot marker for "this tab just completed the referrer OTP sign-in".
 * ReferrerOtpSignIn reloads the page on success; the marker lets /referrer
 * keep its post-sign-in landing (inbox or returnTo) without bouncing every
 * later visit to the workspace overview.
 */
export const REFERRER_OTP_LANDING_KEY = "skipwait:referrer-otp-landing";

export function markReferrerOtpLanding(active: boolean) {
  try {
    if (active) window.sessionStorage.setItem(REFERRER_OTP_LANDING_KEY, "1");
    else window.sessionStorage.removeItem(REFERRER_OTP_LANDING_KEY);
  } catch {
    // Storage can be unavailable (private mode); the landing then stays on the overview.
  }
}

export function consumeReferrerOtpLanding(): boolean {
  try {
    const pending = window.sessionStorage.getItem(REFERRER_OTP_LANDING_KEY) === "1";
    if (pending) window.sessionStorage.removeItem(REFERRER_OTP_LANDING_KEY);
    return pending;
  } catch {
    return false;
  }
}

export function ReferrerSignInDialog({ inviteCompany, inviteCode, onClose }: { inviteCompany?: string; inviteCode?: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    markReferrerOtpLanding(true);
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      markReferrerOtpLanding(false);
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => { markReferrerOtpLanding(false); onClose(); };

  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="referrer-sign-in-title"
        onClick={event => event.stopPropagation()}
        className="relative max-h-[calc(100dvh-40px)] w-full max-w-[440px] overflow-y-auto rounded-[24px] border-2 border-foreground bg-background p-9 shadow-[var(--shadow-offset)] outline-none max-md:mb-[65px] max-md:self-end max-md:px-6 max-md:py-[30px]"
      >
        <Button type="button" variant="ghost" size="icon" className="dialog-close" aria-label="Close setup" onClick={close}><X /></Button>
        <span className="eyebrow">REFERRER SETUP</span>
        {inviteCompany ? <div className="mt-5"><ReferralCoverageInviteBanner companyDomain={inviteCompany} inviteCode={inviteCode} /></div> : null}
        <div className="setup-step mt-6">
          <MailCheck />
          <h2 id="referrer-sign-in-title" className="text-[28px] font-semibold">Verify work email.</h2>
          <p className="mb-3 text-sm leading-[1.7] text-muted-foreground">This confirms access to a company email address—not employment or employer endorsement.</p>
        </div>
        <ReferrerOtpSignIn />
      </section>
    </div>
  );
}
