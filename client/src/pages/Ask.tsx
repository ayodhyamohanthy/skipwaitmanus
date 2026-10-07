import { AlertTriangle, ArrowRight, Check, Circle, FileText, Lightbulb, LoaderCircle, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link, useLocation } from "wouter";
import { isValidTargetRoleUrl } from "@shared/referralUrl";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { uploadResume, validateResumeFile, type ResumeDoc } from "@/lib/resumeUpload";

const NOTE_LIMIT = 600;
const IDEMPOTENCY_KEY = "skipwait-ask-idempotency-key";

function askIdempotencyKey() {
  const existing = sessionStorage.getItem(IDEMPOTENCY_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(IDEMPOTENCY_KEY, created);
  return created;
}


export default function Ask() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [compensation, setCompensation] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resume, setResume] = useState<ResumeDoc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ requestId: number; companyDomain: string; waitingForCoverage: boolean } | null>(null);
  const [openAsks, setOpenAsks] = useState<number | null>(null);

  const words = note.trim() ? note.trim().split(/\s+/).length : 0;
  const officialUrl = isValidTargetRoleUrl(url || undefined);
  const generic = /\b(any role|any job|please refer|kindly refer|looking for job)\b/i.test(note);
  const specific = /\b(led|built|shipped|designed|grew|reduced|launched|\d+%|\d+ (years|users))\b/i.test(note);
  const checks = [
    { ok: officialUrl, label: "Official job link", hint: "Paste the posting from the company careers site." },
    { ok: words >= 30 && words <= 120, label: "30–120 words", hint: `${words} words so far.` },
    { ok: specific && !generic, label: "One specific proof of fit", hint: generic ? "Avoid “any role” or “please refer” — name the role and one result." : "Mention something you led, built or measured." },
    { ok: Boolean(resume), label: "Resume attached", hint: "Add your resume below — referrers see it after they accept." },
  ];
  const score = checks.filter(check => check.ok).length;
  const strength = score === 4 ? "Strong" : score >= 2 ? "Good start" : "Needs work";

  const authed = async (path: string, init?: RequestInit) => {
    const token = await fetchToken();
    const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const payload = await readApiJson<{ error?: string } & Record<string, unknown>>(response, "We could not complete this ask action");
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "We could not complete this ask action");
    return payload;
  };

  const pickResume = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const invalid = validateResumeFile(file);
    if (invalid) { setError(invalid); return; }
    setError("");
    setResumeFile(file);
    setResume(null);
  };

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
    setError("");
    try {
      const doc = await ensureResume();
      if (!officialUrl) { setError("Add a valid job link first so the draft matches the role."); return; }
      setDrafting(true);
      const payload = await authed("/api/smart-pitch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachmentId: doc.id, targetRoleUrl: url.trim() }) });
      if (typeof payload.draft === "string" && payload.draft.trim()) setNote(payload.draft.trim().slice(0, NOTE_LIMIT));
      else setError("We could not create a starting draft");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not create a starting draft"); }
    finally { setDrafting(false); }
  };

  const send = async () => {
    if (!officialUrl || words < 10 || sending) return;
    setError(""); setSending(true);
    try {
      const doc = await ensureResume();
      const params = new URLSearchParams(window.location.search);
      const body: Record<string, unknown> = { targetRoleUrl: url.trim(), attachmentIds: [doc.id], candidateMessage: note.trim() };
      if (compensation.trim()) body.compensation = compensation.trim().slice(0, 80);
      const fastTrackCode = params.get("fast")?.trim();
      if (fastTrackCode) body.fastTrackCode = fastTrackCode;
      try {
        const bound = JSON.parse(localStorage.getItem("bridge-company-confirmation") || "{}");
        if (bound.canonicalUrl === url.trim() && bound.confirmedDomain) body.confirmedCompanyDomain = bound.confirmedDomain;
      } catch { /* unconfirmed links resolve server-side */ }
      const token = await fetchToken();
      const response = await fetch("/api/company-referrals", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "Idempotency-Key": askIdempotencyKey(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      const payload = await readApiJson<{ requestId?: number; companyDomain?: string; coverageStatus?: string; error?: string }>(response, "We could not send this ask");
      if (!response.ok || !payload.requestId) throw new Error(payload.error || "We could not send this ask");
      sessionStorage.removeItem(IDEMPOTENCY_KEY);
      let open = 0;
      try {
        const mine = await authed("/api/company-referrals/mine");
        if (Array.isArray(mine.requests)) open = (mine.requests as Array<{ status?: string }>).filter(item => item.status === "pending").length;
      } catch { /* slot count is informational */ }
      setOpenAsks(open);
      setSent({ requestId: payload.requestId, companyDomain: payload.companyDomain || "the company", waitingForCoverage: payload.coverageStatus === "waiting_for_company_coverage" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not send this ask"); }
    finally { setSending(false); }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="ask-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">New ask</p>
        <h1 className="mt-2 text-3xl font-semibold">Write a great ask.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Compose below after signing in — referrers decide in under a minute, so make that minute easy.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in to ask</button></SignInButton></div>
      </main>
    );
  }

  if (sent) {
    return (
      <main data-skipwait-screen="ask-sent" className="mx-auto max-w-xl px-5 py-10 text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-[var(--accent)]"><Check className="size-10 text-[var(--primary)]" /></span>
        <h1 className="mt-4 text-3xl font-semibold">Ask sent to {sent.companyDomain}.</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">{sent.waitingForCoverage ? "No verified referrers there yet — we'll route it privately the moment coverage opens." : "Verified referrers there will see it. Your slot frees when it's answered, passed, or withdrawn."}</p>
        {openAsks !== null ? <p className="mt-4 text-sm">Open asks: <strong>{openAsks}</strong></p> : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={() => { setSent(null); setUrl(""); setNote(""); setCompensation(""); setResume(null); setResumeFile(null); }}>Write another</button>
          <Link href={`/conversation/${sent.requestId}`} className="brand-button">Track this ask <ArrowRight /></Link>
        </div>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="ask" className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      <div className="mb-6"><span className="eyebrow">New ask</span><h1 className="mt-2 text-4xl font-semibold">Write a great ask<span className="brand-dot">.</span></h1><p className="mt-2 max-w-xl text-[var(--muted-foreground)]">Referrers decide in under a minute. Make that minute easy.</p></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-8">
          <label className="block text-sm font-medium">Official job link
            <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://careers.company.com/…" inputMode="url" className={`mt-2 h-12 w-full rounded-full border bg-[var(--background)] px-5 text-base ${url && !officialUrl ? "border-[var(--destructive)]" : "border-[var(--input)]"}`} />
          </label>
          {url && !officialUrl ? <p className="mt-2 flex gap-2 text-sm text-[var(--destructive)]"><AlertTriangle className="size-4 shrink-0" />That doesn&apos;t look like a job posting link.</p> : null}
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
          <div className="mt-6">
            <span className="text-sm font-medium">Resume</span>
            {resume ? (
              <p className="mt-2 flex min-h-10 items-center gap-2 rounded-full bg-[var(--muted)] px-4 text-sm"><FileText className="size-4" />{resume.fileName}<button type="button" aria-label={`Remove ${resume.fileName}`} onClick={() => setResume(null)} className="ml-auto grid min-h-11 min-w-11 place-items-center"><X className="size-3.5" /></button></p>
            ) : (
              <label className="mt-2 flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[var(--input)] p-3 text-sm font-semibold">
                <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="sr-only" onChange={event => { pickResume(event.target.files); event.currentTarget.value = ""; }} />
                <FileText className="size-5 shrink-0" />{resumeFile ? resumeFile.name : "Add your resume (PDF, Word, PNG, JPEG)"}
              </label>
            )}
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">Shared with a referrer only after they accept.</p>
          </div>
          {error ? <p role="alert" className="mt-4 text-sm font-semibold text-[var(--destructive)]">{error}</p> : null}
        </section>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-3xl border border-[var(--border)] p-5">
            <div className="flex items-center justify-between"><span className="eyebrow">Ask strength</span><strong className={score === 4 ? "text-[var(--primary)]" : ""}>{strength}</strong></div>
            <div className="mt-3 flex gap-1" aria-hidden="true">{checks.map((check, i) => <span key={check.label} className={`h-2 flex-1 rounded-full ${i < score ? "bg-[var(--primary)]" : "bg-[var(--muted)]"}`} />)}</div>
            <ul className="mt-4 space-y-3">
              {checks.map(check => (
                <li key={check.label} className="flex gap-2 text-sm">
                  {check.ok ? <Check className="size-4 shrink-0 text-[var(--primary)]" /> : <Circle className="size-4 shrink-0 text-[var(--muted-foreground)]" />}
                  <span><strong className="block">{check.label}</strong>{!check.ok ? <small className="text-[var(--muted-foreground)]">{check.hint}</small> : null}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-[var(--muted)] p-5 text-sm"><Lightbulb className="mb-2 size-5" /><p>The referrer sees your role, note, and resume — not your name — until they accept.</p></div>
          <button type="button" disabled={!officialUrl || words < 10 || sending || uploading} onClick={() => { void send(); }} className="brand-button w-full">{sending || uploading ? "Sending…" : <>Send ask <ArrowRight /></>}</button>
          <p className="text-center text-xs text-[var(--muted-foreground)]">Referrals are always free</p>
        </aside>
      </div>
    </main>
  );
}
