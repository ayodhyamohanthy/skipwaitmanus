// Kit v4 referrer-setup steps (app/src/routes/referrer-setup.tsx), seeded from
// the saved /api/referrer-preferences and persisted on Finish. Only settings
// the server stores and acts on are offered: areas and levels are stored for
// role matching, capacity, and the new-ask email switch.
import { ArrowLeft, ArrowRight, BadgeCheck, Bell, Check, Gauge, Layers } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Toggle } from "@/components/kit/preview-kit";
import { JOB_LEVELS, REFERRER_AREAS } from "@shared/jobFunctions";
import { saveReferrerPreferences, type ReferrerPreferences, type TokenSource } from "./referrerData";

const STEPS = ["Areas", "Capacity", "Notifications", "Ready"] as const;
const chip = (on: boolean) => `min-h-11 rounded-full border px-4 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`;
const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter(item => item !== value) : [...list, value]);

type Props = { initial: ReferrerPreferences; companyName: string; profileHandle: string | null; fetchToken: TokenSource; onSaved: () => void };

/** The kit's stated time estimate: about five minutes per ask, never under one. */
export const minutesForCapacity = (capacity: number) => Math.max(1, Math.round(capacity * 5));

export function SetupWizard({ initial, companyName, profileHandle, fetchToken, onSaved }: Props) {
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
    <>
      <div className="mb-4 flex items-center gap-2 text-sm"><BadgeCheck className="size-4 text-primary" />Verified at {companyName}</div>
      <ol className="mb-8 grid grid-cols-4 gap-1.5" aria-label="Setup progress">{STEPS.map((label, i) => <li key={label}><span className={`block h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} /><span className="mt-1.5 hidden text-xs text-muted-foreground sm:block">{label}</span></li>)}</ol>

      {step === 0 ? <section><Layers className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">Which roles can you judge?</h1><p className="mt-2 text-muted-foreground">Pick the areas you can assess. Stored for when role matching ships.</p>
        <h2 className="mt-6 text-sm font-semibold">Job areas</h2><div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Job areas">{REFERRER_AREAS.map(area => <button key={area} type="button" aria-pressed={areas.includes(area)} onClick={() => setAreas(current => toggle(current, area))} className={chip(areas.includes(area))}>{area}</button>)}</div>
        <h2 className="mt-6 text-sm font-semibold">Levels</h2><div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Levels">{JOB_LEVELS.map(level => <button key={level} type="button" aria-pressed={levels.includes(level)} onClick={() => setLevels(current => toggle(current, level))} className={chip(levels.includes(level))}>{level}</button>)}</div>
      </section> : null}

      {step === 1 ? <section><Gauge className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">How many asks a month?</h1><p className="mt-2 text-muted-foreground">Be realistic — you can change or pause anytime.</p>
        <p className="mt-8 text-center text-6xl font-semibold" aria-live="polite">{capacity}</p><p className="text-center text-sm text-muted-foreground">asks per month · about {minutesForCapacity(capacity)} minutes</p>
        <input type="range" min={1} max={15} value={capacity} onChange={event => setCapacity(Number(event.target.value))} className="mt-6 w-full" aria-label="Monthly capacity" />
        <p className="mt-4 rounded-xl bg-muted p-3 text-sm">Most new referrers start with 3. Paused referrers stop getting new review emails.</p>
      </section> : null}

      {step === 2 ? <section><Bell className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">When should we tell you?</h1>
        <div className="mt-6"><Toggle on={notifyEmail} onChange={setNotifyEmail} label="Email when a new ask arrives" hint="Off means no review emails while you stay verified." /></div>
        <p className="mt-3 text-xs text-muted-foreground">Safety and account notices are always sent.</p>
      </section> : null}

      {step === 3 ? <section className="text-center"><Check className="mx-auto size-12 text-primary" /><h1 className="mt-4 text-3xl font-semibold">{paused ? "Setup saved. New asks are paused." : "You're open for asks."}</h1>
        <p className="mt-2 text-muted-foreground">{areas.join(", ") || "No areas yet"} · {levels.join(", ") || "All levels"} · {capacity}/month</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3"><Button variant="outline" asChild><Link href={profileHandle ? `/p/${encodeURIComponent(profileHandle)}` : "/profile?focus=handle"}>Share my profile</Link></Button><Button asChild><Link href="/referrer-home">Go to referrer home <ArrowRight /></Link></Button></div>
      </section> : null}

      {save.isError ? <p role="alert" className="mt-4 text-sm font-semibold text-destructive">{save.error.message || "We could not save your setup"}</p> : null}
      {step < 3 ? <footer className="mt-10 flex justify-between">
        {step > 0 ? <Button variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft />Back</Button> : <span />}
        {step === 2
          ? <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : <>Finish <ArrowRight /></>}</Button>
          : <Button disabled={step === 0 && areas.length === 0} onClick={() => setStep(step + 1)}>Continue <ArrowRight /></Button>}
      </footer> : null}
    </>
  );
}
