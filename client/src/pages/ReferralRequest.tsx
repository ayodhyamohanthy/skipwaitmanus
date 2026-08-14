import { CheckCircle2, ChevronRight, Copy, FileText, LoaderCircle, Mail, Paperclip, Plus, Send, Sparkles, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { SignInButton, useAuth as useClerkAuth } from "@clerk/react";
import { Brand } from "@/components/Brand";
import { AccountMenu } from "@/components/AccountMenu";
import { CompanyInviteCard } from "@/components/CompanyInviteCard";
import { canSpendToken, getJobSeekerTokens, setJobSeekerTokens, spendToken, TOKEN_ACTION_COST } from "@/lib/tokens";
import { clearReferralDraft } from "@/lib/pwaContinuity";
import { trpc } from "@/lib/trpc";

type Attachment = { id: string; fileName: string; mimeType: string; fileSize: number; key: string; url: string };
const acceptedDocuments = ".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg";

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
  return <main data-skipwait-screen="request" className="min-h-screen bg-slate-50 px-6 py-6 text-slate-950"><div className="mx-auto max-w-3xl"><div className="flex items-center justify-between gap-3"><Brand /><div className="flex items-center gap-2"><span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 sm:inline">{tokens} {label}</span><AccountMenu /></div></div>{children}</div></main>;
}

function Status({ title, body }: { title: string; body: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{body}</p></div>;
}

function initialHiringManagerEmail(candidate: string, targetRoleUrl: string) {
  return `Subject: Referral — ${candidate} for this role\n\nHi [Hiring Manager Name],\n\nI’d like to recommend ${candidate} for this opportunity: ${targetRoleUrl}\n\n${candidate} [accomplished X], measured by [Y], by [doing Z].\n\nI’ve attached their supporting documents for your review and am happy to share more context if helpful.\n\nBest,\n[Your Name]`;
}

export default function ReferralRequest() {
  const [tokens, setTokens] = useState(getJobSeekerTokens);
  const [attachments, setAttachments] = useState<Attachment[]>(getSavedAttachments);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [companyDomain, setCompanyDomain] = useState("");
  const [accomplished, setAccomplished] = useState("");
  const [measuredBy, setMeasuredBy] = useState("");
  const [byDoing, setByDoing] = useState("");
  const [hiringManagerEmail, setHiringManagerEmail] = useState("");
  const { isSignedIn, getToken } = useClerkAuth();
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const submitAfterSignInRef = useRef(false);
  const attachmentCount = attachments.length + pendingFiles.length;

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return [] as Attachment[];
    setUploading(true);
    setError("");
    try {
      const clerkToken = await getToken();
      const uploaded = await Promise.all(files.map(async (file) => {
        const dataUrl = await readFile(file);
        const response = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}) },
          credentials: "include",
          body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", dataUrl }),
        });
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
    } finally {
      setUploading(false);
    }
  };

  const selectFiles = (files: FileList | null) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setError("");
    if (isSignedIn) {
      void uploadFiles(selected);
      return;
    }
    setPendingFiles(current => [...current, ...selected]);
  };

  const removeAttachment = (id: string) => setAttachments(current => {
    const next = current.filter(attachment => attachment.id !== id);
    localStorage.setItem("bridge-seeker-attachments", JSON.stringify(next));
    return next;
  });
  const removePendingFile = (index: number) => setPendingFiles(current => current.filter((_, currentIndex) => currentIndex !== index));

  const generateEmail = trpc.ai.draftHiringManagerEmail.useMutation({ onSuccess: ({ draft }) => setHiringManagerEmail(draft) });
  const addEvidence = () => {
    if (!accomplished.trim() || !measuredBy.trim() || !byDoing.trim()) return;
    const candidate = localStorage.getItem("bridge-name") || "the candidate";
    const evidence = `${candidate} ${accomplished.trim()}, measured by ${measuredBy.trim()}, by ${byDoing.trim()}.`;
    setHiringManagerEmail(current => current.replace(`${candidate} [accomplished X], measured by [Y], by [doing Z].`, evidence));
  };
  const createAiDraft = () => {
    const targetRoleUrl = localStorage.getItem("bridge-target-url") || "";
    generateEmail.mutate({ candidateName: localStorage.getItem("bridge-name") || "Candidate", targetRoleUrl, accomplished: accomplished.trim() || undefined, measuredBy: measuredBy.trim() || undefined, byDoing: byDoing.trim() || undefined });
  };

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
      const response = await fetch("/api/company-referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ targetRoleUrl, attachmentIds: allAttachments.map(attachment => Number(attachment.id)).filter(Number.isInteger) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "We could not send this private referral request");
      setPendingFiles([]);
      const nextTokens = spendToken(tokens);
      setTokens(nextTokens);
      setJobSeekerTokens(nextTokens);
      setCompanyDomain(payload.companyDomain || "the target company");
      setHiringManagerEmail(initialHiringManagerEmail(localStorage.getItem("bridge-name") || "Candidate", targetRoleUrl));
      clearReferralDraft();
      localStorage.setItem("bridge-request-sent", "true");
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We could not send this private referral request");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (isSignedIn && submitAfterSignInRef.current) {
      submitAfterSignInRef.current = false;
      void send();
    }
  }, [isSignedIn]);

  if (submitted && hiringManagerEmail) return <Shell tokens={tokens} label="tokens left"><section className="mt-14 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Private request created</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Your request is with verified employees.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Eligible employees at <strong>{companyDomain}</strong> were notified privately. Their identities stay hidden until an employee claims your request.</p></div></div>{companyDomain && <div className="mt-7"><CompanyInviteCard companyDomain={companyDomain} placement="request" /></div>}<div className="mt-8 rounded-xl border border-blue-100 bg-blue-50 p-5"><div className="flex items-start gap-3"><Mail className="mt-0.5 h-5 w-5 text-[#0B57D0]" /><div><p className="text-sm font-semibold text-[#0B57D0]">Your hiring-manager referral email</p><p className="mt-1 text-xs leading-5 text-slate-600">Use specific evidence: <strong>accomplished X + measured by Y + by doing Z.</strong> This draft is yours to edit and send only after your referral request is applied.</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-700">Accomplished X<input value={accomplished} onChange={event => setAccomplished(event.target.value)} placeholder="improved activation" className="mt-1.5 w-full rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#0B57D0]" /></label><label className="text-xs font-semibold text-slate-700">Measured by Y<input value={measuredBy} onChange={event => setMeasuredBy(event.target.value)} placeholder="24% in one quarter" className="mt-1.5 w-full rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#0B57D0]" /></label><label className="text-xs font-semibold text-slate-700">By doing Z<input value={byDoing} onChange={event => setByDoing(event.target.value)} placeholder="redesigning onboarding" className="mt-1.5 w-full rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#0B57D0]" /></label></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={createAiDraft} disabled={generateEmail.isPending} className="inline-flex items-center gap-2 rounded-lg border border-[#0B57D0] bg-white px-3 py-2 text-xs font-semibold text-[#0B57D0] disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />{generateEmail.isPending ? "Drafting…" : "Generate an editable draft"}</button><button type="button" onClick={addEvidence} disabled={!accomplished || !measuredBy || !byDoing} className="inline-flex items-center gap-2 rounded-lg bg-[#0B57D0] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Add evidence to email</button></div></div><textarea aria-label="Hiring-manager referral email" value={hiringManagerEmail} onChange={event => setHiringManagerEmail(event.target.value)} className="mt-5 min-h-72 w-full rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm leading-6 text-slate-800 outline-none focus:border-[#0B57D0]" /><button type="button" onClick={() => navigator.clipboard?.writeText(hiringManagerEmail)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"><Copy className="h-4 w-4" />Copy email</button><div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Application tokens</p><p className="mt-1 text-xl font-semibold text-slate-900">{tokens} application token{tokens === 1 ? "" : "s"} left</p></div><Link href="/premium" className="rounded-lg bg-[#0B57D0] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0847AD]">Add tokens · $1 each</Link></div></section></Shell>;

  if (submitted) return <Shell tokens={tokens} label="tokens left"><section className="mt-14 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Private request created</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Your request is with verified employees.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Eligible employees at <strong>{companyDomain}</strong> were notified privately. Their identities stay hidden until an employee claims your request.</p></div></div><div className="mt-9 grid gap-3 sm:grid-cols-3"><Status title="1. Private routing" body="Only eligible work-email-verified employees are notified." /><Status title="2. Employee claims" body="One employee can claim your request." /><Status title="3. Personal email" body="The employee writes the introduction in their own voice." /></div><div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Application tokens</p><p className="mt-1 text-xl font-semibold text-slate-900">{tokens} included token{tokens === 1 ? "" : "s"} left</p></div><Link href="/premium" className="rounded-lg bg-[#0B57D0] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0847AD]">Add tokens · $1 each</Link></div></section></Shell>;

  const resumePicker = <div className="mt-4"><input ref={resumeInputRef} type="file" multiple accept={acceptedDocuments} className="sr-only" disabled={uploading} onChange={(event) => { selectFiles(event.target.files); event.currentTarget.value = ""; }} /><button type="button" onClick={() => resumeInputRef.current?.click()} disabled={uploading} className={`flex w-full items-center gap-3 rounded-xl border ${attachmentCount ? "border-dashed border-blue-200 bg-blue-50/30" : "border-dashed border-slate-300 bg-slate-50"} p-4 text-left text-sm font-semibold text-slate-700 disabled:cursor-wait disabled:opacity-70`}><span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[#0B57D0] shadow-sm">{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : attachmentCount ? <Plus className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}</span>{uploading ? <span>Uploading documents…</span> : attachmentCount ? <span className="flex min-w-0 flex-col gap-0.5"><span>Supporting documents <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] text-[#0B57D0]">Optional</span></span><span className="text-xs font-normal leading-5 text-slate-500">Add context only if it strengthens your case.</span></span> : <span className="flex min-w-0 flex-col gap-0.5"><span>Add your resume</span><span className="text-xs font-normal leading-5 text-slate-500">You will sign in only when you send.</span></span>}</button></div>;

  const sendButton = <button type="button" disabled={!attachmentCount || uploading || submitting} onClick={() => { if (!isSignedIn) submitAfterSignInRef.current = true; else void send(); }} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0847AD] disabled:opacity-40">{submitting ? "Sending private request…" : "Send private referral request"} <Send className="h-4 w-4" /></button>;

  return <Shell tokens={tokens} label="tokens available">
    <section className="mt-14 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Supporting documents</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-.05em]">Add your resume.</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">A resume is required. Supporting documents are optional.</p>
      <div className="mt-7 space-y-3">{attachments.map(attachment => <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#0B57D0]"><FileText className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{attachment.fileName}</p><p className="text-xs text-slate-500">{Math.max(1, Math.round(attachment.fileSize / 1024))} KB</p></div></div><button type="button" onClick={() => removeAttachment(attachment.id)} className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-slate-700" aria-label={`Remove ${attachment.fileName}`}><X className="h-4 w-4" /></button></div>)}{pendingFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#0B57D0]"><FileText className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{file.name}</p><p className="text-xs text-slate-500">{Math.max(1, Math.round(file.size / 1024))} KB · ready to upload securely</p></div></div><button type="button" onClick={() => removePendingFile(index)} className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-slate-700" aria-label={`Remove ${file.name}`}><X className="h-4 w-4" /></button></div>)}</div>
      {resumePicker}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Application tokens</p><p className="mt-1 text-sm font-semibold text-slate-900">{tokens} available · {TOKEN_ACTION_COST} token per request</p></div><Link href="/premium" className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-[#0B57D0]">Add tokens · $1 each</Link></div>
      {!canSpendToken(tokens) && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-950">You’re out of application tokens.</p><p className="mt-1 text-sm leading-5 text-amber-800">Add one token for $1, then return here to send this request privately.</p><Link href="/premium" className="mt-3 inline-flex rounded-lg bg-[#0B57D0] px-3 py-2 text-xs font-semibold text-white">Add 1 token · $1</Link></div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>PDF, DOC, DOCX, PNG, or JPG · Up to 10 MB each</span><span>{TOKEN_ACTION_COST} token is used when you send</span></div>
      {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {canSpendToken(tokens) ? (isSignedIn ? sendButton : <SignInButton mode="modal">{sendButton}</SignInButton>) : <Link href="/premium" className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0847AD]">Add token to continue · $1 <ChevronRight className="h-4 w-4" /></Link>}
    </section>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><Status title="Role" body="Matched privately from your Target Role URL." /><Status title="Resume" body="Visible only after a verified employee claims." /><Status title="Introduction" body="Written by the employee who chooses to help." /></div>
  </Shell>;
}
