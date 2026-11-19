import { OneTapShareActions } from "@/components/OneTapShareActions";

/**
 * Company-coverage growth loop: one link a verified employee (or an invited
 * colleague) can share so someone else at the same company verifies a work
 * email and chooses whether to help. Informational, never a gate.
 */
export function ReferralCoverageInviteBanner({ companyDomain, inviteCode }: { companyDomain: string; inviteCode?: string }) {
  const origin = typeof window === "undefined" ? "https://skipwait.me" : window.location.origin;
  const link = `${origin}/referrer?company=${encodeURIComponent(companyDomain)}${inviteCode ? `&invite=${encodeURIComponent(inviteCode)}` : ""}`;
  return (
    <section aria-label={`Strengthen private coverage at ${companyDomain}`} className="w-full rounded-[8px] border border-border bg-muted p-4 text-left">
      <p className="eyebrow text-foreground">Strengthen private coverage</p>
      <p className="mt-2 text-sm leading-6 text-foreground">
        <strong>{companyDomain}</strong> has a waiting private referral request. Share one link with a trusted colleague there — they verify a work email and choose whether to help.
      </p>
      <OneTapShareActions
        title={`Strengthen private coverage at ${companyDomain}`}
        message={`A private referral request is waiting at ${companyDomain}. If you work there, verify a work email and choose whether to help:`}
        link={link}
        className="mt-3"
      />
    </section>
  );
}
