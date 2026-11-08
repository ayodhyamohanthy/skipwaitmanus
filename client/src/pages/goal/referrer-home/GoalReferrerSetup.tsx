// Goal /referrer-setup (D-048-p3-referrer-home; packet docs/plans/D-048-referrer.md).
// Four steps, one commit per screen; save only through the read-only referrerData API.
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalEmptyState, GoalErrorState, GoalNextStep, GoalNum, GoalSkeletonRows, GoalVerifiedMark, useOnlineStatus } from "@/components/goal";
import { usePersistFn } from "@/hooks/usePersistFn";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { companyIdentity, fetchCompanyAccess, fetchProfileHandle, fetchReferrerPreferences, saveReferrerPreferences, type CompanyAccess, type ReferrerPreferences, type TokenSource } from "@/components/referrer-home/referrerData";
import { JOB_LEVELS, REFERRER_AREAS } from "@shared/jobFunctions";
import { REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";

// Goal-local copy of the review-time estimate. A goal page stays inside its own tree, so it
// does not import the kit SetupWizard module for a one-line formula.
const minutesForCapacity = (capacity: number) => Math.max(1, Math.round(capacity * 5));

export const GOAL_PAGE = { goalLine: "Help people get referred at your company." } as const;

const STEPS = ["Roles", "Capacity", "Notifications", "Ready"] as const;
const toggleItem = (list: string[], value: string) => (list.includes(value) ? list.filter(item => item !== value) : [...list, value]);

type SetupData = { access: CompanyAccess; preferences: ReferrerPreferences | null; handle: string | null };

async function fetchSetup(getToken: TokenSource): Promise<SetupData> {
  const access = await fetchCompanyAccess(getToken);
  if (!access.verified) return { access, preferences: null, handle: null };
  const [preferences, handle] = await Promise.all([fetchReferrerPreferences(getToken), fetchProfileHandle(getToken)]);
  return { access, preferences, handle };
}

function GoalIntro({ companyName }: { companyName?: string | null }) {
  return (
    <header className="max-w-[720px]">
      <h1 className="text-balance text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
      <p className="mt-3 max-w-[620px] text-g-body text-g-ink-2">Choose the roles you can review and a monthly limit that fits your time.</p>
      {companyName ? <GoalVerifiedMark as="p" mutedText className="mt-3">{`Verified at ${companyName}`}</GoalVerifiedMark> : null}
      <p className="mt-3 text-g-meta text-g-ink-2">{REFERRER_MONEY_SENTENCE}</p>
    </header>
  );
}

function OfflineNotice() {
  return (
    <p data-testid="goal-offline-state" role="status" className="mt-4 flex items-center gap-2 text-g-meta text-g-ink-2">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-g-ink" />
      You’re offline. Information may be out of date until you reconnect.
    </p>
  );
}

function ChipGroup({ label, options, selected, onToggle }: { label: string; options: readonly string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div>
      <h4 className="text-g-label font-semibold text-g-ink">{label}</h4>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map(option => (
          <button key={option} type="button" aria-pressed={selected.includes(option)} onClick={() => onToggle(option)} className={`min-h-9 rounded-g-control border px-3 text-g-meta transition-colors ${selected.includes(option) ? "border-g-ink font-semibold text-g-ink" : "border-g-hairline text-g-ink-2 hover:border-g-control-edge hover:text-g-ink"}`}>{option}</button>
        ))}
      </div>
    </div>
  );
}

function StepProgress({ current }: { current: number }) {
  return (
    <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Setup progress">
      {STEPS.map((label, index) => (
        <li key={label} aria-current={index === current ? "step" : undefined}>
          <span aria-hidden="true" className={`block h-0.5 rounded-full ${index <= current ? "bg-g-ink" : "bg-g-hairline"}`} />
          <span className="sr-only">{index === current ? `Current step: ${label}` : `${label} step`}</span>
          <span aria-hidden="true" className="mt-1.5 hidden text-g-meta text-g-ink-3 gdesk:block">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function GoalSetupWizard({ initial, companyName, profileHandle, fetchToken, onSaved, online }: { initial: ReferrerPreferences; companyName: string; profileHandle: string | null; fetchToken: TokenSource; onSaved: () => void; online: boolean }) {
  const [step, setStep] = useState(0);
  const [areas, setAreas] = useState<string[]>(initial.preferAreas);
  const [levels, setLevels] = useState<string[]>(initial.preferLevels);
  const [capacity, setCapacity] = useState(initial.referralCapacity);
  const [notifyEmail, setNotifyEmail] = useState(initial.notifyNewAsk);
  const save = useMutation({
    mutationFn: () => saveReferrerPreferences(fetchToken, { preferAreas: areas, preferLevels: levels, referralCapacity: capacity, notifyNewAsk: notifyEmail }),
    onSuccess: () => { setStep(3); onSaved(); },
  });
  const paused = save.data?.paused ?? initial.paused;
  const stepReason = [
    "Choose the roles and levels you can review confidently.",
    "Choose a monthly limit that fits your schedule.",
    "Choose whether to receive emails when new referral requests arrive.",
    "Your preferences are saved. You can update them whenever you need.",
  ][step];

  return (
    <div className="max-w-[760px]">
      <StepProgress current={step} />
      <GoalNextStep reason={stepReason}>
        {step === 0 ? (
          <section className="mt-3">
            <h3 className="text-g-heading text-g-ink">Which roles can you judge?</h3>
            <p className="mt-2 text-g-meta text-g-ink-2">Pick the areas you can assess. These preferences help guide future role matching.</p>
            <div className="mt-5 grid gap-5">
              <ChipGroup label="Job areas" options={REFERRER_AREAS} selected={areas} onToggle={value => setAreas(current => toggleItem(current, value))} />
              <ChipGroup label="Levels" options={JOB_LEVELS} selected={levels} onToggle={value => setLevels(current => toggleItem(current, value))} />
            </div>
            <footer className="mt-6 flex justify-end">
              <GoalButton variant="primary" touch="large" disabledReason={areas.length === 0 ? "Pick at least one area" : undefined} onClick={() => setStep(1)}>Continue<ArrowRight className="size-4" aria-hidden="true" /></GoalButton>
            </footer>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="mt-3">
            <h3 className="text-g-heading text-g-ink">How many referral requests can you review each month?</h3>
            <p className="mt-2 text-g-meta text-g-ink-2">Choose a limit you can keep. You can change it or pause new requests at any time.</p>
            <p className="mt-6 text-center text-g-body text-g-ink" aria-live="polite"><GoalNum>{capacity}</GoalNum> referral requests each month</p>
            <p className="mt-1 text-center text-g-meta text-g-ink-3">About <GoalNum>{minutesForCapacity(capacity)}</GoalNum> minutes of review time</p>
            <input type="range" min={1} max={15} value={capacity} onChange={event => setCapacity(Number(event.target.value))} className="mt-5 w-full accent-g-ink" aria-label="Monthly referral capacity" />
            <p className="mt-4 rounded-g-tile border border-g-hairline p-3 text-g-meta text-g-ink-2">When paused, you will not receive new referral-request emails.</p>
            <footer className="mt-6 flex justify-between">
              <GoalButton variant="ghost" onClick={() => setStep(0)}><ArrowLeft className="size-4" aria-hidden="true" />Back</GoalButton>
              <GoalButton variant="primary" touch="large" onClick={() => setStep(2)}>Continue<ArrowRight className="size-4" aria-hidden="true" /></GoalButton>
            </footer>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="mt-3">
            <h3 className="text-g-heading text-g-ink">When should we notify you?</h3>
            <button type="button" aria-pressed={notifyEmail} onClick={() => setNotifyEmail(!notifyEmail)} className="mt-5 flex min-h-14 w-full items-center justify-between gap-3 rounded-g-tile border border-g-hairline p-4 text-left">
              <span><strong className="block text-g-label text-g-ink">Email when a new referral request arrives</strong><span className="mt-1 block text-g-meta text-g-ink-3">Turn this off to stop referral-request emails while you stay verified.</span></span>
              <span aria-hidden="true" className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${notifyEmail ? "bg-g-ink" : "bg-g-hairline"}`}><i className={`absolute top-0.5 block size-4 rounded-full bg-g-surface transition-all ${notifyEmail ? "left-[18px]" : "left-0.5"}`} /></span>
            </button>
            <p className="mt-3 text-g-meta text-g-ink-3">Safety and account notices are always sent.</p>
            {!online ? <p className="mt-3 text-g-meta text-g-ink-2">Reconnect before saving your preferences.</p> : null}
            {save.isError ? <p role="alert" className="mt-3 text-g-meta text-g-ink">{save.error.message || "We could not save your preferences."}</p> : null}
            <footer className="mt-6 flex justify-between">
              <GoalButton variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="size-4" aria-hidden="true" />Back</GoalButton>
              <GoalButton variant="primary" touch="large" busy={save.isPending} busyLabel="Saving…" disabledReason={!online ? "Reconnect to save your referral preferences." : undefined} onClick={() => save.mutate()}>Finish<ArrowRight className="size-4" aria-hidden="true" /></GoalButton>
            </footer>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="mt-3" role="status">
            <p className="flex items-center gap-2 text-g-meta text-g-ink"><Check className="size-4" aria-hidden="true" />Saved</p>
            <h3 className="mt-3 text-g-heading text-g-ink">{paused ? "Your setup is saved. New referral requests are paused." : "You’re ready to review referral requests."}</h3>
            <p className="mt-2 text-g-meta text-g-ink-2">{areas.join(", ") || "No areas yet"} · {levels.join(", ") || "All levels"} · <GoalNum>{capacity}</GoalNum> per month</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <GoalButton variant="outline" asChild><Link href={profileHandle ? `/p/${encodeURIComponent(profileHandle)}` : "/profile?focus=handle"}>Share my profile</Link></GoalButton>
              <GoalButton variant="primary" touch="large" asChild><Link href="/referrer-home">Go to referrer home<ArrowRight className="size-4" aria-hidden="true" /></Link></GoalButton>
            </div>
          </section>
        ) : null}
      </GoalNextStep>
    </div>
  );
}

export default function GoalReferrerSetup() {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const setup = useQuery({ queryKey: ["referrer-setup", userId ?? null], queryFn: () => fetchSetup(fetchToken), enabled: Boolean(isSignedIn), retry: 1, refetchOnWindowFocus: false, staleTime: Infinity });
  const data = setup.data;
  const companyName = data?.access.verified ? (data.access.domain ? companyIdentity(data.access).name : "your company") : null;

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="referrer-setup-sign-in" data-goal-page="referrer-setup" className="g-scope mx-auto w-full max-w-[1120px] bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-8 gdesk:py-8">
        <GoalIntro />
        <div className="mt-6 max-w-[760px]">
          <GoalNextStep reason="Sign in with your work email to set referral preferences for your company.">
            <GoalButton variant="primary" touch="large" asChild><Link href={referrerSignInHref("/referrer-setup")}>Sign in with work email</Link></GoalButton>
          </GoalNextStep>
        </div>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="referrer-setup" data-goal-page="referrer-setup" className="g-scope mx-auto w-full max-w-[1120px] bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-8 gdesk:py-8">
      <GoalIntro companyName={companyName} />
      {!online ? <OfflineNotice /> : null}
      <div className="mt-6 max-w-[760px]">
        {setup.isPending ? (
          <>
            <GoalNextStep reason="We are checking your verified work email and saved referral preferences.">
              <GoalButton variant="primary" touch="large" asChild><Link href="/referrer-home">Open referrer home</Link></GoalButton>
            </GoalNextStep>
            <GoalSkeletonRows density="company" count={3} className="mt-5 px-0" />
          </>
        ) : setup.isError ? (
          <>
            <GoalNextStep reason="Return to your referrer home while we reconnect.">
              <GoalButton variant="primary" touch="large" asChild><Link href="/referrer-home">Open referrer home</Link></GoalButton>
            </GoalNextStep>
            <GoalErrorState className="mt-3 px-0" title="We could not load your setup." body={setup.error.message || "Check your connection and try again."} retry={{ label: setup.isFetching ? "Trying again…" : "Try again", onClick: () => { void setup.refetch(); } }} />
          </>
        ) : !data?.access.verified || !data.preferences ? (
          <>
            <GoalNextStep reason="Verify your work email before choosing referral preferences.">
              <GoalButton variant="primary" touch="large" asChild><Link href="/verify">Verify work email<ArrowRight className="size-4" aria-hidden="true" /></Link></GoalButton>
            </GoalNextStep>
            <GoalEmptyState className="mt-3" title="Verify first." body="Setup opens after a one-time code confirms your work email." />
          </>
        ) : (
          <GoalSetupWizard
            initial={data.preferences}
            companyName={companyName ?? "your company"}
            profileHandle={data.handle}
            fetchToken={fetchToken}
            online={online}
            onSaved={() => { void queryClient.invalidateQueries({ queryKey: ["referrer-home"] }); void queryClient.invalidateQueries({ queryKey: ["referrer-setup"] }); }}
          />
        )}
      </div>
    </main>
  );
}
