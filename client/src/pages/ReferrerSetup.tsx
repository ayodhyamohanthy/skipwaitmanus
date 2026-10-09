import { ArrowRight, BadgeCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { Button, buttonVariants } from "@/components/kit/button";
import { Heading, Panel } from "@/components/kit/preview-kit";
import { SetupWizard } from "@/components/referrer-home/SetupWizard";
import { companyIdentity, fetchCompanyAccess, fetchReferrerPreferences, type CompanyAccess, type ReferrerPreferences, type TokenSource } from "@/components/referrer-home/referrerData";

type SetupData = { access: CompanyAccess; preferences: ReferrerPreferences | null };

async function fetchSetup(getToken: TokenSource): Promise<SetupData> {
  const access = await fetchCompanyAccess(getToken);
  if (!access.verified) return { access, preferences: null };
  return { access, preferences: await fetchReferrerPreferences(getToken) };
}

export default function ReferrerSetup() {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  // Seeded once from the saved settings; the wizard owns edits until Finish.
  const setup = useQuery({ queryKey: ["referrer-setup", userId ?? null], queryFn: () => fetchSetup(fetchToken), enabled: Boolean(isSignedIn), retry: 1, refetchOnWindowFocus: false, staleTime: Infinity });

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="referrer-setup-sign-in" className="page-content mx-auto max-w-2xl">
        <Heading eyebrow="REFERRER SETUP" title="Set up referring" text="Sign in, verify a work email, then choose what you can judge." />
        <SignInButton className={buttonVariants()}>Sign in</SignInButton>
      </main>
    );
  }

  const data = setup.data;
  return (
    <main data-skipwait-screen="referrer-setup" className="page-content mx-auto max-w-2xl">
      {setup.isPending ? <p role="status" className="mt-10 text-center text-sm text-muted-foreground">Loading your referrer setup…</p> : setup.isError ? (
        <Panel tone="muted" className="text-center">
          <h1 className="text-2xl font-semibold">We could not load your setup.</h1>
          <p role="alert" className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{setup.error.message || "Check your connection and try again."}</p>
          <Button className="mt-4" disabled={setup.isFetching} onClick={() => { void setup.refetch(); }}>{setup.isFetching ? "Trying again…" : "Try again"}</Button>
        </Panel>
      ) : !data?.access.verified || !data.preferences ? (
        <Panel className="text-center">
          <BadgeCheck className="mx-auto mb-3 size-8 text-primary" />
          <h1 className="text-2xl font-semibold">Verify first.</h1>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">Setup opens after a one-time code confirms your work email.</p>
          <Button className="mt-6" asChild><Link href="/verify">Verify work email <ArrowRight /></Link></Button>
        </Panel>
      ) : (
<<<<<<< HEAD
        <>
          <div className="mb-4 flex items-center gap-2 text-sm"><BadgeCheck className="size-4 text-[var(--primary)]" />Verified referrer setup</div>
          <ol className="mb-8 grid grid-cols-5 gap-1.5" aria-label="Setup progress">
            {STEPS.map((label, i) => (
              <li key={label}><span className={`block h-1.5 rounded-full ${i <= step ? "bg-[var(--primary)]" : "bg-[var(--muted)]"}`} /><span className="mt-1.5 hidden text-xs text-[var(--muted-foreground)] sm:block">{label}</span></li>
            ))}
          </ol>

          {step === 0 ? (
            <section>
              <Layers className="mb-3 text-[var(--primary)]" /><h1 className="text-3xl font-semibold">Which roles can you judge?</h1><p className="mt-2 text-[var(--muted-foreground)]">Pick the areas you can assess. Stored for when role matching ships.</p>
              <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Job areas">
                {FUNCTIONS.map(area => {
                  const on = areas.includes(area);
                  return <button key={area} type="button" aria-pressed={on} onClick={() => toggleArea(area)} className={`min-h-11 rounded-full border px-4 text-sm ${on ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)]"}`}>{area}</button>;
                })}
              </div>
              <h2 className="mt-8 text-sm font-semibold">Levels</h2>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Levels">
                {LEVELS.map(level => {
                  const on = levels.includes(level);
                  return <button key={level} type="button" aria-pressed={on} onClick={() => toggleLevel(level)} className={`min-h-11 rounded-full border px-4 text-sm ${on ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)]"}`}>{level}</button>;
                })}
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section>
              <Gauge className="mb-3 text-[var(--primary)]" /><h1 className="text-3xl font-semibold">How many asks a month?</h1><p className="mt-2 text-[var(--muted-foreground)]">Be realistic — you can change or pause anytime.</p>
              <p className="mt-8 text-center text-6xl font-semibold" aria-live="polite">{capacity}</p>
              <p className="text-center text-sm text-[var(--muted-foreground)]">asks per month</p>
              <input type="range" min={1} max={15} value={capacity} onChange={event => setCapacity(Number(event.target.value))} className="mt-6 w-full" aria-label="Monthly capacity" />
              <p className="mt-4 rounded-xl bg-[var(--muted)] p-3 text-sm">Most new referrers start with 3. Paused or full referrers stop getting new review emails.</p>
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <UserRound className="mb-3 text-[var(--primary)]" /><h1 className="text-3xl font-semibold">How should seekers see you?</h1>
              <div className="mt-6 grid gap-3" role="radiogroup" aria-label="Visibility">
                {([["anon", "Anonymous (recommended)", "“Someone at your company”. Name shown after you accept."], ["named", "Named on company pages", "Your name appears where company referrers are listed."] ] as const).map(([value, title, hint]) => (
                  <button key={value} type="button" role="radio" aria-checked={visibility === value} onClick={() => setVisibility(value)} className={`rounded-2xl border p-4 text-left ${visibility === value ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
                    <strong className="block">{title}</strong><small className="text-[var(--muted-foreground)]">{hint}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section>
              <Bell className="mb-3 text-[var(--primary)]" /><h1 className="text-3xl font-semibold">When should we tell you?</h1>
              <button type="button" aria-pressed={notifyEmail} onClick={() => setNotifyEmail(!notifyEmail)} className={`mt-6 flex min-h-14 w-full items-center justify-between rounded-2xl border p-4 text-left ${notifyEmail ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
                <span><strong className="block text-sm">Email when a new ask arrives</strong><small className="text-[var(--muted-foreground)]">Off means no review emails while you stay verified.</small></span>
                <span aria-hidden="true" className={`grid size-6 place-items-center rounded-full ${notifyEmail ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--muted)]"}`}>{notifyEmail ? <Check className="size-4" /> : null}</span>
              </button>
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">Safety and account notices are always sent.</p>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="text-center">
              <Check className="mx-auto size-12 text-[var(--primary)]" />
              <h1 className="mt-4 text-3xl font-semibold">You&apos;re open for asks.</h1>
              <p className="mt-2 text-[var(--muted-foreground)]">{areas.join(", ") || "No areas yet"} · {levels.join(", ") || "All levels"} · {capacity}/month · {visibility === "anon" ? "anonymous" : "named"}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/profile" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Get my public profile link</Link>
                <Link href="/profile" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Edit profile</Link>
                <Link href="/referrer-home" className="brand-button">Go to referrer home <ArrowRight /></Link>
              </div>
            </section>
          ) : null}

          {error ? <p role="alert" className="mt-4 text-sm font-semibold text-[var(--destructive)]">{error}</p> : null}
          {step < 4 ? (
            <footer className="mt-10 flex justify-between gap-3">
              {step > 0 ? <button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={() => setStep(step - 1)}><ArrowLeft />Back</button> : <span />}
              {step === 3
                ? <button type="button" disabled={saving} onClick={() => { void save(); }} className="brand-button">{saving ? "Saving…" : <>Finish <ArrowRight /></>}</button>
                : <button type="button" disabled={step === 0 && areas.length === 0} onClick={() => setStep(step + 1)} className="brand-button">Continue <ArrowRight /></button>}
            </footer>
          ) : null}
        </>
=======
        <SetupWizard
          initial={data.preferences}
          companyName={data.access.domain ? companyIdentity(data.access.domain).name : "your company"}
          fetchToken={fetchToken}
          onSaved={() => { void queryClient.invalidateQueries({ queryKey: ["referrer-home"] }); void queryClient.invalidateQueries({ queryKey: ["referrer-setup"] }); }}
        />
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81
      )}
    </main>
  );
}
