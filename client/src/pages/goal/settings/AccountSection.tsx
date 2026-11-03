// Goal /settings > Account: the work-email next step, device sessions and the
// account-deletion review request.
import { useCompanyAccess } from "@/components/settings/settingsQueries";
import { hasVerifiedWorkEmail, type TokenSource } from "@/components/settings/settingsApi";
import { GoalButton, GoalNextStep, GoalSkeletonRows, GoalVerifiedMark } from "@/components/goal";
import { Link } from "wouter";
import { DeleteAccountPanel, SessionsPanel } from "./accountPanels";

export default function AccountSection({ getToken, online }: { getToken: TokenSource; online: boolean }) {
  const access = useCompanyAccess(getToken);
  const verified = hasVerifiedWorkEmail(access.data);

  return (
    <>
      {access.isPending ? <div className="mt-2"><GoalSkeletonRows density="company" count={2} /></div> : null}

      {access.isError ? (
        <GoalNextStep reason="We could not check your work email. Nothing was changed.">
          <GoalButton className="mt-4" variant="primary" touch="large" busy={access.isFetching} busyLabel="Trying again…" onClick={() => { void access.refetch(); }}>Try again</GoalButton>
        </GoalNextStep>
      ) : null}

      {access.data ? (
        verified ? (
          <GoalNextStep reason="A verified company email unlocks private Job Referrer access. It is never shown to Job Seekers.">
            <GoalVerifiedMark as="p" className="mt-3">{`Verified · ${access.data.workEmailDomain ?? "work email"}`}</GoalVerifiedMark>
            <p className="mt-1 text-g-meta text-g-ink-2">Your account can receive private company referral requests.</p>
            <GoalButton className="mt-4" variant="primary" touch="large" asChild><Link href="/referrer">Switch to Job Referrer mode</Link></GoalButton>
          </GoalNextStep>
        ) : (
          <GoalNextStep reason="A verified company email unlocks private Job Referrer access. It is never shown to Job Seekers.">
            <p className="mt-3 text-g-label text-g-ink">No verified work email yet</p>
            <p className="mt-1 text-g-meta text-g-ink-2">Use a company email and confirm the one-time code to unlock Job Referrer mode.</p>
            <GoalButton className="mt-4" variant="primary" touch="large" asChild><Link href="/verify">Add work email</Link></GoalButton>
          </GoalNextStep>
        )
      ) : null}

      <SessionsPanel getToken={getToken} online={online} />
      <DeleteAccountPanel getToken={getToken} online={online} />
    </>
  );
}
