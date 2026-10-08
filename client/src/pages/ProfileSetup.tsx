import { ArrowLeft, ArrowRight, Check, FileText, Globe, Linkedin, MapPin, Target, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { uploadResume, validateResumeFile, type ResumeDoc } from "@/lib/resumeUpload";

const STORAGE_KEY = "skipwait-onboarding-v1";
const ROLES = ["Software Engineer", "Product Manager", "Product Designer", "Data Analyst", "Data Scientist", "Marketing", "Operations", "Sales", "Customer Success", "Consulting"];
const LEVELS = ["Student / intern", "Early career", "Mid-level", "Senior", "Lead / manager", "Director+"];
const GOALS = [
  ["Actively looking", "Interviewing or applying this month"],
  ["Open to the right role", "Happy where I am, curious"],
  ["Changing careers", "Moving into a new function"],
  ["Just graduated", "Looking for a first role"],
] as const;
const LINK_KINDS = ["LinkedIn", "GitHub", "Portfolio site", "Behance / Dribbble"] as const;
const STEPS = ["Goal", "Roles", "Resume", "Work", "Location", "Ready"] as const;

type OnboardingState = {
  goal: string;
  roles: string[];
  level: string;
  links: string[];
  city: string;
  countries: string;
  remote: boolean;
  visa: string;
  resume: ResumeDoc | null;
};

const DEFAULTS: OnboardingState = {
  goal: "Actively looking",
  roles: [],
  level: "",
  links: [],
  city: "",
  countries: "",
  remote: true,
  visa: "Need sponsorship for some countries",
  resume: null,
};

function loadStored(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return { ...DEFAULTS, ...parsed, roles: Array.isArray(parsed.roles) ? parsed.roles.slice(0, 3) : [], links: Array.isArray(parsed.links) ? parsed.links : [] };
  } catch { return DEFAULTS; }
}

export default function Onboarding() {
  const { isSignedIn, getToken } = useAuth();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>(DEFAULTS);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => { setState(loadStored()); }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
  }, [state]);

  const patch = (update: Partial<OnboardingState>) => setState(current => ({ ...current, ...update }));
  const toggleRole = (role: string) => setState(current => ({
    ...current,
    roles: current.roles.includes(role) ? current.roles.filter(item => item !== role) : current.roles.length >= 3 ? current.roles : [...current.roles, role],
  }));
  const toggleLink = (link: string) => setState(current => ({
    ...current,
    links: current.links.includes(link) ? current.links.filter(item => item !== link) : [...current.links, link],
  }));

  const uploadPicked = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const invalid = validateResumeFile(file);
    if (invalid) { setUploadError(invalid); return; }
    setUploadError(""); setUploading(true);
    try {
      const uploaded = await uploadResume(file, getToken);
      patch({ resume: uploaded });
    } catch (reason) { setUploadError(reason instanceof Error ? reason.message : "We could not upload your resume"); }
    finally { setUploading(false); }
  };

  const doneCount = [state.goal !== "", state.roles.length > 0, state.resume !== null, state.links.length > 0, true].filter(Boolean).length;

  return (
    <main data-skipwait-screen="onboarding" className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <span className="eyebrow">Step {Math.min(step + 1, STEPS.length)} of {STEPS.length} · About 2 minutes</span>
        {step < 5 ? <button type="button" className="text-link text-sm" onClick={() => setStep(5)}>Skip for now</button> : null}
      </div>
      <ol className="mb-8 grid grid-cols-6 gap-1.5" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li key={label}><span className={`block h-1.5 rounded-full ${i <= step ? "bg-[var(--primary)]" : "bg-[var(--muted)]"}`} /><span className="mt-1.5 hidden text-xs text-[var(--muted-foreground)] sm:block">{label}</span></li>
        ))}
      </ol>

      {step === 0 ? (
        <section>
          <Target className="mb-3 text-[var(--primary)]" /><h1 className="text-3xl font-semibold">Where are you in your search?</h1><p className="mt-2 text-[var(--muted-foreground)]">This only tunes what we show you. Nobody else sees it.</p>
          <div className="mt-6 grid gap-3" role="radiogroup" aria-label="Search goal">
            {GOALS.map(([goal, hint]) => (
              <button key={goal} type="button" role="radio" aria-checked={state.goal === goal} onClick={() => patch({ goal })} className={`flex min-h-20 items-center justify-between rounded-[28px] border p-5 text-left ${state.goal === goal ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
                <span><strong className="block text-[17px]">{goal}</strong><small className="text-sm text-[var(--muted-foreground)]">{hint}</small></span>
                {state.goal === goal ? <Check className="text-[var(--primary)]" /> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section>
          <h1 className="text-3xl font-semibold">Which roles are you targeting?</h1><p className="mt-2 text-[var(--muted-foreground)]">Pick up to 3. Referrers see these when you ask.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {ROLES.map(role => {
              const on = state.roles.includes(role);
              return <button key={role} type="button" aria-pressed={on} disabled={!on && state.roles.length >= 3} onClick={() => toggleRole(role)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm ${on ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)]"}`}>{on ? <Check className="size-4" aria-hidden="true" /> : null}{role}</button>;
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">{state.roles.length}/3 selected</p>
          <h2 className="mt-8 font-semibold">Experience level</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Experience level">
            {LEVELS.map(level => (
              <button key={level} type="button" role="radio" aria-checked={state.level === level} onClick={() => patch({ level })} className={`min-h-11 rounded-xl border px-3 text-sm ${state.level === level ? "border-[var(--primary)] bg-[var(--primary)]/5 font-semibold" : "border-[var(--border)]"}`}>{level}</button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <FileText className="mb-3 text-[var(--primary)]" /><h1 className="text-3xl font-semibold">Add your resume</h1><p className="mt-2 text-[var(--muted-foreground)]">Private. Shared only with a referrer after they accept your ask.</p>
          {state.resume ? (
            <div className="mt-6 flex w-full items-center gap-3 rounded-3xl border-2 border-[var(--border)] p-6">
              <Check className="size-8 shrink-0 text-[var(--primary)]" />
              <div className="min-w-0 flex-1"><strong className="block truncate">{state.resume.fileName}</strong><small className="text-[var(--muted-foreground)]">Uploaded · tap below to replace</small></div>
              <button type="button" aria-label={`Remove ${state.resume.fileName}`} onClick={() => patch({ resume: null })} className="grid min-h-11 min-w-11 place-items-center"><X className="size-4" /></button>
            </div>
          ) : (
            <label className="mt-6 flex w-full cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-[var(--border)] p-10 text-center">
              <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="sr-only" disabled={uploading || !isSignedIn} onChange={event => { void uploadPicked(event.target.files); event.currentTarget.value = ""; }} />
              {uploading ? <><strong>Uploading…</strong><small className="text-[var(--muted-foreground)]">Securing your resume.</small></> : <><Upload className="size-8" /><strong>Drop PDF or tap to choose</strong><small className="text-[var(--muted-foreground)]">{isSignedIn ? "PDF, Word, PNG, JPEG · up to 10 MB" : "Sign in to upload"}</small></>}
            </label>
          )}
          {uploadError ? <p role="alert" className="mt-3 text-sm font-semibold text-[var(--destructive)]">{uploadError}</p> : null}
          {!isSignedIn ? <div className="mt-4"><SignInButton><button type="button" className="brand-button w-full">Sign in to upload</button></SignInButton></div> : null}
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">No resume yet? Continue — you can add it before your first ask.</p>
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <h1 className="text-3xl font-semibold">Show your work</h1><p className="mt-2 text-[var(--muted-foreground)]">Optional, but asks with a work link stand out. URLs can be added once work profiles ship.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {LINK_KINDS.map(kind => {
              const on = state.links.includes(kind);
              const Icon = kind === "LinkedIn" ? Linkedin : kind === "GitHub" ? Globe : Globe;
              return (
                <button key={kind} type="button" aria-pressed={on} onClick={() => toggleLink(kind)} className={`flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-left ${on ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
                  <Icon className="size-5" /><span className="flex-1 font-medium">{kind}</span>{on ? <Check className="text-[var(--primary)]" /> : <span className="text-sm text-[var(--muted-foreground)]">Want</span>}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section>
          <MapPin className="mb-3 text-[var(--primary)]" /><h1 className="text-3xl font-semibold">Where can you work?</h1><p className="mt-2 text-[var(--muted-foreground)]">We&apos;ll warn you before asking for roles that can&apos;t work for you.</p>
          <label className="mt-6 block text-sm font-medium">Current city
            <input value={state.city} onChange={event => patch({ city: event.target.value })} placeholder="Bengaluru, India" className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
          </label>
          <label className="mt-4 block text-sm font-medium">Countries you can work in
            <input value={state.countries} onChange={event => patch({ countries: event.target.value })} placeholder="India, United Arab Emirates" className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
          </label>
          <button type="button" aria-pressed={state.remote} onClick={() => patch({ remote: !state.remote })} className={`mt-4 flex min-h-12 w-full items-center justify-between rounded-xl border px-4 ${state.remote ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>Open to remote roles {state.remote ? <Check className="text-[var(--primary)]" /> : null}</button>
          <label className="mt-4 block text-sm font-medium">Work authorization
            <select value={state.visa} onChange={event => patch({ visa: event.target.value })} className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base">
              <option>No sponsorship needed</option>
              <option>Need sponsorship for some countries</option>
              <option>Open to relocation with sponsorship</option>
            </select>
          </label>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-[var(--accent)]"><Check className="size-10 text-[var(--primary)]" /></span>
          <h1 className="mt-4 text-3xl font-semibold">You&apos;re ready to ask.</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">Setup {Math.round((doneCount / 5) * 100)}% complete. Saved on this device until profiles sync to your account.</p>
          <div className="mx-auto mt-6 max-w-md rounded-2xl border border-[var(--border)] p-5 text-left">
            <ul className="space-y-3 text-sm">
              {([["Search goal", state.goal !== ""], ["Target roles", state.roles.length > 0], ["Resume", state.resume !== null], ["Work links", state.links.length > 0], ["Location & authorization", state.city !== "" || state.countries !== ""]] as const).map(([label, ok]) => (
                <li key={label} className="flex items-center justify-between"><span>{label}</span>{ok ? <Check className="size-4 text-[var(--primary)]" /> : <span className="text-xs text-[var(--muted-foreground)]">Skipped</span>}</li>
              ))}
            </ul>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/alerts" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Set alerts</Link>
            <Link href="/explore" className="brand-button">Find a referrer <ArrowRight /></Link>
          </div>
        </section>
      ) : null}

      {step < 5 ? (
        <footer className="mt-10 flex justify-between gap-3">
          {step > 0 ? <button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={() => setStep(step - 1)}><ArrowLeft />Back</button> : <span />}
          <button type="button" disabled={step === 1 && state.roles.length === 0} onClick={() => setStep(step + 1)} className="brand-button">{step === 4 ? "Finish" : "Continue"} <ArrowRight /></button>
        </footer>
      ) : null}
    </main>
  );
}
