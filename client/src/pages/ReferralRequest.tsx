import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { ArrowRight, CheckCircle2, Copy, LoaderCircle, Paperclip, Plus } from "lucide-react";
import { Brand } from "@/components/Brand";
import { AccountMenu } from "@/components/AccountMenu";
import { canSpendToken, getJobSeekerTokens, setJobSeekerTokens, TOKEN_ACTION_COST } from "@/lib/tokens";
import { clearReferralDraft } from "@/lib/pwaContinuity";
import { clearPendingResumeFiles, restorePendingResumeFiles, savePendingResumeFiles } from "@/lib/pendingResume";

type Attachment = { id: string; fileName: string; mimeType: string; fileSize: number; key: string; url: string };
const acceptedDocuments = ".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg";
const pendingResumeSubmissionKey = "skipwait-pending-resume-submit";

function getSavedAttachments(): Attachment[] {
  try { return JSON.parse(localStorage.getItem("bridge-seeker-attachments") || "[]") as Attachment[]; } catch { return []; }
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Shell({ children, tokens, label }: { children: React.ReactNode; tokens: number; label: string }) {
  return <main data-skipwait-screen="request" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between gap-3"><Brand /><div className="flex items-center gap-2"><span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 sm:inline">{tokens} {label}</span><AccountMenu /></div></header>{children}</div></main>;
}

function initialHiringManagerEmail(candidate: string, targetRoleUrl: string) {
  return `Subject: Referral — ${candidate} for this role\n\nHi [Hiring Manager Name],\n\nI’d like to recommend ${candidate} for this opportunity: ${targetRoleUrl}\n\n${candidate} [accomplished X], measured by [Y], by [doing Z].\n\nI’ve attached their supporting documents for your review and am happy to share more context if helpful.\n\nBest,\n[Your Name]`;
}

export default function ReferralRequest() {
  const [tokens, setTokens] = useState(getJobSeekerTokens);
  const [attachments, setAttachments] = useState<Attachment[]>(getSavedAttachments);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingFilesRestored, setPendingFilesRestored] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [companyDomain, setCompanyDomain] = useState("");
  const [hiringManagerEmail, setHiringManagerEmail] = useState("");
  const [showEmailDraft, setShowEmailDraft] = useState(false);
  const { isSignedIn, getToken } = useClerkAuth();
  const { openSignIn } = useClerk();
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const attachmentCount = attachments.length + pendingFiles.length;

  useEffect(() => {
    let active = true;
    void restorePendingResumeFiles().then(files => { if (active) setPendingFiles(current => current.length ? current : files); }).catch(() => undefined).finally(() => { if (active) setPendingFilesRestored(true); });
    return () => { active = false; };
  }, []);

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return [] as Attachment[];
    setUploading(true);
    setError("");
    try {
      const clerkToken = await getToken();
      const uploaded = await Promise.all(files.map(async file => {
        const dataUrl = await readFile(file);
        const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json", ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}) }, credentials: "include", body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", dataUrl }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Upload failed");
        return payload as Attachment;
      }));
      setAttachments(current => {
        const next = [...current, ...uploaded];
        localStorage.setItem("bridge-seeker-attachments", JSON.stringify(next));
        return next;
      });
      return uploaded;
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
      throw uploadError;
    } finally { setUploading(false); }
  };

  const selectFiles = (files: FileList | null) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setError("");
    if (isSignedIn) { void uploadFiles(selected); return; }
    setPendingFiles(current => {
      const next = [...current, ...selected];
      void savePendingResumeFiles(next).catch(() => undefined);
      return next;
    });
  };

  const removeAttachment = (id: string) => setAttachments(current => {
    const next = current.filter(attachment => attachment.id !== id);
    localStorage.setItem("bridge-seeker-attachments", JSON.stringify(next));
    return next;
  });
  const removePendingFile = (index: number) => setPendingFiles(current => {
    const next = current.filter((_, currentIndex) => currentIndex !== index);
    void savePendingResumeFiles(next).catch(() => undefined);
    return next;
  });

  const send = async () => {
    if (!attachmentCount) { setError("Add your resume before sending this request."); return; }
    if (!isSignedIn) return;
    if (!canSpendToken(tokens)) { setError("You need 1 application token to send this request. Add one for $1 to continue."); return; }
    const targetRoleUrl = localStorage.getItem("bridge-target-url");
    if (!targetRoleUrl) { setError("Add a Target Role URL before sending your request."); return; }
    setSubmitting(true);
    setError("");
    try {
      const newlyUploaded = await uploadFiles(pendingFiles);
      const allAttachments = [...attachments, ...newlyUploaded];
      const clerkToken = await getToken();
      const response = await fetch("/api/company-referrals", { method: "POST", headers: { "Content-Type": "application/json", ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}) }, credentials: "include", body: JSON.stringify({ targetRoleUrl, attachmentIds: allAttachments.map(attachment => Number(attachment.id)).filter(Number.isInteger) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "We could not send this private referral request");
      setPendingFiles([]);
      void clearPendingResumeFiles().catch(() => undefined);
      sessionStorage.removeItem(pendingResumeSubmissionKey);
      const serverTokens = Number(payload.remainingTokens);
      const nextTokens = Number.isFinite(serverTokens) && serverTokens >= 0 ? serverTokens : tokens;
      setTokens(nextTokens);
      setJobSeekerTokens(nextTokens);
      setCompanyDomain(payload.companyDomain || "the target company");
      setHiringManagerEmail(initialHiringManagerEmail(localStorage.getItem("bridge-name") || "Candidate", targetRoleUrl));
      clearReferralDraft();
      localStorage.setItem("bridge-request-sent", "true");
      setSubmitted(true);
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "We could not send this private referral request"); }
    finally { setSubmitting(false); }
  };

  const handleSend = async () => {
    if (!attachmentCount) { setError("Add your resume before sending this request."); return; }
    if (!isSignedIn) {
      sessionStorage.setItem(pendingResumeSubmissionKey, "true");
      await savePendingResumeFiles(pendingFiles).catch(() => undefined);
      openSignIn();
      return;
    }
    void send();
  };

  useEffect(() => {
    if (!isSignedIn || !pendingFilesRestored || sessionStorage.getItem(pendingResumeSubmissionKey) !== "true") return;
    sessionStorage.removeItem(pendingResumeSubmissionKey);
    void send();
  }, [isSignedIn, pendingFilesRestored]);

  if (submitted && showEmailDraft && hiringManagerEmail) return <Shell tokens={tokens} label="tokens left"><section className="flex min-h-0 flex-1 flex-col"><div className="flex min-h-0 flex-1 flex-col justify-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Step 3 of 3 · Your email</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Make the introduction yours.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Edit this only when you are ready to send it to the hiring manager.</p><textarea aria-label="Hiring-manager referral email" value={hiringManagerEmail} onChange={event => setHiringManagerEmail(event.target.value)} className="mt-5 h-60 w-full resize-none rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm leading-6 text-slate-800 outline-none focus:border-[#0B57D0]" /></div><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><button type="button" onClick={() => navigator.clipboard?.writeText(hiringManagerEmail)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white"><Copy className="h-4 w-4" />Copy email</button><button type="button" onClick={() => setShowEmailDraft(false)} className="mt-3 w-full text-sm font-semibold text-slate-600">Back to request</button></footer></section></Shell>;

  if (submitted) return <Shell tokens={tokens} label="tokens left"><section className="flex min-h-0 flex-1 flex-col"><div className="flex flex-1 flex-col justify-center"><span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Private request created</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Your request is with verified employees.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Eligible employees at <strong>{companyDomain}</strong> were notified privately. Their identity stays hidden unless someone claims your request.</p><div className="mt-6 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-slate-600"><span className="rounded-lg bg-slate-100 px-2 py-2">Routed privately</span><span className="rounded-lg bg-slate-100 px-2 py-2">One employee claims</span><span className="rounded-lg bg-slate-100 px-2 py-2">You stay in control</span></div></div><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><button type="button" onClick={() => setShowEmailDraft(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white">Prepare your referral email <ArrowRight className="h-4 w-4" /></button><Link href="/requests" className="mt-3 block text-center text-sm font-semibold text-slate-600">View my request</Link></footer></section></Shell>;

  const resumePicker = <div className="mt-4"><input ref={resumeInputRef} type="file" multiple accept={acceptedDocuments} className="sr-only" disabled={uploading} onChange={event => { selectFiles(event.target.files); event.currentTarget.value = ""; }} /><button type="button" onClick={() => resumeInputRef.current?.click()} disabled={uploading} className={`flex w-full items-center gap-3 rounded-xl border ${attachmentCount ? "border-dashed border-blue-200 bg-blue-50/30" : "border-dashed border-slate-300 bg-slate-50"} p-4 text-left text-sm font-semibold text-slate-700 disabled:cursor-wait disabled:opacity-70`}><span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[#0B57D0] shadow-sm">{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : attachmentCount ? <Plus className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}</span>{uploading ? <span>Uploading documents…</span> : attachmentCount ? <span className="flex min-w-0 flex-col gap-0.5"><span>Add supporting document <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] text-[#0B57D0]">Optional</span></span><span className="text-xs font-normal leading-5 text-slate-500">Add context only if it strengthens your case.</span></span> : <span className="flex min-w-0 flex-col gap-0.5"><span>Add your resume</span><span className="text-xs font-normal leading-5 text-slate-500">You will sign in only when you send.</span></span>}</button></div>;
  const visibleAttachments = attachments.slice(0, 2);
  const visiblePendingFiles = pendingFiles.slice(0, Math.max(0, 2 - visibleAttachments.length));

  return <Shell tokens={tokens} label="tokens available"><section className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 flex flex-col justify-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Step 2 of 3 · Required</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Add your resume.</h1><p className="mt-4 text-sm leading-6 text-slate-600">This is the only document needed to send your private request.</p><div className="mt-6 space-y-2">{visibleAttachments.map(attachment => <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-xs font-bold text-[#0B57D0]">DOC</span><p className="truncate text-sm font-semibold text-slate-800">{attachment.fileName}</p></div><button type="button" onClick={() => removeAttachment(attachment.id)} className="rounded-lg p-2 text-lg leading-none text-slate-400" aria-label={`Remove ${attachment.fileName}`}>×</button></div>)}{visiblePendingFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-[#0B57D0]">DOC</span><p className="truncate text-sm font-semibold text-slate-800">{file.name}</p></div><button type="button" onClick={() => removePendingFile(index)} className="rounded-lg p-2 text-lg leading-none text-slate-400" aria-label={`Remove ${file.name}`}>×</button></div>)}{attachmentCount > 2 && <p className="px-1 text-xs font-medium text-slate-500">+ {attachmentCount - 2} more document{attachmentCount - 2 === 1 ? "" : "s"} attached</p>}</div>{resumePicker}{error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}</div><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><p className="mb-3 text-xs text-slate-500">{TOKEN_ACTION_COST} token on send · {tokens} available</p>{canSpendToken(tokens) ? <button type="button" disabled={!attachmentCount || uploading || submitting || !pendingFilesRestored} onClick={() => { void handleSend(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0847AD] disabled:opacity-40">{submitting ? "Sending private request…" : "Send private referral request"} <ArrowRight className="h-4 w-4" /></button> : <Link href="/premium" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white">Add token to continue · $1 <ArrowRight className="h-4 w-4" /></Link>}</footer></section></Shell>;
}
