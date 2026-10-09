// Kit v4 referrer workspace "Setup & capacity" tab (app/src/routes/referrer.tsx)
// on live data: verified company from the work-email access record, primary
// work function, monthly capacity and pause from /api/referrer-preferences.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Check, Pause, ShieldCheck } from "lucide-react";
import { Button } from "@/components/kit/button";
import { ActionErrorCard } from "@/components/ActionErrorCard";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { CAPACITY_MAX, CAPACITY_MIN, WORK_FUNCTIONS, capacitySettingsKey, fetchCapacitySettings, orderAreas, saveCapacitySettings, type CapacitySettings, type TokenSource } from "./capacitySettingsData";

export function CapacitySettingsPanel({ isSignedIn, getToken, onSignIn }: { isSignedIn: boolean; getToken: TokenSource; onSignIn: () => void }) {
  const settings = useQuery({ queryKey: capacitySettingsKey, enabled: isSignedIn, retry: false, queryFn: () => fetchCapacitySettings(getToken) });
  let panel;
  if (!isSignedIn) {
    panel = (
      <div className="settings-panel">
        <strong className="text-base">Sign in with your work email to set your capacity.</strong>
        <p className="text-[13px] leading-[1.7] text-muted-foreground">Capacity and pause apply to private requests at the company you verify.</p>
        <Button type="button" variant="outline" className="justify-self-start" onClick={onSignIn}>Use company email <ArrowRight /></Button>
      </div>
    );
  } else if (settings.isPending) {
    panel = <LoadingSkeleton title="Loading your referrer settings…" caption="Checking your company and capacity." />;
  } else if (settings.isError) {
    panel = <ActionErrorCard title="We couldn’t load your settings" detail={settings.error.message} reassurance="Nothing changed. Your capacity and pause are as you left them." onRetry={() => { void settings.refetch(); }} retrying={settings.isFetching} />;
  } else {
    panel = <CapacityForm initial={settings.data} getToken={getToken} />;
  }
  return (
    <section className="settings-layout" data-skipwait-screen="referrer-setup-capacity">
      <div>
        <span className="eyebrow">AVAILABILITY</span>
        <h2>Protect your time.</h2>
        <p>Set clear boundaries before requests arrive. Change or pause them at any time.</p>
      </div>
      {panel}
    </section>
  );
}

function CapacityForm({ initial, getToken }: { initial: CapacitySettings; getToken: TokenSource }) {
  const queryClient = useQueryClient();
  const [area, setArea] = useState(initial.areas[0] ?? "");
  const [capacity, setCapacity] = useState(initial.capacity);
  const [paused, setPaused] = useState(initial.paused);
  const [savedAreas, setSavedAreas] = useState(initial.areas);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => saveCapacitySettings(getToken, { preferAreas: orderAreas(area, savedAreas), referralCapacity: capacity, paused }),
    onSuccess: next => {
      setSavedAreas(next.areas);
      setCapacity(next.capacity);
      setPaused(next.paused);
      setSaved(true);
      queryClient.setQueryData<CapacitySettings>(capacitySettingsKey, current => (current ? { ...current, ...next } : current));
    },
  });
  const edit = <T,>(setter: (value: T) => void) => (value: T) => { setSaved(false); setter(value); };

  return (
    <form className="settings-panel" onSubmit={event => { event.preventDefault(); setSaved(false); save.mutate(); }}>
      <div className="grid gap-2 text-[12px] font-semibold">
        <span>Company</span>
        {initial.companyDomain ? (
          <span className="flex h-[46px] items-center justify-between gap-3 rounded-[7px] border border-border px-3 text-[13px]">
            <span className="min-w-0 truncate">{initial.companyDomain}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5 font-normal text-muted-foreground"><ShieldCheck className="size-3.5 text-primary" />Verified work email</span>
          </span>
        ) : (
          <span className="flex min-h-[46px] flex-wrap items-center justify-between gap-2 rounded-[7px] border border-border px-3 py-2 text-[13px] font-normal text-muted-foreground">
            No verified work email yet
            <Link href="/verify" className="font-semibold text-primary">Verify work email</Link>
          </span>
        )}
      </div>
      <label>
        Work function
        <select value={area} onChange={event => edit(setArea)(event.target.value)}>
          <option value="">Choose a function</option>
          {WORK_FUNCTIONS.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="capacity-control">
        <span>Monthly request capacity <strong>{capacity}</strong></span>
        <input type="range" min={CAPACITY_MIN} max={CAPACITY_MAX} value={capacity} onChange={event => edit(setCapacity)(Number(event.target.value))} />
      </label>
      <Button className="pause-control" type="button" variant="ghost" aria-pressed={paused} onClick={() => edit(setPaused)(!paused)}>
        <span><Pause /><span><strong>Pause new requests</strong><small>Existing conversations stay available.</small></span></span>
        <span className={paused ? "switch on" : "switch"}><i /></span>
      </Button>
      {save.isError ? <p role="alert" className="rounded-[7px] border border-destructive/30 bg-destructive/10 p-3 text-sm font-normal text-destructive">{save.error.message}</p> : null}
      <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save settings"} <Check /></Button>
      <span role="status" className="design-note">{saved ? `SETTINGS SAVED${paused ? " · NEW REQUESTS PAUSED" : ""}` : "PAUSED REFERRERS GET NO NEW REVIEW EMAILS"}</span>
    </form>
  );
}
