import { ArrowLeft, ArrowRight, Check, FileText, Github, Globe, Globe2, Linkedin, MapPin, Target, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { Button } from "@/components/kit/button";
import { Panel, field } from "@/components/kit/preview-kit";
import {
  CITY_MAX, COUNTRIES_MAX, GOAL_HINTS, GOAL_NAMES, LEVELS, LINK_KINDS, MAX_ROLES, READY_STEP, ROLES, STEPS, VISA_OPTIONS,
  completionPercent, loadOnboarding, readiness, saveOnboarding, type LinkKind, type OnboardingState,
} from "@/components/onboarding/onboardingState";
import { uploadResume, validateResumeFile } from "@/lib/resumeUpload";

const LINK_ICONS: Readonly<Record<LinkKind, typeof Globe>> = { LinkedIn: Linkedin, GitHub: Github, "Portfolio site": Globe, "Behance / Dribbble": Globe2 };
const RESUME_HINT = "PDF, Word, PNG, JPEG · up to 10 MB";

export default function Onboarding() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const [s, setS] = useState(0);
  const [state, setState] = useState<OnboardingState>(loadOnboarding);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => { saveOnboarding(state); }, [state]);

  const patch = (update: Partial<OnboardingState>) => setState(current => ({ ...current, ...update }));
  const toggleRole = (role: OnboardingState["roles"][number]) => setState(current => ({
    ...current,
    roles: current.roles.includes(role) ? current.roles.filter(item => item !== role) : current.roles.length >= MAX_ROLES ? current.roles : [...current.roles, role],
  }));
  const toggleLink = (link: LinkKind) => setState(current => ({
    ...current,
    links: current.links.includes(link) ? current.links.filter(item => item !== link) : [...current.links, link],
  }));

  const uploadPicked = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || uploading || !isSignedIn) return;
    const invalid = validateResumeFile(file);
    if (invalid) { setUploadError(invalid); return; }
    setUploadError(""); setUploading(true);
    try {
      const uploaded = await uploadResume(file, getToken);
      patch({ resume: uploaded });
    } catch (reason) { setUploadError(reason instanceof Error ? reason.message : "We could not upload your resume"); }
    finally { setUploading(false); }
  };

  const items = readiness(state);

  return <main data-skipwait-screen="onboarding" className="page-content mx-auto max-w-3xl">
    <div className="mb-6 flex items-center justify-between gap-3"><span className="eyebrow">STEP {s + 1} OF {STEPS.length} · ABOUT 2 MINUTES</span>{s < READY_STEP && <button type="button" className="text-link text-sm" onClick={() => setS(READY_STEP)}>Skip for now</button>}</div>
    <ol className="mb-8 grid grid-cols-6 gap-1.5" aria-label="Setup progress">{STEPS.map((l, i) => <li key={l} aria-current={i === s ? "step" : undefined}><span className={`block h-1.5 rounded-full ${i <= s ? "bg-primary" : "bg-muted"}`} /><span className="mt-1.5 hidden text-xs text-muted-foreground sm:block">{l}</span></li>)}</ol>

    {s === 0 && <section><Target className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">Where are you in your search?</h1><p className="mt-2 text-muted-foreground">This only tunes what we show you. Nobody else sees it.</p><div className="mt-6 grid gap-3" role="radiogroup" aria-label="Search goal">{GOAL_NAMES.map(g => <button key={g} type="button" role="radio" aria-checked={state.goal === g} onClick={() => patch({ goal: g })} className={`flex min-h-16 items-center justify-between rounded-2xl border p-4 text-left ${state.goal === g ? "border-primary bg-primary/5" : "border-border"}`}><span><strong className="block">{g}</strong><small className="text-muted-foreground">{GOAL_HINTS[g]}</small></span>{state.goal === g && <Check className="text-primary" />}</button>)}</div></section>}

    {s === 1 && <section><h1 className="text-3xl font-semibold">Which roles are you targeting?</h1><p className="mt-2 text-muted-foreground">Pick up to 3.</p><div className="mt-6 flex flex-wrap gap-2">{ROLES.map(r => { const on = state.roles.includes(r); return <button key={r} type="button" aria-pressed={on} disabled={!on && state.roles.length >= MAX_ROLES} onClick={() => toggleRole(r)} className={`min-h-11 rounded-full border px-4 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{on && <Check className="mr-1 inline size-4" />}{r}</button>; })}</div><p className="mt-2 text-xs text-muted-foreground">{state.roles.length}/{MAX_ROLES} selected</p><h2 className="mt-8 font-semibold">Experience level</h2><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Experience level">{LEVELS.map(l => <button key={l} type="button" role="radio" aria-checked={state.level === l} onClick={() => patch({ level: l })} className={`min-h-11 rounded-xl border px-3 text-sm ${state.level === l ? "border-primary bg-primary/5 font-semibold" : "border-border"}`}>{l}</button>)}</div></section>}

    {s === 2 && <section><FileText className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">Add your resume</h1><p className="mt-2 text-muted-foreground">Private. Shared only with a referrer after they accept your ask.</p>
      {isSignedIn ? <label onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void uploadPicked(event.dataTransfer.files); }} className={`mt-6 flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed p-10 text-center ${uploading ? "cursor-progress" : "cursor-pointer"} ${uploadError ? "border-destructive" : "border-border hover:border-primary focus-within:border-primary"}`}>
        <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="sr-only" disabled={uploading} aria-label={state.resume ? "Replace resume" : "Choose resume"} onChange={event => { void uploadPicked(event.target.files); event.currentTarget.value = ""; }} />
        {uploading ? <><span role="progressbar" aria-label="Uploading resume" className="h-2 w-40 overflow-hidden rounded-full bg-muted"><span className="block h-full w-2/3 animate-pulse bg-primary" /></span><strong>Uploading…</strong></>
          : uploadError ? <><strong role="alert" className="text-destructive">{uploadError}</strong><small className="text-muted-foreground">{RESUME_HINT}</small></>
          : state.resume ? <><Check className="size-8 text-primary" /><strong className="max-w-full truncate">{state.resume.fileName}</strong><small className="text-muted-foreground">Uploaded · tap to replace</small></>
          : <><Upload className="size-8" /><strong>Drop PDF or tap to choose</strong><small className="text-muted-foreground">{RESUME_HINT}</small></>}
      </label>
        : <button type="button" onClick={() => openSignIn()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); openSignIn(); }} className="mt-6 flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-border p-10 hover:border-primary"><Upload className="size-8" /><strong>Drop PDF or tap to choose</strong><small className="text-muted-foreground">Sign in to upload</small></button>}
      {state.resume && !uploading ? <button type="button" className="text-link mt-3" aria-label={`Remove ${state.resume.fileName}`} onClick={() => { patch({ resume: null }); setUploadError(""); }}>Remove</button> : null}
      <p className="mt-4 text-sm text-muted-foreground">No resume yet? Continue — you can add it before your first ask.</p></section>}

    {s === 3 && <section><h1 className="text-3xl font-semibold">Show your work</h1><p className="mt-2 text-muted-foreground">Optional, but asks with a work link stand out. Add the URLs in <Link href="/work" className="text-link">My work</Link>.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{LINK_KINDS.map(l => { const Icon = LINK_ICONS[l]; const on = state.links.includes(l); return <button key={l} type="button" aria-pressed={on} onClick={() => toggleLink(l)} className={`flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-left ${on ? "border-primary bg-primary/5" : "border-border"}`}><Icon className="size-5" /><span className="flex-1 font-medium">{l}</span>{on ? <Check className="text-primary" /> : <span className="text-sm text-muted-foreground">Add</span>}</button>; })}</div></section>}

    {s === 4 && <section><MapPin className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">Where can you work?</h1><p className="mt-2 text-muted-foreground">Saved on this device. Nobody else sees it.</p><label className="mt-6 block text-sm font-medium">Current city<input className={field} value={state.city} maxLength={CITY_MAX} onChange={event => patch({ city: event.target.value })} placeholder="Bengaluru, India" /></label><label className="mt-4 block text-sm font-medium">Countries you can work in<input className={field} value={state.countries} maxLength={COUNTRIES_MAX} onChange={event => patch({ countries: event.target.value })} placeholder="India, United Arab Emirates" /></label><button type="button" aria-pressed={state.remote} onClick={() => patch({ remote: !state.remote })} className={`mt-4 flex min-h-12 w-full items-center justify-between rounded-xl border px-4 ${state.remote ? "border-primary bg-primary/5" : "border-border"}`}>Open to remote roles {state.remote && <Check className="text-primary" />}</button><label className="mt-4 block text-sm font-medium">Work authorization<select className={field} value={state.visa} onChange={event => { const visa = VISA_OPTIONS.find(option => option === event.target.value); if (visa) patch({ visa }); }}>{VISA_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></label></section>}

    {s === READY_STEP && <section className="text-center"><span className="mx-auto grid size-20 place-items-center rounded-full bg-accent"><Check className="size-10 text-primary" /></span><h1 className="mt-4 text-3xl font-semibold">You're ready to ask.</h1><p className="mt-2 text-muted-foreground">Setup {completionPercent(items)}% complete. Saved on this device; finish anything you skipped from Profile.</p>
      <Panel className="mx-auto mt-6 max-w-md text-left"><ul className="space-y-3 text-sm">{items.map(item => <li key={item.label} className="flex items-center justify-between"><span>{item.label}</span>{item.done ? <><Check className="size-4 text-primary" /><span className="sr-only">Done</span></> : <button type="button" className="text-link" aria-label={`Add ${item.label}`} onClick={() => setS(item.step)}>Add</button>}</li>)}</ul></Panel>
      <div className="mt-8 flex flex-wrap justify-center gap-3"><Button variant="outline" asChild><Link href="/alerts">Set alerts</Link></Button><Button asChild><Link href="/explore">Find a referrer <ArrowRight /></Link></Button></div></section>}

    {s < READY_STEP && <footer className="mt-10 flex justify-between gap-3">{s > 0 ? <Button type="button" variant="ghost" onClick={() => setS(s - 1)}><ArrowLeft />Back</Button> : <span />}<Button type="button" disabled={s === 1 && state.roles.length === 0} onClick={() => setS(s + 1)}>{s === 4 ? "Finish" : "Continue"} <ArrowRight /></Button></footer>}
  </main>;
}
