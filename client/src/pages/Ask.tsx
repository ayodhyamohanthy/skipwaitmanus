<<<<<<< HEAD
import { AlertTriangle, ArrowRight, Check, Circle, FileText, Lightbulb, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
=======
import { AlertTriangle, ArrowRight, FileText, Lightbulb, LoaderCircle, Sparkles, X } from "lucide-react";
import { useState } from "react";
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81
import { SignInButton, useAuth } from "@/_core/auth";
import { isValidTargetRoleUrl } from "@shared/referralUrl";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { getLaunchCompany } from "@/lib/companies";
import { uploadResume, validateResumeFile, type ResumeDoc } from "@/lib/resumeUpload";
import { clearAskPrefill, readAskPrefill } from "@/lib/askPrefill";
import { Button, buttonVariants } from "@/components/kit/button";
import { Panel, field } from "@/components/kit/preview-kit";
import { AskStrength, askChecks, countWords } from "@/components/ask/AskStrength";
import { AskSent, type SentAsk } from "@/components/ask/AskSent";
import { askErrorMessage, confirmedDomainFor, countOpenAsks, parseSentAsk } from "@/components/ask/askApi";

const NOTE_LIMIT = 600;
const IDEMPOTENCY_KEY = "skipwait-ask-idempotency-key";

function askIdempotencyKey() {
  const existing = sessionStorage.getItem(IDEMPOTENCY_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(IDEMPOTENCY_KEY, created);
  return created;
}

function AskHeading({ text }: { text: string }) {
  return <div className="page-heading"><div><span className="eyebrow">NEW ASK</span><h1>Write a great ask<span className="brand-dot">.</span></h1><p>{text}</p></div></div>;
}

function confirmedCompanyDomain(targetRoleUrl: string): string | undefined {
  try { return confirmedDomainFor(targetRoleUrl, localStorage.getItem("bridge-company-confirmation")); }
  catch { return undefined; /* unconfirmed links resolve server-side */ }
}

export default function Ask() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  // A company door's request dialog (/explore/:slug) hands its job link and
  // fit note forward; nothing was sent there, so the seeker reviews it here.
  const [prefill] = useState(() => readAskPrefill());
  const [url, setUrl] = useState(prefill?.targetRoleUrl ?? "");
  const [note, setNote] = useState(prefill?.note.slice(0, NOTE_LIMIT) ?? "");
  const [compensation, setCompensation] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resume, setResume] = useState<ResumeDoc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState<SentAsk | null>(null);
  const [openAsks, setOpenAsks] = useState<number | null>(null);
  const [companyHint, setCompanyHint] = useState("");
  const [workItems, setWorkItems] = useState<Array<{ id: number; title: string; url: string | null }>>([]);
  const [selectedWorkIds, setSelectedWorkIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      const companyParam = new URLSearchParams(window.location.search).get("company")?.trim();
      if (!companyParam) return;
      if (/^https?:\/\//i.test(companyParam)) {
        setUrl(current => current ? current : companyParam);
        return;
      }
      const company = getLaunchCompany(companyParam.toLowerCase());
      if (company) setCompanyHint(`${company.name} · ${company.domain}`);
    } catch { /* company prefill is best-effort */ }
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const token = await fetchToken();
        const response = await fetch("/api/work-items", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ items?: Array<{ id?: unknown; title?: unknown; url?: unknown }> }>(response, "We could not load your work");
        if (!response.ok || !active || !Array.isArray(payload.items)) return;
        const loaded: Array<{ id: number; title: string; url: string | null }> = [];
        for (const item of payload.items) {
          if (typeof item.id === "number" && typeof item.title === "string" && item.title.trim()) {
            loaded.push({ id: item.id, title: item.title.trim(), url: typeof item.url === "string" && item.url ? item.url : null });
          }
        }
        setWorkItems(loaded);
      } catch { /* attach picker stays hidden when work cannot load */ }
    })();
    return () => { active = false; };
  }, [fetchToken, isSignedIn]);

  const words = countWords(note);
  const officialUrl = isValidTargetRoleUrl(url || undefined);
  const checks = askChecks({ officialUrl, note, hasResume: Boolean(resume || resumeFile) });
  const attachedName = resume?.fileName ?? resumeFile?.name ?? null;

  const authed = async (path: string, init?: RequestInit) => {
    const token = await fetchToken();
    const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const payload = await readApiJson<Record<string, unknown>>(response, "We could not complete this ask action");
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "We could not complete this ask action");
    return payload;
  };

  const toggleWork = (id: number) => {
    setSelectedWorkIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pickResume = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const invalid = validateResumeFile(file);
    if (invalid) { setComposeError(invalid); return; }
    setComposeError("");
    setResumeFile(file);
    setResume(null);
  };

  const removeResume = () => { setResume(null); setResumeFile(null); };

  const ensureResume = async (): Promise<ResumeDoc> => {
    if (resume) return resume;
    if (!resumeFile) throw new Error("Add your resume before sending this ask.");
    setUploading(true);
    try {
      const uploaded = await uploadResume(resumeFile, fetchToken);
      setResume(uploaded);
      setResumeFile(null);
      return uploaded;
    } finally { setUploading(false); }
  };

  const draftFromResume = async () => {
    setComposeError("");
    try {
      const doc = await ensureResume();
      if (!officialUrl) { setComposeError("Add a valid job link first so the draft matches the role."); return; }
      setDrafting(true);
      const payload = await authed("/api/smart-pitch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachmentId: doc.id, targetRoleUrl: url.trim() }) });
      if (typeof payload.draft === "string" && payload.draft.trim()) setNote(payload.draft.trim().slice(0, NOTE_LIMIT));
      else setComposeError("We could not create a starting draft");
    } catch (reason) { setComposeError(askErrorMessage(reason, "We could not create a starting draft")); }
    finally { setDrafting(false); }
  };

  const send = async () => {
    if (!officialUrl || words < 10 || sending) return;
    setSendError(""); setSending(true);
    try {
      const doc = await ensureResume();
      const params = new URLSearchParams(window.location.search);
<<<<<<< HEAD
      let candidateMessage = note.trim();
      const selectedWork = workItems.filter(item => selectedWorkIds.has(item.id));
      if (selectedWork.length > 0) {
        const lines = selectedWork.map(item => `- ${item.title}${item.url ? ` (${item.url})` : ""}`);
        candidateMessage = `${candidateMessage}\n\nAttached work:\n${lines.join("\n")}`.slice(0, 2000);
      }
      const body: Record<string, unknown> = { targetRoleUrl: url.trim(), attachmentIds: [doc.id], candidateMessage };
=======
      const targetRoleUrl = url.trim();
      const body: Record<string, string | number[]> = { targetRoleUrl, attachmentIds: [doc.id], candidateMessage: note.trim() };
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81
      if (compensation.trim()) body.compensation = compensation.trim().slice(0, 80);
      const fastTrackCode = params.get("fast")?.trim();
      if (fastTrackCode) body.fastTrackCode = fastTrackCode;
      const confirmedDomain = confirmedCompanyDomain(targetRoleUrl);
      if (confirmedDomain) body.confirmedCompanyDomain = confirmedDomain;
      const token = await fetchToken();
      const response = await fetch("/api/company-referrals", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "Idempotency-Key": askIdempotencyKey(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      const payload = await readApiJson<Record<string, unknown>>(response, "We could not send this ask");
      const created = response.ok ? parseSentAsk(payload) : null;
      if (!created) throw new Error(typeof payload.error === "string" ? payload.error : "We could not send this ask");
      sessionStorage.removeItem(IDEMPOTENCY_KEY);
      clearAskPrefill();
      let open: number | null = null;
      try { open = countOpenAsks(await authed("/api/company-referrals/mine")); } catch { /* open-ask count is informational */ }
      setOpenAsks(open);
      setSent(created);
    } catch (reason) { setSendError(askErrorMessage(reason, "We could not send this ask")); }
    finally { setSending(false); }
  };

  if (!isLoaded) {
    return (
      <main data-skipwait-screen="ask-loading" className="page-content mx-auto max-w-xl" aria-busy="true">
        <AskHeading text="Referrers decide in under a minute. Make that minute easy." />
        <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Checking your sign-in…</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="ask-sign-in" className="page-content mx-auto max-w-xl">
        <AskHeading text="Compose below after signing in — referrers decide in under a minute, so make that minute easy." />
        <div className="mt-6"><SignInButton><button type="button" className={buttonVariants({ className: "w-full" })}>Sign in to ask</button></SignInButton></div>
      </main>
    );
  }

  if (sent) {
<<<<<<< HEAD
    return (
      <main data-skipwait-screen="ask-sent" className="mx-auto max-w-xl px-5 py-10 text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-[var(--accent)]"><Check className="size-10 text-[var(--primary)]" /></span>
        <h1 className="mt-4 text-3xl font-semibold">Ask sent to {sent.companyDomain}.</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">{sent.waitingForCoverage ? "No verified referrers there yet — we'll route it privately the moment coverage opens." : "Verified referrers there will see it. Your slot frees when it's answered, passed, or withdrawn."}</p>
        {openAsks !== null ? <p className="mt-4 text-sm">Open asks: <strong>{openAsks}</strong></p> : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={() => { setSent(null); setUrl(""); setNote(""); setCompensation(""); setResume(null); setResumeFile(null); setSelectedWorkIds(new Set()); }}>Write another</button>
          <Link href={`/conversation/${sent.requestId}`} className="brand-button">Track this ask <ArrowRight /></Link>
        </div>
      </main>
    );
=======
    return <AskSent sent={sent} openAsks={openAsks} onWriteAnother={() => { setSent(null); setOpenAsks(null); setUrl(""); setNote(""); setCompensation(""); removeResume(); setComposeError(""); setSendError(""); }} />;
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81
  }

  const busy = drafting || uploading;
  return (
<<<<<<< HEAD
    <main data-skipwait-screen="ask" className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      <div className="mb-6"><span className="eyebrow">New ask</span><h1 className="mt-2 text-4xl font-semibold">Write a great ask<span className="brand-dot">.</span></h1><p className="mt-2 max-w-xl text-[var(--muted-foreground)]">Referrers decide in under a minute. Make that minute easy.</p></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-8">
          <label className="block text-sm font-medium">Official job link
            <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://careers.company.com/…" inputMode="url" className={`mt-2 h-12 w-full rounded-full border bg-[var(--background)] px-5 text-base ${url && !officialUrl ? "border-[var(--destructive)]" : "border-[var(--input)]"}`} />
          </label>
          {url && !officialUrl ? <p className="mt-2 flex gap-2 text-sm text-[var(--destructive)]"><AlertTriangle className="size-4 shrink-0" />That doesn&apos;t look like a job posting link.</p> : null}
          {companyHint ? <p className="mt-2 text-sm text-[var(--muted-foreground)]">Asking about {companyHint} — paste a role link from their careers site.</p> : null}
          <label className="mt-5 block text-sm font-medium">Compensation (optional)
            <input value={compensation} onChange={event => setCompensation(event.target.value)} placeholder="e.g. ₹18–22 LPA" maxLength={80} className="mt-2 h-12 w-full rounded-full border border-[var(--input)] bg-[var(--background)] px-5 text-base" />
          </label>
          <label className="mt-5 block text-sm font-medium">Your note
            <textarea value={note} maxLength={NOTE_LIMIT} onChange={event => setNote(event.target.value)} placeholder="Name the role, one result that proves fit, and what you'd like from the referrer." rows={7} className="mt-2 min-h-44 w-full rounded-[28px] border border-[var(--input)] bg-[var(--background)] p-5 text-base" />
          </label>
          <div className="mt-1 flex justify-between text-xs text-[var(--muted-foreground)]"><span>Tip: one specific result beats a list of skills.</span><span>{note.length}/{NOTE_LIMIT}</span></div>
          <button type="button" onClick={() => { void draftFromResume(); }} disabled={drafting || uploading} className="brand-button mt-3 border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">
            {drafting || uploading ? <LoaderCircle className="animate-spin" /> : null}Draft from my resume
          </button>
=======
    <main data-skipwait-screen="ask" className="page-content">
      <AskHeading text="Referrers decide in under a minute. Make that minute easy." />
      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <label className="block text-sm font-medium">Official job link<input className={field} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://careers.company.com/…" inputMode="url" aria-invalid={Boolean(url && !officialUrl)} /></label>
          {url && !officialUrl ? <p className="mt-2 flex gap-2 text-sm text-destructive"><AlertTriangle className="size-4 shrink-0" />That doesn&apos;t look like a job posting link.</p> : null}
          <label className="mt-5 block text-sm font-medium">Compensation (optional)<input className={field} value={compensation} onChange={event => setCompensation(event.target.value)} placeholder="e.g. ₹18–22 LPA" maxLength={80} /></label>
          <label className="mt-5 block text-sm font-medium">Your note<textarea value={note} maxLength={NOTE_LIMIT} onChange={event => setNote(event.target.value)} placeholder="Name the role, one result that proves fit, and what you'd like from the referrer." className="mt-2 min-h-44 w-full rounded-xl border border-input bg-background p-4 text-base" /></label>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Tip: one specific result beats a list of skills.</span><span>{note.length}/{NOTE_LIMIT}</span></div>
          <Button variant="outline" className="mt-3" disabled={busy} onClick={() => { void draftFromResume(); }}>{busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}Draft from my resume</Button>
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81
          <div className="mt-6">
            <span className="text-sm font-medium">Attached</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {attachedName ? (
                <span className="flex min-h-10 max-w-full items-center gap-2 rounded-full bg-muted pl-4 text-sm"><FileText className="size-4 shrink-0" /><span className="flex min-w-0 gap-1"><span className="truncate">{attachedName}</span><span className="shrink-0">(shared after accept)</span></span><button type="button" aria-label={`Remove ${attachedName}`} disabled={busy || sending} onClick={removeResume} className="grid size-10 shrink-0 place-items-center rounded-full"><X className="size-3.5" /></button></span>
              ) : (
                <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm focus-within:ring-2 focus-within:ring-ring">
                  <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="sr-only" onChange={event => { pickResume(event.target.files); event.currentTarget.value = ""; }} />
                  <FileText className="size-4 shrink-0" />Add resume (shared after accept)
                </label>
              )}
            </div>
          </div>
<<<<<<< HEAD
          {workItems.length > 0 ? (
            <div className="mt-6">
              <span className="text-sm font-medium">Attach work (optional)</span>
              <ul className="mt-2 space-y-2">
                {workItems.map(item => (
                  <li key={item.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-[var(--input)] px-4 py-2 text-sm">
                      <input type="checkbox" checked={selectedWorkIds.has(item.id)} onChange={() => toggleWork(item.id)} className="size-4 accent-[var(--primary)]" />
                      <span className="truncate">{item.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">Selected titles are added to your note.</p>
            </div>
          ) : null}
          {error ? <p role="alert" className="mt-4 text-sm font-semibold text-[var(--destructive)]">{error}</p> : null}
        </section>
=======
          {composeError ? <p role="alert" className="mt-4 flex gap-2 text-sm text-destructive"><AlertTriangle className="size-4 shrink-0" />{composeError}</p> : null}
        </Panel>
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <AskStrength checks={checks} />
          <Panel tone="muted"><Lightbulb className="mb-2 size-5" /><p className="text-sm">The referrer sees your role and note — not your name or resume — until they accept.</p></Panel>
          {sendError ? <p role="alert" className="flex gap-2 text-sm text-destructive"><AlertTriangle className="size-4 shrink-0" />{sendError}</p> : null}
          <Button className="w-full" disabled={!officialUrl || words < 10 || sending || uploading} onClick={() => { void send(); }}>{sending || uploading ? "Sending…" : <>Send ask <ArrowRight /></>}</Button>
          <p className="text-center text-xs text-muted-foreground">Uses 1 credit · referrals are always free</p>
        </aside>
      </div>
    </main>
  );
}
