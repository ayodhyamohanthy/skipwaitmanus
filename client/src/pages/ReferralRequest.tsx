import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Paperclip, Plus, Share2, Sparkles, UsersRound, X } from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { canSpendToken, getJobSeekerTokens, setJobSeekerTokens, TOKEN_ACTION_COST } from "@/lib/tokens";
import { clearReferralDraft } from "@/lib/pwaContinuity";
import { SeekerCreditsCard } from "@/components/SeekerCreditsCard";
import { clearPendingResumeFiles, restorePendingResumeFiles, savePendingResumeFiles } from "@/lib/pendingResume";
import { readApiJson } from "@/lib/apiResponse";

type Attachment = { id: string; fileName: string; mimeType: string; fileSize: number; key: string; url: string };
type CreditSummary = { plan: "free" | "pro" | "max"; monthlyAllowance: number; monthlyCreditsRemaining: number; purchasedCreditsRemaining: number; totalAvailable: number; cycleKey: string; subscriptionStatus: string | null; subscriptionCurrentTermEnd: string | null };
type ReferralSubmissionResponse = { error?: string; creditSummary?: unknown; remainingTokens?: unknown; coverageStatus?: string; coverageInviteCode?: string | null; companyDomain?: string; lifetimeRequestCount?: number };

const acceptedDocuments = ".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg";
const pendingResumeSubmissionKey = "skipwait-pending-resume-submit";
const referralIdempotencyKey = "skipwait-referral-idempotency-key";
function getReferralIdempotencyKey() { const existing=sessionStorage.getItem(referralIdempotencyKey); if(existing)return existing; const created=crypto.randomUUID(); sessionStorage.setItem(referralIdempotencyKey,created); return created; }
const FREE_MONTHLY_ALLOWANCE = 3;
const UPLOAD_REQUEST_TIMEOUT_MS = 30_000;
const activeResumeUploads = new Map<string, Promise<Attachment>>();
const documentMimeByExtension: Record<string, string> = { ".pdf": "application/pdf", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

function acceptedDocumentMime(file: File) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase(); const expectedMimeType = documentMimeByExtension[extension];
  if (!expectedMimeType) return null;
  return expectedMimeType;
}
function bytesToBase64(bytes: Uint8Array) { let output = ""; for (let index = 0; index < bytes.length; index += 1) output += String.fromCharCode(bytes[index] || 0); return btoa(output); }
async function encryptResumeForTransport(file: Blob) {
  if (!crypto?.subtle) throw new Error("Your browser cannot securely prepare this resume upload. Please update it and try again.");
  const key = crypto.getRandomValues(new Uint8Array(32)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const source = new Uint8Array(await file.arrayBuffer()); const plaintext = new Uint8Array(source.length); plaintext.set(source);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plaintext);
  return { encryptedContent: bytesToBase64(new Uint8Array(encrypted)), encryptionKey: bytesToBase64(key), initializationVector: bytesToBase64(iv) };
}
async function uploadFetch(path: string, init: RequestInit, timeoutMessage: string) {
  const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), UPLOAD_REQUEST_TIMEOUT_MS);
  try { return await fetch(path, { ...init, signal: controller.signal }); }
  catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw new Error(timeoutMessage); throw error; }
  finally { window.clearTimeout(timeout); }
}

const fileFingerprint = (file: File) => `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
function dedupeFiles(files: File[]) { const seen=new Set<string>(); return files.filter(file=>{const key=fileFingerprint(file);if(seen.has(key))return false;seen.add(key);return true;}); }

function getSavedAttachments(): Attachment[] { try { return JSON.parse(localStorage.getItem("bridge-seeker-attachments") || "[]") as Attachment[]; } catch { return []; } }
function fallbackSummary(total: number): CreditSummary { const safe = Math.max(0, total); return { plan: "free", monthlyAllowance: FREE_MONTHLY_ALLOWANCE, monthlyCreditsRemaining: Math.min(safe, FREE_MONTHLY_ALLOWANCE), purchasedCreditsRemaining: Math.max(0, safe - FREE_MONTHLY_ALLOWANCE), totalAvailable: safe, cycleKey: "", subscriptionStatus: null, subscriptionCurrentTermEnd: null }; }
function isCreditSummary(value: unknown): value is CreditSummary { if (!value || typeof value !== "object") return false; const candidate = value as Partial<CreditSummary>; return (candidate.plan === "free" || candidate.plan === "pro" || candidate.plan === "max") && typeof candidate.monthlyAllowance === "number" && typeof candidate.monthlyCreditsRemaining === "number" && typeof candidate.purchasedCreditsRemaining === "number" && typeof candidate.totalAvailable === "number"; }

function Shell({ children, tokens, label }: { children: React.ReactNode; tokens: number; label: string }) {
  return (
    <main data-skipwait-screen="request" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black">
      <div className="mx-auto flex h-full max-w-xl flex-col">
        <header className="flex h-10 shrink-0 items-center justify-between gap-3">
          <Link href="/start" className="inline-flex items-center gap-1 text-sm font-bold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link>
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

  return <Shell tokens={summary.totalAvailable} label="credits left"><section className="flex min-h-0 flex-1 flex-col"><div className="flex flex-1 flex-col justify-center"><span data-referral-success="true" className="referral-success-mark grid h-12 w-12 place-items-center rounded-xl bg-[#15803d]/10 text-[#15803d]"><CheckCircle2 className="h-6 w-6" /></span><h1 className="font-display mt-6 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">Your request is with verified employees.</h1><p className="mt-4 text-sm leading-6 text-[#505050]">Eligible employees at <strong>{companyDomain}</strong> were notified privately. Their identity stays hidden unless someone claims your request.</p>{lifetimeRequestCount ? <p aria-label="Referral request milestone" className="mt-4 text-sm font-semibold text-[#15803d]">Your {ordinal(lifetimeRequestCount)} referral request is now active.</p> : null}<section aria-label="What happens next" className="mt-5 rounded-xl border border-[#e5e5e5] bg-white p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#505050]">What happens next</p><div className="mt-4 space-y-4"><NextStep number="01" title="Verified employees review" body={`Employees at ${companyDomain} see your request privately. Identity stays hidden.`} /><NextStep number="02" title="Get claimed" body="When an employee accepts, your request moves to Claimed and you can chat privately." /><NextStep number="03" title="Track everything" body="Follow status and messages any time in My requests." /></div></section><SeekerCreditsCard credits={{
          plan: summary.plan,
          monthlyAllowance: summary.monthlyAllowance,
          monthlyCreditsRemaining: summary.monthlyCreditsRemaining,
          purchasedCreditsRemaining: summary.purchasedCreditsRemaining,
          totalAvailable: summary.totalAvailable,
          cycleKey: summary.cycleKey,
          subscriptionStatus: summary.subscriptionStatus ?? null,
          subscriptionCurrentTermEnd: summary.subscriptionCurrentTermEnd ?? null,
        }} /></div><footer className="shrink-0 border-t border-[#e5e5e5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">{exhausted ? <><p role="status" className="mb-3 text-center text-sm font-semibold text-black">You have used all available referral credits.</p><Link href="/premium?role=job_seeker" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-semibold text-white">Add credits <ArrowRight className="h-4 w-4" /></Link></> : <><Link href="/share" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-semibold text-white">Share your invite link <Share2 className="h-4 w-4" /></Link><Link href="/requests" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-5 py-3.5 text-sm font-semibold text-black">Track my request <ArrowRight className="h-4 w-4" /></Link></>}</footer></section></Shell>;
}

function NextStep({ number, title, body }: { number: string; title: string; body: string }) { return <div className="flex gap-3"><span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ededff] text-xs font-bold text-black">{number}</span><div><p className="text-sm font-semibold text-black">{title}</p><p className="mt-1 text-sm leading-6 text-[#505050]">{body}</p></div></div>; }

export default function ReferralRequest() {
  const [tokens, setTokens] = useState(getJobSeekerTokens);
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingFilesRestored, setPendingFilesRestored] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number; status: string } | null>(null);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [companyDomain, setCompanyDomain] = useState("");
  const [coveragePending, setCoveragePending] = useState(false);
  const [coverageInviteCode, setCoverageInviteCode] = useState("");
  const [coverageInviteStatus, setCoverageInviteStatus] = useState("");
  const [lifetimeRequestCount, setLifetimeRequestCount] = useState<number | null>(null);
  const [compensation, setCompensation] = useState(() => localStorage.getItem("bridge-target-compensation") || "");
  const [candidateMessage, setCandidateMessage] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [smartPitchLoading, setSmartPitchLoading] = useState(false);
  const [smartPitchStatus, setSmartPitchStatus] = useState("");
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const uploadIdsRef = useRef(new Map<string, string>());
  const attachmentCount = attachments.length + pendingFiles.length;
  const summary = creditSummary ?? fallbackSummary(tokens);

  useEffect(() => {
    if (!isSignedIn) {
      // A previous user's private draft may remain on this browser. Keep both
      // its filename metadata and bytes invisible until a session is verified.
      setAttachments([]);
      setPendingFilesRestored(false);
      return;
    }
    let active = true;
    setAttachments(getSavedAttachments());
    void restorePendingResumeFiles().then(files => { if (active) setPendingFiles(current => dedupeFiles(current.length ? current : files)); }).catch(() => undefined).finally(() => { if (active) setPendingFilesRestored(true); });
    return () => { active = false; };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const sessionToken = await getToken();
        const response = await fetch("/api/credits/summary?role=job_seeker", { credentials: "include", headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {} });
        const payload = await readApiJson<{ summary?: unknown }>(response, "We could not refresh your referral credits");
        if (active && response.ok && isCreditSummary(payload.summary)) { setCreditSummary(payload.summary); setTokens(payload.summary.totalAvailable); setJobSeekerTokens(payload.summary.totalAvailable); }
      } catch { /* The request path retains the locally cached balance while the summary refreshes later. */ }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return [] as Attachment[];
    setUploading(true); setError("");
    try {
      const sessionToken = await getToken();
      const headers = { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) };
      const uploadOne = (file: File) => {
        const fingerprint = fileFingerprint(file);
        const existing = activeResumeUploads.get(fingerprint); if (existing) return existing;
        // Register the shared promise synchronously before hashing or any other
        // await. A second change/input dispatch in the same tick must see it.
        let resolveUpload!: (attachment: Attachment) => void; let rejectUpload!: (reason: unknown) => void;
        const guarded = new Promise<Attachment>((resolve, reject) => { resolveUpload = resolve; rejectUpload = reject; });
        activeResumeUploads.set(fingerprint, guarded);
        void (async () => {
          try {
          const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))).map(byte => byte.toString(16).padStart(2, "0")).join("");
          const clientUploadId = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
          uploadIdsRef.current.set(fingerprint, clientUploadId);
          const mimeType = acceptedDocumentMime(file); if (!mimeType) throw new Error("Use a PDF, Word document, PNG, or JPEG resume");
          const startResponse = await uploadFetch("/api/documents/uploads", { method: "POST", headers, credentials: "include", body: JSON.stringify({ clientUploadId, fileName: file.name, mimeType, fileSize: file.size }) }, "Your resume upload took too long to start. Check your connection and try again.");
          const start = await readApiJson<{ sessionId?: string; chunkBytes?: number; error?: string }>(startResponse, "We could not prepare your private resume upload. Please try again."); if (!startResponse.ok || !start.sessionId || !start.chunkBytes) throw new Error(start.error || "We could not prepare your private resume upload. Please try again.");
          const totalChunks = Math.ceil(file.size / start.chunkBytes); setUploadProgress({ completed: 0, total: totalChunks, status: "Preparing your private resume…" });
          for (let byteOffset = 0, chunkIndex = 0; byteOffset < file.size; byteOffset += start.chunkBytes, chunkIndex += 1) {
            const encrypted = await encryptResumeForTransport(file.slice(byteOffset, Math.min(file.size, byteOffset + start.chunkBytes)));
            const chunkResponse = await uploadFetch(`/api/documents/uploads/${start.sessionId}/chunks`, { method: "POST", headers, credentials: "include", body: JSON.stringify({ chunkIndex, ...encrypted }) }, "Your resume upload paused for too long. Check your connection and try again.");
            const progress = await readApiJson<{ error?: string }>(chunkResponse, "We could not save part of your resume. Please try again."); if (!chunkResponse.ok) throw new Error(progress.error || "We could not save part of your resume. Please try again.");
            setUploadProgress({ completed: chunkIndex + 1, total: totalChunks, status: "Uploading your private resume…" });
          }
          setUploadProgress({ completed: totalChunks, total: totalChunks, status: "Checking your resume securely…" });
          const completeResponse = await uploadFetch(`/api/documents/uploads/${start.sessionId}/complete`, { method: "POST", headers, credentials: "include" }, "We could not finish checking your resume in time. Please try again.");
          const payload = await readApiJson<Attachment & { error?: string }>(completeResponse, "We could not verify your uploaded resume. Please try again."); if (!completeResponse.ok) throw new Error(payload.error || "We could not verify your uploaded resume. Please try again."); resolveUpload(payload);
          } catch (reason) { activeResumeUploads.delete(fingerprint); rejectUpload(reason); }
        })();
        return guarded;
      };
      const uploaded = await Promise.all(files.map(uploadOne));
      const canonicalUploaded = uploaded.filter((item, index, all) => all.findIndex(candidate => candidate.id === item.id) === index);
      setAttachments(current => { const known = new Set(current.map(item => item.id)); const additions = canonicalUploaded.filter(item => { if (known.has(item.id)) return false; known.add(item.id); return true; }); const next = [...current, ...additions]; localStorage.setItem("bridge-seeker-attachments", JSON.stringify(next)); return next; });
      return canonicalUploaded;
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Upload failed"); throw uploadError; } finally { setUploading(false); setUploadProgress(null); }
  };
  const selectFiles = (files: FileList | null) => {
    const selected = Array.from(files || []); if (!selected.length) return; const unsupported = selected.find(file => !acceptedDocumentMime(file)); if (unsupported) { setError("Use a PDF, Word document, PNG, or JPEG resume."); return; } setError("");
    if (isSignedIn) {
      // A transient upload failure (offline, server hiccup) must not discard
      // the selection: keep the files pending so sending retries the upload.
      void uploadFiles(selected).catch(() => {
        setPendingFiles(current => { const next = dedupeFiles([...current, ...selected]); void savePendingResumeFiles(next).catch(() => undefined); return next; });
      });
      return;
    }
    setPendingFiles(current => { const next = dedupeFiles([...current, ...selected]); void savePendingResumeFiles(next).catch(() => undefined); return next; });
  };
  const createSmartPitch = async () => {
    const attachment = attachments[0]; const targetRoleUrl = localStorage.getItem("bridge-target-url");
    if (!attachment || !targetRoleUrl || smartPitchLoading) return;
    setSmartPitchLoading(true); setSmartPitchStatus(""); setError("");
    try {
      const sessionToken = await getToken();
      const response = await fetch("/api/smart-pitch", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) }, body: JSON.stringify({ attachmentId: Number(attachment.id), targetRoleUrl }) });
      const payload = await readApiJson<{ draft?: string; error?: string }>(response, "We could not create a starting draft");
      if (!response.ok || !payload.draft) throw new Error(payload.error || "We could not create a starting draft");
      setCandidateMessage(payload.draft); setNoteOpen(true); setSmartPitchStatus("Starting draft ready. Edit anything before sending.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not create a starting draft"); }
    finally { setSmartPitchLoading(false); }
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
      const sessionToken = await getToken();
      const referralParams = new URLSearchParams(window.location.search); const fastTrackCode = referralParams.get("fast")?.trim(); const fastTrackCompanySlug = referralParams.get("referCompany")?.trim(); const fastTrackAlias = referralParams.get("referAlias")?.trim();
      const response = await fetch("/api/company-referrals", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": getReferralIdempotencyKey(), ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) }, credentials: "include", body: JSON.stringify({ targetRoleUrl, attachmentIds: allAttachments.map(attachment => Number(attachment.id)).filter(Number.isInteger), candidateMessage: candidateMessage.trim(), confirmedCompanyDomain: (() => { try { const bound=JSON.parse(localStorage.getItem("bridge-company-confirmation")||"{}"); return bound.canonicalUrl===targetRoleUrl?bound.confirmedDomain||undefined:undefined; } catch { return undefined; } })(), ...(compensation ? { compensation } : {}), ...(fastTrackCode ? { fastTrackCode } : {}), ...(fastTrackCompanySlug && fastTrackAlias ? { fastTrackCompanySlug, fastTrackAlias } : {}) }) });
      const payload = await readApiJson<ReferralSubmissionResponse>(response, "We could not send this private referral request"); if (!response.ok) throw new Error(payload.error || "We could not send this private referral request");
      const nextSummary = isCreditSummary(payload.creditSummary) ? payload.creditSummary : fallbackSummary(Number.isFinite(Number(payload.remainingTokens)) ? Number(payload.remainingTokens) : Math.max(0, summary.totalAvailable - TOKEN_ACTION_COST));
      setCreditSummary(nextSummary); setTokens(nextSummary.totalAvailable); setJobSeekerTokens(nextSummary.totalAvailable);
      setPendingFiles([]); void clearPendingResumeFiles().catch(() => undefined); sessionStorage.removeItem(pendingResumeSubmissionKey);
      setCoveragePending(payload.coverageStatus === "waiting_for_company_coverage");
      setCoverageInviteCode(typeof payload.coverageInviteCode === "string" ? payload.coverageInviteCode : "");
      setCompanyDomain(payload.companyDomain || "the target company"); setLifetimeRequestCount(typeof payload.lifetimeRequestCount === "number" && Number.isInteger(payload.lifetimeRequestCount) && payload.lifetimeRequestCount > 0 ? payload.lifetimeRequestCount : null); clearReferralDraft(); localStorage.removeItem("bridge-target-compensation"); setCompensation(""); localStorage.setItem("bridge-request-sent", "true"); sessionStorage.removeItem(referralIdempotencyKey); setSubmitted(true);
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
      return <Shell tokens={summary.totalAvailable} label="credits available"><section data-skipwait-coverage-invite="true" className="flex min-h-0 flex-1 flex-col"><div className="flex flex-1 flex-col items-center justify-center"><span className="grid h-16 w-16 place-items-center rounded-3xl bg-[#ededff] text-black"><UsersRound className="h-7 w-7" /></span><p className="mt-5 text-center text-sm font-semibold text-black">Your request is queued for {companyDomain}.</p><p className="mt-1 text-center text-xs leading-5 text-[#505050]">1 credit used · We’ll follow up as coverage grows.</p></div>{coverageInviteStatus && <p role="status" className="sr-only">{coverageInviteStatus}</p>}<footer className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><button type="button" aria-label={`Invite one employee at ${companyDomain}`} onClick={() => { void inviteEmployee(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-semibold text-white"><Share2 className="h-4 w-4" />Invite at {companyDomain}</button></footer></section></Shell>;
    }
    const used = Math.max(0, summary.monthlyAllowance - summary.monthlyCreditsRemaining);
    const exhausted = summary.totalAvailable === 0;
    const isFree = summary.plan === "free";
    return <Shell tokens={summary.totalAvailable} label="credits left"><section className="flex min-h-0 flex-1 flex-col"><div className="flex flex-1 flex-col justify-center"><span className="grid h-12 w-12 place-items-center rounded-xl bg-[#15803d]/10 text-[#15803d]"><CheckCircle2 className="h-6 w-6" /></span><h1 className="font-display mt-3 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">Your request is with verified employees.</h1><p className="mt-4 text-sm leading-6 text-[#505050]">Eligible employees at <strong>{companyDomain}</strong> were notified privately. Their identity stays hidden unless someone claims your request.</p><section aria-label="Referral credits" className="mt-5 rounded-xl border border-[#c2c2ff] bg-[#ededff] p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[.12em] text-black">{isFree ? "Free plan" : `${summary.plan} plan`}</p><p className="text-sm font-bold text-black">{summary.monthlyCreditsRemaining} this month</p></div><div role="progressbar" aria-label="Monthly referral credits used" aria-valuemin={0} aria-valuemax={summary.monthlyAllowance} aria-valuenow={used} className="mt-3 h-2 overflow-hidden rounded-full bg-[#e0e0ff]"><span className="block h-full rounded-full bg-[#0000ff]" style={{ width: `${summary.monthlyAllowance ? (used / summary.monthlyAllowance) * 100 : 0}%` }} /></div><p className="mt-3 text-sm leading-5 text-black">{isFree ? `${used} of ${summary.monthlyAllowance} free credits used this month.` : `${used} of ${summary.monthlyAllowance} monthly credits used.`}{summary.purchasedCreditsRemaining > 0 ? ` ${summary.purchasedCreditsRemaining} credit${summary.purchasedCreditsRemaining === 1 ? "" : "s"} from your pack remain.` : ""}</p></section></div><footer className="shrink-0 border-t border-[#e5e5e5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">{exhausted ? <><p role="status" className="mb-3 text-center text-sm font-semibold text-black">You have used all available referral credits.</p><Link href="/premium?role=job_seeker" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-semibold text-white">Add credits <ArrowRight className="h-4 w-4" /></Link><Link href="/plans?role=job_seeker" className="mt-3 block text-center text-sm font-semibold text-black">Compare Pro and Max</Link></> : <Link href="/start" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-semibold text-white">Request another referral <ArrowRight className="h-4 w-4" /></Link>}<Link href="/requests" className="mt-3 block text-center text-sm font-semibold text-[#505050]">View my request</Link></footer></section></Shell>;
  }

  const resumePicker = <div className="mt-4"><input ref={resumeInputRef} type="file" multiple accept={acceptedDocuments} className="sr-only" disabled={uploading} onChange={event => { selectFiles(event.target.files); event.currentTarget.value = ""; }} /><button type="button" onClick={() => resumeInputRef.current?.click()} disabled={uploading} className={`flex w-full items-center gap-3 rounded-xl border ${attachmentCount ? "border-dashed border-[#0000ff] bg-[#ededff]/40" : "border-dashed border-[#cfcfcf] bg-white"} p-4 text-left text-sm font-semibold text-black disabled:cursor-wait disabled:opacity-70`}><span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-black shadow-sm">{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : attachmentCount ? <Plus className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}</span>{uploading ? <span className="flex min-w-0 flex-col gap-0.5"><span>{uploadProgress?.status || "Uploading your private resume…"}</span><span role="status" className="text-xs font-normal leading-5 text-[#505050]">{uploadProgress ? `${uploadProgress.completed} of ${uploadProgress.total} secure parts complete` : "This can take a moment for large files."}</span></span> : attachmentCount ? <span className="flex min-w-0 flex-col gap-0.5"><span>Add supporting document <span className="ml-1 rounded-full bg-[#e0e0ff] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] text-black">Optional</span></span><span className="text-xs font-normal leading-5 text-[#505050]">Add context only if it strengthens your case.</span></span> : <span className="flex min-w-0 flex-col gap-0.5"><span>Add your resume</span><span className="text-xs font-normal leading-5 text-[#505050]">{isSignedIn ? "Only you and the assigned referrer can open it." : "You will sign in only when you send."}</span></span>}</button>{isSignedIn && attachments.length ? <button type="button" onClick={() => { void createSmartPitch(); }} disabled={smartPitchLoading || uploading} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#0000ff] bg-white px-3 py-2.5 text-sm font-bold text-black"><Sparkles className="h-4 w-4" />{smartPitchLoading ? "Creating your draft…" : candidateMessage ? "Refresh starting draft" : "Generate a starting draft"}</button> : null}{smartPitchStatus ? <p role="status" className="mt-2 text-xs font-semibold text-[#15803d]">{smartPitchStatus}</p> : null}{candidateMessage || noteOpen ? <label className="mt-3 block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#505050]">{candidateMessage ? "Your editable draft" : "Note for the Referrer"}</span><textarea value={candidateMessage} onChange={event => setCandidateMessage(event.target.value.slice(0, 2000))} maxLength={2000} placeholder={candidateMessage ? "" : "A short reason you are a strong fit."} rows={3} className="mt-2 w-full resize-none rounded-xl border border-[#e5e5e5] bg-white p-3 text-sm leading-5 text-black outline-none ring-[#0000ff] focus:ring-2" /></label> : attachments.length ? <button type="button" onClick={() => setNoteOpen(true)} className="mt-3 text-sm font-semibold text-black">Add a note for the Referrer <span className="text-[#505050]">(optional)</span></button> : null}</div>;
  const visibleAttachments = attachments.slice(0, 2);
  const visiblePendingFiles = pendingFiles.slice(0, Math.max(0, 2 - visibleAttachments.length));
  const primaryRequestAction = !attachmentCount ? "Add your resume" : !isSignedIn ? "Sign in & send private request" : "Send private referral request";
  return <Shell tokens={summary.totalAvailable} label="credits available"><section className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 flex flex-col justify-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-black">Step 2 of 3 · Required</p><h1 className="font-display mt-3 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">Add your resume.</h1><p className="mt-4 text-sm leading-6 text-[#505050]">This is the only document needed to send your private request.</p>{compensation ? <p className="mt-4 text-sm leading-6 text-[#505050]">Compensation: {compensation}</p> : null}<div className="mt-6 space-y-2">{visibleAttachments.map(attachment => <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e5e5] bg-white p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ededff] text-xs font-bold text-black">DOC</span><p className="truncate text-sm font-semibold text-black">{attachment.fileName}</p></div><button type="button" onClick={() => removeAttachment(attachment.id)} className="rounded-lg p-2 text-lg leading-none text-[#505050]" aria-label={`Remove ${attachment.fileName}`}><X className="h-4 w-4" /></button></div>)}{visiblePendingFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-[#c2c2ff] bg-[#ededff]/40 p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-black">DOC</span><p className="truncate text-sm font-semibold text-black">{file.name}</p></div><button type="button" onClick={() => removePendingFile(index)} className="rounded-lg p-2 text-lg leading-none text-[#505050]" aria-label={`Remove ${file.name}`}><X className="h-4 w-4" /></button></div>)}{attachmentCount > 2 && <p className="px-1 text-xs font-medium text-[#505050]">+ {attachmentCount - 2} more document{attachmentCount - 2 === 1 ? "" : "s"} attached</p>}</div>{resumePicker}{error && <p className="mt-3 rounded-lg bg-[#b91c1c]/10 p-3 text-sm text-[#B91C1C]">{error}</p>}</div><footer className="shrink-0 border-t border-[#e5e5e5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">{isSignedIn && creditSummary && <p className="mb-3 text-xs leading-5 text-[#505050]"><strong className="text-black">{creditSummary.monthlyCreditsRemaining} of {creditSummary.monthlyAllowance} free monthly credits left</strong> — sending this request uses one.{creditSummary.purchasedCreditsRemaining ? ` ${creditSummary.purchasedCreditsRemaining} pack credit${creditSummary.purchasedCreditsRemaining === 1 ? "" : "s"} reserved for later.` : ""}</p>}{canSpendToken(summary.totalAvailable) ? <button type="button" disabled={uploading || submitting} onClick={() => { void handleSend(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0000cc]">{submitting ? "Sending private request…" : primaryRequestAction} <ArrowRight className="h-4 w-4" /></button> : <><p role="status" className="mb-3 text-center text-sm font-semibold text-black">You have used all available referral credits.</p><Link href="/premium?role=job_seeker" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-semibold text-white">Add credits <ArrowRight className="h-4 w-4" /></Link><Link href="/plans?role=job_seeker" className="mt-3 block text-center text-sm font-semibold text-black">Or compare Pro and Max</Link></>}</footer></section></Shell>;
}
