import { AlertTriangle, ArrowRight, FileText, Lightbulb, LoaderCircle, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { isValidTargetRoleUrl } from "@shared/referralUrl";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
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
      const targetRoleUrl = url.trim();
      const body: Record<string, string | number[]> = { targetRoleUrl, attachmentIds: [doc.id], candidateMessage: note.trim() };
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
    return <AskSent sent={sent} openAsks={openAsks} onWriteAnother={() => { setSent(null); setOpenAsks(null); setUrl(""); setNote(""); setCompensation(""); removeResume(); setComposeError(""); setSendError(""); }} />;
  }

  const busy = drafting || uploading;
  return (
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
          {composeError ? <p role="alert" className="mt-4 flex gap-2 text-sm text-destructive"><AlertTriangle className="size-4 shrink-0" />{composeError}</p> : null}
        </Panel>
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
