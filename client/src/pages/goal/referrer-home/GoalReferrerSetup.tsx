// Goal /referrer-setup (D-048-p3-referrer-home; packet docs/plans/D-048-referrer.md).
// Goal-first rebuild of the kit setup wizard: four steps (areas, capacity,
// notifications, ready), one commit per step, saved through the shared
// referrerData path only. Sign-in goes through referrerSignInHref() only.
import { ArrowLeft, ArrowRight, BadgeCheck, Check } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalErrorState, GoalSkeletonRows } from "@/components/goal";
import { usePersistFn } from "@/hooks/usePersistFn";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { JOB_LEVELS, REFERRER_AREAS } from "@shared/jobFunctions";
import { companyIdentity, fetchCompanyAccess, fetchProfileHandle, fetchReferrerPreferences, saveReferrerPreferences, type CompanyAccess, type ReferrerPreferences, type TokenSource } from "@/components/referrer-home/referrerData";
import { minutesForCapacity } from "@/components/referrer-home/SetupWizard";

type SetupData = { access: CompanyAccess; preferences: ReferrerPreferences | null; handle: string | null };

async function fetchSetup(getToken: TokenSource): Promise<SetupData> {
  const access = await fetchCompanyAccess(getToken);
  if (!access.verified) return { access, preferences: null, handle: null };
  const [preferences, handle] = await Promise.all([fetchReferrerPreferences(getToken), fetchProfileHandle(getToken)]);
  return { access, preferences, handle };
}

const STEPS = ["Areas", "Capacity", "Notifications", "Ready"] as const;
const toggleItem = (list: string[], value: string) => (list.includes(value) ? list.filter(item => item !== value) : [...list, value]);

function Kicker({ children }: { children: string }) {
  return <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-g-ink" aria-hidden="true" />{children}</p>;
}

function ChipGroup({ label, options, selected, onToggle }: { label: string; options: readonly string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div>
      <h2 className="text-g-label font-semibold text-g-ink">{label}</h2>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map(option => (
          <button key={option} type="button" aria-pressed={selected.includes(option)} onClick={() => onToggle(option)} className={`min-h-9 rounded-g-control border px-3 text-g-small transition-colors ${selected.includes(option) ? "border-g-ink font-semibold text-g-ink" : "border-g-hairline text-g-ink-2 hover:border-g-control-edge hover:text-g-ink"}`}>{option}</button>
        ))}
      </div>
    </div>
  );
}

function GoalSetupWizard({ initial, companyName, profileHandle, fetchToken, onSaved }: { initial: ReferrerPreferences; companyName: string; profileHandle: string | null; fetchToken: TokenSource; onSaved: () => void }) {
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

  return (
    <div className="max-w-[640px]">
      <p className="flex items-center gap-2 text-g-small text-g-ink-2"><BadgeCheck className="h-4 w-4" aria-hidden="true" />Verified at {companyName}</p>
      <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Setup progress">
        {STEPS.map((label, index) => <li key={label}><span className={`block h-0.5 rounded-full ${index <= step ? "bg-g-ink" : "bg-g-hairline"}`} /><span className="mt-1.5 hidden font-g-mono text-[10px] uppercase tracking-[0.12em] text-g-ink-3 sm:block">{label}</span></li>)}
      </ol>

      {step === 0 ? (
        <section className="mt-6">
          <Kicker>STEP 1 OF 4</Kicker>
          <h1 className="mt-3 text-[28px] font-semibold leading-[1.08] tracking-[-0.02em]">Which roles can you judge?</h1>
          <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Pick the areas you can assess. Stored for when role matching ships.</p>
          <div className="mt-5 grid gap-5">
            <ChipGroup label="Job areas" options={REFERRER_AREAS} selected={areas} onToggle={value => setAreas(current => toggleItem(current, value))} />
            <ChipGroup label="Levels" options={JOB_LEVELS} selected={levels} onToggle={value => setLevels(current => toggleItem(current, value))} />
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="mt-6">
          <Kicker>STEP 2 OF 4</Kicker>
          <h1 className="mt-3 text-[28px] font-semibold leading-[1.08] tracking-[-0.02em]">How many asks a month?</h1>
          <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Be realistic - you can change or pause anytime.</p>
          <p className="mt-8 text-center text-[48px] font-semibold leading-none" aria-live="polite">{capacity}</p>
          <p className="mt-1 text-center text-g-meta text-g-ink-3">asks per month · about {minutesForCapacity(capacity)} minutes</p>
          <input type="range" min={1} max={15} value={capacity} onChange={event => setCapacity(Number(event.target.value))} className="mt-6 w-full accent-g-ink" aria-label="Monthly capacity" />
          <p className="mt-4 rounded-[10px] border border-g-hairline p-3 text-g-small text-g-ink-2">Most new referrers start with 3. Paused referrers stop getting new review emails.</p>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="mt-6">
          <Kicker>STEP 3 OF 4</Kicker>
          <h1 className="mt-3 text-[28px] font-semibold leading-[1.08] tracking-[-0.02em]">When should we tell you?</h1>
          <button type="button" aria-pressed={notifyEmail} onClick={() => setNotifyEmail(!notifyEmail)} className="mt-5 flex w-full items-center justify-between gap-3 rounded-[10px] border border-g-hairline p-4 text-left">
            <span><strong className="block text-g-label text-g-ink">Email when a new ask arrives</strong><span className="mt-0.5 block text-g-meta text-g-ink-3">Off means no review emails while you stay verified.</span></span>
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${notifyEmail ? "bg-g-ink" : "bg-g-hairline"}`}><i className={`absolute top-0.5 block h-4 w-4 rounded-full bg-white transition-all ${notifyEmail ? "left-[18px]" : "left-0.5"}`} /></span>
          </button>
          <p className="mt-3 text-g-meta text-g-ink-3">Safety and account notices are always sent.</p>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="mt-6" role="status">
          <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink"><Check className="h-4 w-4" aria-hidden="true" />Saved</p>
          <h1 className="mt-3 text-[28px] font-semibold leading-[1.08] tracking-[-0.02em]">{paused ? "Setup saved. New asks are paused." : "You're open for asks."}</h1>
          <p className="mt-2 text-g-small text-g-ink-2">{areas.join(", ") || "No areas yet"} · {levels.join(", ") || "All levels"} · {capacity}/month</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <GoalButton variant="outline" asChild><Link href={profileHandle ? `/p/${encodeURIComponent(profileHandle)}` : "/profile?focus=handle"}>Share my profile</Link></GoalButton>
            <GoalButton variant="primary" asChild><Link href="/referrer-home">Go to referrer home<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></GoalButton>
          </div>
        </section>
      ) : null}

      {save.isError ? <p role="alert" className="mt-4 rounded-[10px] border border-g-hairline p-3 text-g-small text-g-ink">{save.error.message || "We could not save your setup"}</p> : null}
      {step < 3 ? (
        <footer className="mt-8 flex justify-between">
          {step > 0 ? <GoalButton variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</GoalButton> : <span />}
          {step === 2
            ? <GoalButton variant="primary" busy={save.isPending} busyLabel="Saving…" onClick={() => save.mutate()}>Finish<ArrowRight className="h-4 w-4" aria-hidden="true" /></GoalButton>
            : <GoalButton variant="primary" disabledReason={step === 0 && areas.length === 0 ? "Pick at least one area" : undefined} onClick={() => setStep(step + 1)}>Continue<ArrowRight className="h-4 w-4" aria-hidden="true" /></GoalButton>}
        </footer>
      ) : null}
    </div>
  );
}

export default function GoalReferrerSetup() {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const setup = useQuery({ queryKey: ["referrer-setup", userId ?? null], queryFn: () => fetchSetup(fetchToken), enabled: Boolean(isSignedIn), retry: 1, refetchOnWindowFocus: false, staleTime: Infinity });

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="referrer-setup-sign-in" className="page-content bg-white font-g-sans text-g-ink">
        <div className="max-w-[560px]">
          <Kicker>REFERRER SETUP</Kicker>
          <h1 className="mt-3 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em]">Set up referring.</h1>
          <p className="mt-3 text-g-body leading-[1.6] text-g-ink-2">Sign in, verify a work email, then choose what you can judge.</p>
          <div className="mt-6"><GoalButton variant="primary" asChild><Link href={referrerSignInHref("/referrer-setup")}>Sign in with work email</Link></GoalButton></div>
        </div>
      </main>
    );
  }

  const data = setup.data;
  return (
    <main data-skipwait-screen="referrer-setup" className="page-content bg-white font-g-sans text-g-ink">
      {setup.isPending ? <GoalSkeletonRows density="company" count={3} /> : setup.isError ? (
        <GoalErrorState title="We could not load your setup." body={setup.error.message || "Check your connection and try again."} retry={{ label: setup.isFetching ? "Trying again…" : "Try again", onClick: () => { void setup.refetch(); } }} />
      ) : !data?.access.verified || !data.preferences ? (
        <div className="max-w-[560px] rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
          <Kicker>YOUR NEXT STEP</Kicker>
          <h1 className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">Verify first.</h1>
          <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Setup opens after a one-time code confirms your work email.</p>
          <div className="mt-5"><GoalButton variant="primary" asChild><Link href="/verify">Verify work email<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></GoalButton></div>
        </div>
      ) : (
        <GoalSetupWizard
          initial={data.preferences}
          companyName={data.access.domain ? companyIdentity(data.access).name : "your company"}
          profileHandle={data.handle}
          fetchToken={fetchToken}
          onSaved={() => { void queryClient.invalidateQueries({ queryKey: ["referrer-home"] }); void queryClient.invalidateQueries({ queryKey: ["referrer-setup"] }); }}
        />
      )}
    </main>
  );
}
