import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Paperclip, Plus, Share2, UsersRound } from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { canSpendToken, getJobSeekerTokens, setJobSeekerTokens, TOKEN_ACTION_COST } from "@/lib/tokens";
import { clearReferralDraft } from "@/lib/pwaContinuity";
import { clearPendingResumeFiles, restorePendingResumeFiles, savePendingResumeFiles } from "@/lib/pendingResume";

type Attachment = { id: string; fileName: string; mimeType: string; fileSize: number; key: string; url: string };
type CreditSummary = { plan: "free" | "pro" | "max"; monthlyAllowance: number; monthlyCreditsRemaining: number; purchasedCreditsRemaining: number; totalAvailable: number; cycleKey: string; subscriptionStatus: string | null; subscriptionCurrentTermEnd: string | null };

const acceptedDocuments = ".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg";
const pendingResumeSubmissionKey = "skipwait-pending-resume-submit";
const FREE_MONTHLY_ALLOWANCE = 3;

function getSavedAttachments(): Attachment[] { try { return JSON.parse(localStorage.getItem("bridge-seeker-attachments") || "[]") as Attachment[]; } catch { return []; } }
function readFile(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); }
function fallbackSummary(total: number): CreditSummary { const safe = Math.max(0, total); return { plan: "free", monthlyAllowance: FREE_MONTHLY_ALLOWANCE, monthlyCreditsRemaining: Math.min(safe, FREE_MONTHLY_ALLOWANCE), purchasedCreditsRemaining: Math.max(0, safe - FREE_MONTHLY_ALLOWANCE), totalAvailable: safe, cycleKey: "", subscriptionStatus: null, subscriptionCurrentTermEnd: null }; }
function isCreditSummary(value: unknown): value is CreditSummary { if (!value || typeof value !== "object") return false; const candidate = value as Partial<CreditSummary>; return (candidate.plan === "free" || candidate.plan === "pro" || candidate.plan === "max") && typeof candidate.monthlyAllowance === "number" && typeof candidate.monthlyCreditsRemaining === "number" && typeof candidate.purchasedCreditsRemaining === "number" && typeof candidate.totalAvailable === "number"; }

function Shell({ children, tokens, label }: { children: React.ReactNode; tokens: number; label: string }) {
  return (
    <main data-skipwait-screen="request" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950">
      <div className="mx-auto flex h-full max-w-xl flex-col">
        <header className="flex h-10 shrink-0 items-center justify-between gap-3">
          <Link href="/start" className="inline-flex items-center gap-1 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</Link>
          <div className="flex items-center gap-2">
            <AccountMenu />
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

function ordinal(value: number) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  return `${value}${value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th"}`;
}

function ReferralRequestSuccess({ summary, companyDomain, lifetimeRequestCount }: { summary: CreditSummary; companyDomain: string; lifetimeRequestCount: number | null }) {
  const used = Math.max(0, summary.monthlyAllowance - summary.monthlyCreditsRemaining);
  const exhausted = summary.totalAvailable === 0;
  const isFree = summary.plan === "free";
  return <Shell tokens={summary.totalAvailable} label="credits left"><section className="flex min-h-0 flex-1 flex-col"><div className="flex flex-1 flex-col justify-center"><span data-referral-success="true" className="referral-success-mark grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Private request created</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Your request is with verified employees.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Eligible employees at <strong>{companyDomain}</strong> were notified privately. Their identity stays hidden unless someone claims your request.</p>{lifetimeRequestCount ? <p aria-label="Referral request milestone" className="mt-4 text-sm font-semibold text-emerald-800">Your {ordinal(lifetimeRequestCount)} referral request is now active.</p> : null}<section aria-label="Referral credits" className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#0B57D0]">{isFree ? "Free plan" : `${summary.plan} plan`}</p><p className="text-sm font-bold text-slate-900">{summary.monthlyCreditsRemaining} this month</p></div><div role="progressbar" aria-label="Monthly referral credits used" aria-valuemin={0} aria-valuemax={summary.monthlyAllowance} aria-valuenow={used} className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100"><span className="block h-full rounded-full bg-[#0B57D0]" style={{ width: `${summary.monthlyAllowance ? (used / summary.monthlyAllowance) * 100 : 0}%` }} /></div><p className="mt-3 text-sm leading-5 text-slate-700">{isFree ? `${used} of ${summary.monthlyAllowance} free credits used this month.` : `${used} of ${summary.monthlyAllowance} monthly credits used.`}</p></section></div><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">{exhausted ? <><p role="status" className="mb-3 text-center text-sm font-semibold text-slate-700">You have used all available referral credits.</p><Link href="/premium?role=job_seeker" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white">Add credits <ArrowRight className="h-4 w-4" /></Link></> : <><Link href="/share" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white">Share your invite link <Share2 className="h-4 w-4" /></Link><Link href="/start" className="mt-3 block text-center text-sm font-semibold text-slate-600">Request another referral</Link></>}<Link href="/requests" className="mt-3 block text-center text-sm font-semibold text-slate-600">View my request</Link></footer></section></Shell>;
}

export default function ReferralRequest() {
  const [tokens, setTokens] = useState(getJobSeekerTokens);
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>(getSavedAttachments);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingFilesRestored, setPendingFilesRestored] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [companyDomain, setCompanyDomain] = useState("");
  const [coveragePending, setCoveragePending] = useState(false);
  const [coverageInviteCode, setCoverageInviteCode] = useState("");
  const [coverageInviteStatus, setCoverageInviteStatus] = useState("");
  const [lifetimeRequestCount, setLifetimeRequestCount] = useState<number | null>(null);
  const [candidateMessage, setCandidateMessage] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const { isSignedIn, getToken } = useClerkAuth();
  const { openSignIn } = useClerk();
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const attachmentCount = attachments.length + pendingFiles.length;
  const summary = creditSummary ?? fallbackSummary(tokens);

  useEffect(() => {
    let active = true;
    void restorePendingResumeFiles().then(files => { if (active) setPendingFiles(current => current.length ? current : files); }).catch(() => undefined).finally(() => { if (active) setPendingFilesRestored(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const clerkToken = await getToken();
        const response = await fetch("/api/credits/summary?role=job_seeker", { credentials: "include", headers: clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {} });
        const payload = await response.json().catch(() => ({}));
        if (active && response.ok && isCreditSummary(payload.summary)) { setCreditSummary(payload.summary); setTokens(payload.summary.totalAvailable); setJobSeekerTokens(payload.summary.totalAvailable); }
      } catch { /* The request path retains the locally cached balance while the summary refreshes later. */ }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return [] as Attachment[];
    setUploading(true); setError("");
    try {
      const clerkToken = await getToken();
      const uploaded = await Promise.all(files.map(async file => {
        const dataUrl = await readFile(file);
        const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json", ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}) }, credentials: "include", body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", dataUrl }) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Upload failed"); return payload as Attachment;
      }));
      setAttachments(current => { const next = [...current, ...uploaded]; localStorage.setItem("bridge-seeker-attachments", JSON.stringify(next)); return next; });
      return uploaded;
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Upload failed"); throw uploadError; } finally { setUploading(false); }
  };

  const selectFiles = (files: FileList | null) => {
    const selected = Array.from(files || []); if (!selected.length) return; setError("");
    if (isSignedIn) { void uploadFiles(selected); return; }
    setPendingFiles(current => { const next = [...current, ...selected]; void savePendingResumeFiles(next).catch(() => undefined); return next; });
  };
  const removeAttachment = (id: string) => setAttachments(current => { const next = current.filter(attachment => attachment.id !== id); localStorage.setItem("bridge-seeker-attachments", JSON.stringify(next)); return next; });
  const removePendingFile = (index: number) => setPendingFiles(current => { const next = current.filter((_, currentIndex) => currentIndex !== index); void savePendingResumeFiles(next).catch(() => undefined); return next; });

  const send = async () => {
    if (!attachmentCount) { setError("Add your resume before sending this request."); return; }
    if (!isSignedIn) return;
    if (!canSpendToken(summary.totalAvailable)) { setError("You have used this month’s included credits. Add a credit pack or choose Pro or Max to send another referral."); return; }
    const targetRoleUrl = localStorage.getItem("bridge-target-url");
    if (!targetRoleUrl) { setError("Add a Target Role URL before sending your request."); return; }
    setSubmitting(true); setError("");
    try {
      const newlyUploaded = await uploadFiles(pendingFiles);
      const allAttachments = [...attachments, ...newlyUploaded];
      const clerkToken = await getToken();
      const response = await fetch("/api/company-referrals", { method: "POST", headers: { "Content-Type": "application/json", ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}) }, credentials: "include", body: JSON.stringify({ targetRoleUrl, attachmentIds: allAttachments.map(attachment => Number(attachment.id)).filter(Number.isInteger), candidateMessage: candidateMessage.trim() }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "We could not send this private referral request");
      const nextSummary = isCreditSummary(payload.creditSummary) ? payload.creditSummary : fallbackSummary(Number.isFinite(Number(payload.remainingTokens)) ? Number(payload.remainingTokens) : Math.max(0, summary.totalAvailable - TOKEN_ACTION_COST));
      setCreditSummary(nextSummary); setTokens(nextSummary.totalAvailable); setJobSeekerTokens(nextSummary.totalAvailable);
      setPendingFiles([]); void clearPendingResumeFiles().catch(() => undefined); sessionStorage.removeItem(pendingResumeSubmissionKey);
      setCoveragePending(payload.coverageStatus === "waiting_for_company_coverage");
      setCoverageInviteCode(typeof payload.coverageInviteCode === "string" ? payload.coverageInviteCode : "");
      setCompanyDomain(payload.companyDomain || "the target company"); setLifetimeRequestCount(Number.isInteger(payload.lifetimeRequestCount) && payload.lifetimeRequestCount > 0 ? payload.lifetimeRequestCount : null); clearReferralDraft(); localStorage.setItem("bridge-request-sent", "true"); setSubmitted(true);
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "We could not send this private referral request"); } finally { setSubmitting(false); }
  };

  const handleSend = async () => { if (!attachmentCount) { resumeInputRef.current?.click(); return; } if (!isSignedIn) { sessionStorage.setItem(pendingResumeSubmissionKey, "true"); await savePendingResumeFiles(pendingFiles).catch(() => undefined); openSignIn(); return; } void send(); };
  useEffect(() => { if (!isSignedIn || !pendingFilesRestored || sessionStorage.getItem(pendingResumeSubmissionKey) !== "true") return; sessionStorage.removeItem(pendingResumeSubmissionKey); void send(); }, [isSignedIn, pendingFilesRestored]);

  if (submitted && !coveragePending) return <ReferralRequestSuccess summary={summary} companyDomain={companyDomain} lifetimeRequestCount={lifetimeRequestCount} />;

  if (submitted) {
    if (coveragePending) {
      const inviteLink = `${window.location.origin}/referrer?company=${encodeURIComponent(companyDomain)}&source=coverage${coverageInviteCode ? `&invite=${encodeURIComponent(coverageInviteCode)}` : ""}`;
      const inviteText = `I’m building private referral coverage for ${companyDomain} on skipwait.me. If you work there, verify a matching work email to choose whether you want to help. Your identity stays hidden from Job Seekers. After a matching verification, you and I each receive one referral credit.\n\n${inviteLink}`;
      const inviteEmployee = async () => {
        try {
          if (navigator.share) { await navigator.share({ title: `Private company coverage at ${companyDomain}`, text: inviteText, url: inviteLink }); return; }
          await navigator.clipboard.writeText(inviteText); setCoverageInviteStatus("Invite copied. Send it to one trusted employee at this company.");
        } catch { setCoverageInviteStatus("You can share this page with one employee at the company when ready."); }
      };
      return <Shell tokens={summary.totalAvailable} label="credits available"><section data-skipwait-coverage-invite="true" className="flex min-h-0 flex-1 flex-col"><div className="flex flex-1 flex-col items-center justify-center"><span className="grid h-16 w-16 place-items-center rounded-3xl bg-blue-50 text-[#0B57D0]"><UsersRound className="h-7 w-7" /></span><span className="mt-6 h-2 w-20 rounded-full bg-slate-100" /></div>{coverageInviteStatus && <p role="status" className="sr-only">{coverageInviteStatus}</p>}<footer className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><button type="button" aria-label={`Invite one employee at ${companyDomain}`} onClick={() => { void inviteEmployee(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white"><Share2 className="h-4 w-4" />Invite at {companyDomain}</button></footer></section></Shell>;
    }
    const used = Math.max(0, summary.monthlyAllowance - summary.monthlyCreditsRemaining);
    const exhausted = summary.totalAvailable === 0;
    const isFree = summary.plan === "free";
    return <Shell tokens={summary.totalAvailable} label="credits left"><section className="flex min-h-0 flex-1 flex-col"><div className="flex flex-1 flex-col justify-center"><span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Private request created</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Your request is with verified employees.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Eligible employees at <strong>{companyDomain}</strong> were notified privately. Their identity stays hidden unless someone claims your request.</p><section aria-label="Referral credits" className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#0B57D0]">{isFree ? "Free plan" : `${summary.plan} plan`}</p><p className="text-sm font-bold text-slate-900">{summary.monthlyCreditsRemaining} this month</p></div><div role="progressbar" aria-label="Monthly referral credits used" aria-valuemin={0} aria-valuemax={summary.monthlyAllowance} aria-valuenow={used} className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100"><span className="block h-full rounded-full bg-[#0B57D0]" style={{ width: `${summary.monthlyAllowance ? (used / summary.monthlyAllowance) * 100 : 0}%` }} /></div><p className="mt-3 text-sm leading-5 text-slate-700">{isFree ? `${used} of ${summary.monthlyAllowance} free credits used this month.` : `${used} of ${summary.monthlyAllowance} monthly credits used.`}{summary.purchasedCreditsRemaining > 0 ? ` ${summary.purchasedCreditsRemaining} credit${summary.purchasedCreditsRemaining === 1 ? "" : "s"} from your pack remain.` : ""}</p></section></div><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">{exhausted ? <><p role="status" className="mb-3 text-center text-sm font-semibold text-slate-700">You have used all available referral credits.</p><Link href="/premium?role=job_seeker" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white">Add credits <ArrowRight className="h-4 w-4" /></Link><Link href="/plans?role=job_seeker" className="mt-3 block text-center text-sm font-semibold text-[#0B57D0]">Compare Pro and Max</Link></> : <Link href="/start" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white">Request another referral <ArrowRight className="h-4 w-4" /></Link>}<Link href="/requests" className="mt-3 block text-center text-sm font-semibold text-slate-600">View my request</Link></footer></section></Shell>;
  }

  const resumePicker = <div className="mt-4"><input ref={resumeInputRef} type="file" multiple accept={acceptedDocuments} className="sr-only" disabled={uploading} onChange={event => { selectFiles(event.target.files); event.currentTarget.value = ""; }} /><button type="button" onClick={() => resumeInputRef.current?.click()} disabled={uploading} className={`flex w-full items-center gap-3 rounded-xl border ${attachmentCount ? "border-dashed border-blue-200 bg-blue-50/30" : "border-dashed border-slate-300 bg-slate-50"} p-4 text-left text-sm font-semibold text-slate-700 disabled:cursor-wait disabled:opacity-70`}><span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[#0B57D0] shadow-sm">{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : attachmentCount ? <Plus className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}</span>{uploading ? <span>Uploading documents…</span> : attachmentCount ? <span className="flex min-w-0 flex-col gap-0.5"><span>Add supporting document <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] text-[#0B57D0]">Optional</span></span><span className="text-xs font-normal leading-5 text-slate-500">Add context only if it strengthens your case.</span></span> : <span className="flex min-w-0 flex-col gap-0.5"><span>Add your resume</span><span className="text-xs font-normal leading-5 text-slate-500">You will sign in only when you send.</span></span>}</button>{attachmentCount ? noteOpen ? <label className="mt-3 block"><span className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">Note for the Referrer <span className="normal-case font-medium">(optional)</span></span><textarea value={candidateMessage} onChange={event => setCandidateMessage(event.target.value.slice(0, 2000))} maxLength={2000} placeholder="A short reason you are a strong fit." rows={3} className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm leading-5 text-slate-800 outline-none ring-[#0B57D0] focus:ring-2" /></label> : <button type="button" onClick={() => setNoteOpen(true)} className="mt-3 text-sm font-semibold text-[#0B57D0]">Add a note for the Referrer <span className="text-slate-500">(optional)</span></button> : null}</div>;
  const visibleAttachments = attachments.slice(0, 2);
  const visiblePendingFiles = pendingFiles.slice(0, Math.max(0, 2 - visibleAttachments.length));
  const primaryRequestAction = !attachmentCount ? "Add your resume" : !isSignedIn ? "Sign in & send private request" : "Send private referral request";
  return <Shell tokens={summary.totalAvailable} label="credits available"><section className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 flex flex-col justify-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Step 2 of 3 · Required</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Add your resume.</h1><p className="mt-4 text-sm leading-6 text-slate-600">This is the only document needed to send your private request.</p><div className="mt-6 space-y-2">{visibleAttachments.map(attachment => <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-xs font-bold text-[#0B57D0]">DOC</span><p className="truncate text-sm font-semibold text-slate-800">{attachment.fileName}</p></div><button type="button" onClick={() => removeAttachment(attachment.id)} className="rounded-lg p-2 text-lg leading-none text-slate-400" aria-label={`Remove ${attachment.fileName}`}>×</button></div>)}{visiblePendingFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-[#0B57D0]">DOC</span><p className="truncate text-sm font-semibold text-slate-800">{file.name}</p></div><button type="button" onClick={() => removePendingFile(index)} className="rounded-lg p-2 text-lg leading-none text-slate-400" aria-label={`Remove ${file.name}`}>×</button></div>)}{attachmentCount > 2 && <p className="px-1 text-xs font-medium text-slate-500">+ {attachmentCount - 2} more document{attachmentCount - 2 === 1 ? "" : "s"} attached</p>}</div>{resumePicker}{error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}</div><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">{isSignedIn && creditSummary && <p className="mb-3 text-xs text-slate-500">{creditSummary.monthlyCreditsRemaining}/{creditSummary.monthlyAllowance} monthly credits left{creditSummary.purchasedCreditsRemaining ? ` · ${creditSummary.purchasedCreditsRemaining} from packs` : ""}</p>}{canSpendToken(summary.totalAvailable) ? <button type="button" disabled={uploading || submitting || (attachmentCount > 0 && !pendingFilesRestored)} onClick={() => { void handleSend(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0847AD] disabled:opacity-40">{submitting ? "Sending private request…" : primaryRequestAction} <ArrowRight className="h-4 w-4" /></button> : <><p role="status" className="mb-3 text-center text-sm font-semibold text-slate-700">You have used all available referral credits.</p><Link href="/premium?role=job_seeker" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white">Add credits <ArrowRight className="h-4 w-4" /></Link><Link href="/plans?role=job_seeker" className="mt-3 block text-center text-sm font-semibold text-[#0B57D0]">Or compare Pro and Max</Link></>}</footer></section></Shell>;
}
