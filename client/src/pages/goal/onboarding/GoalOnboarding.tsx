import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalField, GoalFilterChip, GoalNum, GoalTextInput } from "@/components/goal";
import {
  CITY_MAX, COUNTRIES_MAX, GOAL_HINTS, GOAL_NAMES, LEVELS, LINK_KINDS, MAX_ROLES, ROLES, VISA_OPTIONS,
  completionPercent, emptyOnboarding, readiness, toSetupPatch, type LinkKind, type OnboardingState,
} from "@/components/onboarding/onboardingState";
import { uploadResume, validateResumeFile } from "@/lib/resumeUpload";

const RESUME_HINT = "PDF, Word, PNG, JPEG, up to 10 MB";

type Sync = "idle" | "loading" | "saving" | "saved" | "failed";

export default function GoalOnboarding() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const [state, setState] = useState<OnboardingState>(emptyOnboarding);
  const [sync, setSync] = useState<Sync>(isSignedIn ? "loading" : "idle");
  const [saveNonce, setSaveNonce] = useState(0);
  const loadedRef = useRef(false);
  const dirtyRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [focus, setFocus] = useState<number | null>(null);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const authHeaders = useCallback(async () => {
    const token = await getTokenRef.current();
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }, []);

  useEffect(() => {
    if (!isSignedIn) { loadedRef.current = false; setSync("idle"); return; }
    let cancelled = false;
    setSync("loading");
    (async () => {
      try {
        const response = await fetch("/api/profile/setup", { headers: await authHeaders(), credentials: "include" });
        if (!response.ok) throw new Error("load failed");
        const saved = (await response.json()) as OnboardingState;
        if (cancelled) return;
        if (!dirtyRef.current) setState(saved);
        loadedRef.current = true;
        if (dirtyRef.current) setSaveNonce(n => n + 1); else setSync("saved");
      } catch { if (!cancelled) setSync("failed"); }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, authHeaders]);

  useEffect(() => {
    if (!isSignedIn || !loadedRef.current || !dirtyRef.current) return;
    let cancelled = false;
    setSync("saving");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/profile/setup", { method: "PATCH", headers: await authHeaders(), credentials: "include", body: JSON.stringify(toSetupPatch(state)) });
        if (!response.ok) throw new Error("save failed");
        if (!cancelled) { dirtyRef.current = false; setSync("saved"); }
      } catch { if (!cancelled) setSync("failed"); }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [state, isSignedIn, authHeaders, saveNonce]);

  const patch = (update: Partial<OnboardingState>) => { dirtyRef.current = true; setState(current => ({ ...current, ...update })); };
  const toggleRole = (role: OnboardingState["roles"][number]) => { dirtyRef.current = true; setState(current => ({
    ...current,
    roles: current.roles.includes(role) ? current.roles.filter(item => item !== role) : current.roles.length >= MAX_ROLES ? current.roles : [...current.roles, role],
  })); };
  const toggleLink = (link: LinkKind) => { dirtyRef.current = true; setState(current => ({
    ...current,
    links: current.links.includes(link) ? current.links.filter(item => item !== link) : [...current.links, link],
  })); };
  const uploadPicked = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || uploading || !isSignedIn) return;
    const invalid = validateResumeFile(file);
    if (invalid) { setUploadError(invalid); return; }
    setUploadError(""); setUploading(true);
    try { patch({ resume: await uploadResume(file, getToken) }); }
    catch (reason) { setUploadError(reason instanceof Error ? reason.message : "We could not upload your resume"); }
    finally { setUploading(false); }
  };

  const items = readiness(state);
  const percent = completionPercent(items);
  const firstOpen = items.findIndex(item => !item.done);
  const active = focus ?? firstOpen;
  const ready = firstOpen === -1 && focus === null;

  const status = !isSignedIn
    ? <>Not saved yet. Sign in to keep these answers.</>
    : sync === "failed"
      ? <>We could not save your answers. <button type="button" className="g-linklike" onClick={() => { dirtyRef.current = true; setSaveNonce(n => n + 1); }}>Try again</button>.</>
      : sync === "saving" || sync === "loading"
        ? <>Saving to your account.</>
        : <>Saved to your account.</>;

  const editors: Record<number, React.ReactNode> = {
    1: <section>
      <h2 className="text-g-heading text-g-ink">Which roles are you targeting?</h2>
      <p className="mt-1 text-g-meta text-g-ink-2">Pick up to 3. This tunes who we surface.</p>
      <div className="mt-4 flex flex-wrap gap-2">{ROLES.map(r => { const on = state.roles.includes(r); return (
        <GoalFilterChip key={r} label={r} pressed={on} onPressedChange={() => { if (on || state.roles.length < MAX_ROLES) toggleRole(r); }} />); })}</div>
      <p className="mt-2 text-g-meta text-g-ink-3"><GoalNum>{state.roles.length}</GoalNum>/<GoalNum>{MAX_ROLES}</GoalNum> selected</p>
      <div className="mt-6"><GoalField label="Experience level">
        <div className="flex flex-wrap gap-2">{LEVELS.map(l => (
          <GoalFilterChip key={l} label={l} pressed={state.level === l} onPressedChange={() => patch({ level: l })} />))}</div>
      </GoalField></div>
    </section>,
    2: <section>
      <h2 className="text-g-heading text-g-ink">Add your resume</h2>
      <p className="mt-1 text-g-meta text-g-ink-2">Private. Shared only with a referrer after they accept your ask.</p>
      {isSignedIn ? <>
        <label className="mt-4 flex w-full flex-col items-start gap-1 rounded-g-tile border border-g-hairline p-4 hover:bg-g-surface-hover" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void uploadPicked(event.dataTransfer.files); }}>
          <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="sr-only" disabled={uploading} aria-label={state.resume ? "Replace resume" : "Choose resume"} onChange={event => { void uploadPicked(event.target.files); event.currentTarget.value = ""; }} />
          <span className="text-g-label text-g-ink">{uploading ? "Uploading…" : state.resume ? state.resume.fileName : "Drop PDF or tap to choose"}</span>
          <span className="text-g-meta text-g-ink-3">{state.resume && !uploading ? "Uploaded. Tap to replace." : RESUME_HINT}</span>
        </label>
        {uploadError ? <p className="mt-2 text-g-meta text-g-crimson">{uploadError}</p> : null}
        {state.resume && !uploading ? <button type="button" className="mt-2 text-g-meta text-g-ink underline underline-offset-[3px]" aria-label={`Remove ${state.resume.fileName}`} onClick={() => { patch({ resume: null }); setUploadError(""); }}>Remove</button> : null}
      </> : <div className="mt-4"><GoalButton variant="outline" onClick={() => openSignIn()}>Sign in to upload</GoalButton></div>}
      <p className="mt-3 text-g-meta text-g-ink-3">No resume yet? Done skips it. You can add it before your first ask.</p>
    </section>,
    3: <section>
      <h2 className="text-g-heading text-g-ink">Show your work</h2>
      <p className="mt-1 text-g-meta text-g-ink-2">Optional, but asks with a work link stand out. Add the URLs in <Link href="/work" className="text-g-ink underline underline-offset-[3px]">My work</Link>.</p>
      <div className="mt-4 flex flex-wrap gap-2">{LINK_KINDS.map(l => { const on = state.links.includes(l); return (
        <GoalFilterChip key={l} label={l} pressed={on} onPressedChange={() => toggleLink(l)} />); })}</div>
    </section>,
    4: <section>
      <h2 className="text-g-heading text-g-ink">Where can you work?</h2>
      <p className="mt-1 text-g-meta text-g-ink-2">{isSignedIn ? "Saved to your account. Nobody else sees it." : "Sign in to save these answers to your account."}</p>
      <div className="mt-4 grid gap-4">
      <GoalField label="Current city"><GoalTextInput value={state.city} maxLength={CITY_MAX} onChange={event => patch({ city: event.target.value })} placeholder="Bengaluru, India" /></GoalField>
      <GoalField label="Countries you can work in"><GoalTextInput value={state.countries} maxLength={COUNTRIES_MAX} onChange={event => patch({ countries: event.target.value })} placeholder="India, United Arab Emirates" /></GoalField>
      <div className="flex flex-wrap gap-2"><GoalFilterChip label="Open to remote roles" pressed={state.remote} onPressedChange={() => patch({ remote: !state.remote })} /></div>
      <GoalField label="Work authorization">
        <select className="rounded-g-control border border-g-hairline bg-transparent px-3 py-2 text-g-label text-g-ink" value={state.visa} onChange={event => { const visa = VISA_OPTIONS.find(option => option === event.target.value); if (visa) patch({ visa }); }}>{VISA_OPTIONS.map(option => <option key={option}>{option}</option>)}</select>
      </GoalField>
      </div>
    </section>,
    0: <section>
      <h2 className="text-g-heading text-g-ink">Where are you in your search?</h2>
      <p className="mt-1 text-g-meta text-g-ink-2">This only tunes what we show you. Nobody else sees it.</p>
      <div className="mt-4 flex flex-wrap gap-2">{GOAL_NAMES.map(g => (
        <GoalFilterChip key={g} label={g} pressed={state.goal === g} onPressedChange={() => patch({ goal: g })} />))}</div>
      <p className="mt-2 text-g-meta text-g-ink-3">{GOAL_HINTS[state.goal]}</p>
    </section>,
  };

  return <main data-skipwait-screen="onboarding" data-testid="goal-onboarding" className="g-scope page-content mx-auto w-full max-w-2xl pb-10">
    <header className="px-4 pt-6 gdesk:px-5 gdesk:pt-7">
      <h1 className="text-g-display text-g-ink">Get ready to ask for a referral.</h1>
      <p className="mt-2 flex items-center gap-2 text-g-meta text-g-ink-2">
        <span aria-hidden="true" className={`size-(--g-dot) shrink-0 rounded-full ${sync === "failed" ? "bg-g-crimson" : "bg-g-ink"}`} />
        <span>Setup <GoalNum>{percent}</GoalNum>% complete. {status}</span></p>
    </header>

    {ready ? <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
      <h2 className="text-g-heading text-g-ink">Your next step</h2>
      <p className="mt-2 text-g-label text-g-ink">You are ready to ask.</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <GoalButton variant="primary" asChild><Link href="/explore">Find a referrer</Link></GoalButton>
        <GoalButton variant="ghost" asChild><Link href="/alerts">Set alerts</Link></GoalButton>
      </div>
    </section> : active >= 0 ? <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
      <h2 className="text-g-heading text-g-ink">Your next step</h2>
      <div className="mt-4">{editors[active] ?? null}</div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <GoalButton variant="primary" onClick={() => setFocus(null)}>Done</GoalButton>
        <button type="button" className="text-g-meta text-g-ink-2 underline underline-offset-[3px] hover:text-g-ink" onClick={() => setFocus(READY_CHECKLIST_SKIP)}>Skip for now</button>
      </div>
    </section> : null}

    <section aria-label="Setup checklist" className="mt-6">
      <h2 className="px-4 text-g-label text-g-ink gdesk:px-5">The full checklist</h2>
      <ul className="mt-1">{items.map((item, i) => <li key={item.label}>
        <button type="button" onClick={() => setFocus(i)} aria-label={`${item.done ? "Edit" : "Add"} ${item.label}`}
          className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 text-left hover:bg-g-surface-hover gdesk:px-5">
          <span aria-hidden="true" className={`size-(--g-dot) rounded-full ${item.done ? "bg-g-ink" : "border-[1.5px] border-g-control-edge"}`} />
          <span className="min-w-0 truncate text-g-label text-g-ink">{item.label}</span>
          <span className="text-g-meta text-g-ink-3">{item.done ? "Done" : "Add"}</span>
        </button></li>)}</ul>
    </section>
  </main>;
}

const READY_CHECKLIST_SKIP = -2;
