// Kit v4 "Set up as a referrer" dialog (app/src/routes/referrer.tsx) on live
// state: 1. the private profile seekers see, 2. work-email verification read
// from /api/company-referrals/access (done, or a link to /verify), 3. the
// primary work function saved through PUT /api/referrer-preferences.
// Signed-out visitors meet ReferrerSignInDialog first; this one needs a session.
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Check, ChevronDown, LoaderCircle, MailCheck, UserRound, X } from "lucide-react";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { Button } from "@/components/kit/button";
import { saveReferrerPreferences } from "@/components/referrer-home/referrerData";
import { WORK_FUNCTIONS, capacitySettingsKey, fetchCapacitySettings, orderAreas } from "./capacitySettingsData";

const LAST_STEP = 2;

export function ReferrerSetupDialog({ initialStep = 0, onClose }: { initialStep?: number; onClose: () => void }) {
  const { getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: capacitySettingsKey, queryFn: () => fetchCapacitySettings(fetchToken), retry: false });
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), LAST_STEP));
  const [picked, setPicked] = useState("");
  const area = picked || settings.data?.areas[0] || WORK_FUNCTIONS[0];
  const save = useMutation({
    mutationFn: (saved: readonly string[]) => saveReferrerPreferences(fetchToken, { preferAreas: orderAreas(area, saved) }),
    onSuccess: () => {
      for (const queryKey of [capacitySettingsKey, ["referrer-home"], ["referrer-setup"]]) void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const domain = settings.data?.companyDomain ?? null;
  const finish = () => {
    if (save.isPending) return;
    // Never overwrite saved areas that could not be read: reload them first.
    if (!settings.data) { void settings.refetch(); return; }
    save.mutate(settings.data.areas);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="app-dialog referrer-setup outline-none" role="dialog" aria-modal="true" aria-labelledby="setup-title" onClick={event => event.stopPropagation()}>
        <Button type="button" variant="ghost" size="icon" className="dialog-close" aria-label="Close setup" onClick={onClose}><X /></Button>
        <span className="eyebrow">REFERRER SETUP · {step + 1} OF 3</span>
        <div className="request-progress" aria-hidden="true">{[0, 1, 2].map(index => <span key={index} className={index <= step ? "reached" : ""} />)}</div>
        {step === 0 ? (
          <div className="setup-step">
            <UserRound />
            <h2 id="setup-title">Your private profile.</h2>
            <p>Your name is not listed publicly. Seekers see the company, not who refers.</p>
            <div className="profile-preview"><span className="company-mark">?</span><span><strong>Verified person inside</strong><small>Identity shown after acceptance</small></span></div>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="setup-step">
            <MailCheck />
            <h2 id="setup-title">Verify work email.</h2>
            <p>This confirms access to a company email address—not employment or employer endorsement.</p>
            {settings.isPending ? (
              <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />Checking your work email…</span>
            ) : domain ? (
              <div className="profile-preview" role="status"><BadgeCheck className="size-5 shrink-0 text-primary" /><span><strong>Verified · {settings.data?.companyName ?? domain}</strong><small>Work email confirmed for {domain}</small></span></div>
            ) : (
              <Button asChild variant="outline"><Link href="/verify">Verify with a one-time code <ArrowRight /></Link></Button>
            )}
          </div>
        ) : null}
        {step === 2 ? (
          <div className="setup-step">
            <BriefcaseBusiness />
            <h2 id="setup-title">Choose your lane.</h2>
            <p>Pick the kinds of roles you can assess and how many asks you want to receive.</p>
            <label>Function<select className="appearance-none" value={area} onChange={event => { setPicked(event.target.value); if (save.isError) save.reset(); }}>{WORK_FUNCTIONS.map(item => <option key={item} value={item}>{item}</option>)}</select><ChevronDown /></label>
            {settings.isError ? <p role="alert" className="!m-0">{settings.error.message || "We could not load your referrer settings."} Finish tries again.</p> : null}
            {save.isError ? <p role="alert" className="!m-0">{save.error.message || "We could not save your referrer settings."}</p> : null}
          </div>
        ) : null}
        <footer>
          {step > 0 ? <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : null}
          {step < LAST_STEP
            ? <Button type="button" onClick={() => setStep(step + 1)}>Continue <ArrowRight /></Button>
            : <Button type="button" onClick={finish} aria-busy={save.isPending || settings.isFetching || undefined}>{save.isPending ? "Saving…" : <>Finish <Check /></>}</Button>}
        </footer>
      </section>
    </div>
  );
}
