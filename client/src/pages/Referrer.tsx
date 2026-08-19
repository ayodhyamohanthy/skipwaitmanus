import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth as useClerkAuth } from "@clerk/react";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Download, ExternalLink, FileText, Send, XCircle } from "lucide-react";
import { WorkEmailSignIn, coverageInviteSessionKey } from "@/components/WorkEmailSignIn";
import { ZeroActivityShareCard } from "@/components/ZeroActivityShareCard";
import { AccountMenu } from "@/components/AccountMenu";

type Attachment = { id: string; fileName: string; mimeType: string; fileSize: number; key: string; url: string };
type CompanyInboxItem = { id: number; targetRoleUrl: string; companyDomain: string; createdAt: string; attachmentCount: number };
type ClaimedCompanyRequest = { id: number; targetRoleUrl: string; companyDomain: string; candidateName: string | null; attachments: Attachment[] };

function ReferrerFlowHeader({ backHref = "/", right }: { backHref?: string; right?: React.ReactNode }) {
  return <header className="flex h-10 shrink-0 items-center justify-between gap-3"><Link href={backHref} className="inline-flex items-center gap-1 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</Link>{right ? <div className="shrink-0">{right}</div> : <AccountMenu />}</header>;
}

export default function Referrer() {
  const [, go] = useLocation();
  const { isSignedIn, getToken, signOut } = useClerkAuth();
  const inviteCompany = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("company")?.trim().toLowerCase() || "";
  const inviteCode = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("invite")?.trim() || "";
  const claimedRequestId = typeof window === "undefined" ? 0 : Number(new URLSearchParams(window.location.search).get("request"));
  const returnTo = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("returnTo") || "";
  const safeReturnTo = returnTo === "/post-opportunity" ? returnTo : "";
  const employeeSignInEmail = typeof window === "undefined" ? "" : window.sessionStorage.getItem("skipwait:employee-sign-in-email")?.trim().toLowerCase() || "";
  const [decision, setDecision] = useState<"" | "approved" | "declined">("");
  const [deciding, setDeciding] = useState(false);
  const [message, setMessage] = useState("");
  const [activeDocument, setActiveDocument] = useState(0);
  const [inbox, setInbox] = useState<CompanyInboxItem[]>([]);
  const [inboxReady, setInboxReady] = useState(false);
  const [claimedRequest, setClaimedRequest] = useState<ClaimedCompanyRequest | null>(null);
  const [inboxError, setInboxError] = useState("");
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [workEmailError, setWorkEmailError] = useState("");
  const [coverageRewardMessage, setCoverageRewardMessage] = useState("");
  const [employeeEnrollmentReady, setEmployeeEnrollmentReady] = useState(false);
  const [showWorkEmailEnrollment, setShowWorkEmailEnrollment] = useState(true);
  const attachments = claimedRequest?.attachments ?? [];
  const document = attachments[activeDocument];
  const previewable = Boolean(document && (document.mimeType === "application/pdf" || document.mimeType.startsWith("image/")));
  const candidate = claimedRequest?.candidateName || "Candidate";

  const companyFetch = async (path: string, init?: RequestInit) => {
    const token = await getToken();
    const response = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: "include" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "We could not complete that private company request");
    return payload;
  };

  useEffect(() => {
    if (!isSignedIn) { setEmployeeEnrollmentReady(false); return; }
    if (!employeeSignInEmail) { setEmployeeEnrollmentReady(true); return; }
    let active = true;
    const savedInviteCode = typeof window === "undefined" ? "" : window.sessionStorage.getItem(coverageInviteSessionKey) || "";
    setEmployeeEnrollmentReady(false);
    void companyFetch("/api/company-referrals/verify-work-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: employeeSignInEmail, inviteCode: savedInviteCode || undefined }) }).then(payload => {
      if (!active) return;
      if (payload.reward?.rewarded) setCoverageRewardMessage("Welcome credit added. You and the person who invited you each received one referral credit.");
      if (savedInviteCode) window.sessionStorage.removeItem(coverageInviteSessionKey);
      setShowWorkEmailEnrollment(false); setWorkEmailError("");
    }).catch(error => { if (active) setWorkEmailError(error instanceof Error ? error.message : "We could not confirm this company email for private referral access."); }).finally(() => { if (active) setEmployeeEnrollmentReady(true); });
    return () => { active = false; };
  }, [isSignedIn, employeeSignInEmail]);

  useEffect(() => {
    if (!isSignedIn || claimedRequest || !employeeEnrollmentReady) return;
    let active = true;
    const path = Number.isInteger(claimedRequestId) && claimedRequestId > 0 ? `/api/company-referrals/${claimedRequestId}` : "/api/company-referrals/inbox";
    void companyFetch(path).then(payload => {
      if (!active) return;
      if (claimedRequestId > 0) { setClaimedRequest(payload.request); setActiveDocument(0); }
      else setInbox(payload.requests || []);
    }).catch(() => { if (active) setInboxError(claimedRequestId > 0 ? "This private request is not available to your verified employee account." : "Verify your work email to view private company requests."); }).finally(() => { if (active) setInboxReady(true); });
    return () => { active = false; };
  }, [isSignedIn, claimedRequest, claimedRequestId, employeeEnrollmentReady]);

  useEffect(() => { if (isSignedIn && inboxReady && !claimedRequest && !showWorkEmailEnrollment && !claimedRequestId) go(safeReturnTo || "/inbox"); }, [claimedRequest, claimedRequestId, go, inboxReady, isSignedIn, safeReturnTo, showWorkEmailEnrollment]);

  const decide = async (approved: boolean) => {
    if (!claimedRequest || deciding) return;
    setDeciding(true); setInboxError("");
    try {
      await companyFetch(`/api/company-referrals/${claimedRequest.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: approved ? "approved" : "declined", message: message.trim() || undefined }) });
      setDecision(approved ? "approved" : "declined");
    } catch (error) { setInboxError(error instanceof Error ? error.message : "We could not record this referral decision"); }
    finally { setDeciding(false); }
  };
  const switchToWorkEmail = async () => { setWorkEmailError(""); try { await signOut?.(); } catch { setWorkEmailError("We could not switch accounts. Try signing out from the account menu, then use your company email."); } };
  const claim = async (requestId: number) => { setClaimingId(requestId); setInboxError(""); try { await companyFetch(`/api/company-referrals/${requestId}/claim`, { method: "POST" }); go(`/referrer?request=${requestId}`); } catch (error) { setInboxError(error instanceof Error ? error.message : "This request is no longer available"); } finally { setClaimingId(null); } };

  if (decision) return <main data-skipwait-screen="referrer-decision" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><ReferrerFlowHeader backHref="/inbox" /><section className="flex min-h-0 flex-1 flex-col justify-center"><span className={`grid h-12 w-12 place-items-center rounded-xl ${decision === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{decision === "approved" ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}</span><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Referral decision recorded</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">{decision === "approved" ? "Referral approved." : "Request declined."}</h1><p className="mt-4 text-sm leading-6 text-slate-600">{decision === "approved" ? "You can now continue privately with this Job Seeker." : "The Job Seeker will receive your update privately."}</p></section><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">{decision === "approved" && claimedRequest ? <button type="button" onClick={() => go(`/conversation/${claimedRequest.id}?from=inbox`)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-bold text-white">Message Job Seeker <ArrowRight className="h-4 w-4" /></button> : null}<Link href="/inbox" className={`${decision === "approved" ? "mt-3 " : ""}block text-center text-sm font-semibold text-slate-600`}>Return to My Company Inbox</Link></footer></div></main>;

  if (!isSignedIn) return <main data-skipwait-screen="referrer-sign-in" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><ReferrerFlowHeader /><section className="flex min-h-0 flex-1 items-center py-3"><div className={inviteCompany ? "w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" : "w-full"}>{inviteCompany ? <><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#0B57D0]">Private company coverage</p><h1 className="mt-2 text-[1.85rem] font-semibold leading-[1.04] tracking-[-.045em]">Help {inviteCompany} cover referrals privately.</h1></> : <><span aria-hidden="true" className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-3xl bg-blue-50 text-[#0B57D0]"><ClipboardCheck className="h-6 w-6" /></span><div className="mb-5"><h1 className="text-center text-[1.85rem] font-semibold leading-[1.04] tracking-[-.045em] text-slate-950">Verify your work email</h1><p className="mt-2 text-center text-sm leading-5 text-slate-600">Personal emails aren’t accepted.</p></div></>}<WorkEmailSignIn inviteCode={inviteCode || undefined} compact={!inviteCompany} /></div></section></div></main>;

  if (!inboxReady) return <main data-skipwait-screen="referrer-loading" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><ReferrerFlowHeader backHref="/" /><section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Verified employee inbox</p><h1 className="mt-3 text-2xl font-semibold">Loading your private company requests…</h1></section></div></main>;

  if (!claimedRequest && inbox.length === 0 && !showWorkEmailEnrollment) return <EmptyCompanyInbox />;

  if (!claimedRequest) return <main data-skipwait-screen="referrer-inbox" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><ReferrerFlowHeader backHref="/" /><section className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Verified employee inbox</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Private requests at your company.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Reviewing and responding are always free. Your identity stays hidden until you choose to help.</p>{coverageRewardMessage ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{coverageRewardMessage}</p> : null}{showWorkEmailEnrollment ? <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-semibold text-slate-900">Use your company email account.</p><p className="mt-1 text-xs leading-5 text-slate-600">Private Referrer access is a separate passwordless company-email sign-in. We never add that email to a personal account or send a code to another address.</p><button type="button" onClick={() => { void switchToWorkEmail(); }} className="mt-3 rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-semibold text-white">Continue with work email</button></div> : null}{workEmailError && !showWorkEmailEnrollment ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{workEmailError}</p> : null}{inboxError ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{inboxError}</p> : null}<div className="mt-6 space-y-3">{inbox.map(request => <article key={request.id} className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">{request.companyDomain} · {request.attachmentCount} document{request.attachmentCount === 1 ? "" : "s"}</p><a href={request.targetRoleUrl} target="_blank" rel="noreferrer" className="mt-2 block truncate text-sm font-semibold text-[#0B57D0]">{request.targetRoleUrl}</a><p className="mt-2 text-sm text-slate-600">Review the candidate’s note and resume before deciding whether you can help.</p><button type="button" onClick={() => { void claim(request.id); }} disabled={claimingId === request.id} className="mt-4 rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{claimingId === request.id ? "Opening review…" : "Review candidate"}</button></article>)}</div></section></div></main>;

  return <main data-skipwait-screen="referrer-review" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-5xl flex-col"><ReferrerFlowHeader backHref="/inbox" right={<span className="text-xs font-bold text-slate-600">Private review</span>} />{inboxError ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{inboxError}</p> : null}<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 lg:mt-4 lg:grid lg:grid-cols-[1.35fr_.65fr] lg:gap-6 lg:overflow-hidden"><section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:min-h-0 lg:overflow-y-auto"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Claimed private referral request</p><h1 className="mt-4 text-3xl font-semibold tracking-[-.04em]">{candidate} is requesting your referral</h1><a href={claimedRequest.targetRoleUrl} target="_blank" rel="noreferrer" className="mt-5 flex min-w-0 items-center gap-2 rounded-xl bg-blue-50 p-3 text-sm font-medium text-[#0B57D0]"><ExternalLink className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{claimedRequest.targetRoleUrl}</span></a><DocumentReview attachments={attachments} active={activeDocument} setActive={setActiveDocument} document={document} previewable={previewable} /></section><aside className="mt-4 rounded-xl bg-slate-900 p-5 text-white lg:mt-0 lg:min-h-0 lg:overflow-y-auto"><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-200">Your decision</p><h2 className="mt-3 text-2xl font-semibold tracking-[-.04em]">Reviewing is free.</h2><p className="mt-3 text-sm leading-6 text-slate-300">Approve only if you can genuinely help. You can send a private note after approval.</p><label className="mt-5 block"><span className="text-xs font-bold uppercase tracking-[.12em] text-slate-300">Note for the Job Seeker <span className="normal-case font-medium">(optional)</span></span><textarea value={message} onChange={event => setMessage(event.target.value.slice(0, 3000))} placeholder="A brief update, if helpful." className="mt-2 min-h-24 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-blue-300" /></label><button type="button" disabled={!attachments.length || deciding} onClick={() => { void decide(true); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-4 py-3 text-sm font-semibold hover:bg-[#0847AD] disabled:opacity-40">{deciding ? "Recording decision…" : "Approve referral"} <Send className="h-4 w-4" /></button><button type="button" disabled={deciding} onClick={() => { void decide(false); }} className="mt-3 w-full rounded-lg border border-white/20 px-4 py-3 text-sm font-semibold disabled:opacity-50">Decline respectfully</button></aside></div></div></main>;
}

function EmptyCompanyInbox() {
  return <main data-skipwait-screen="referrer-inbox-preview" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><ReferrerFlowHeader backHref="/" /><section className="flex flex-1 flex-col items-center justify-center"><article data-skipwait-empty-preview="referrer" aria-label="Illustrative future private request layout" className="w-full max-w-sm rounded-3xl border border-dashed border-blue-200 bg-white p-5"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-[#0B57D0]"><ClipboardCheck className="h-5 w-5" /></span><span className="h-2 w-16 rounded-full bg-slate-100" /></div><div className="mt-6 grid grid-cols-3 gap-3"><span className="grid h-12 place-items-center rounded-xl bg-slate-50 text-[#0B57D0]"><ClipboardCheck className="h-4 w-4" /></span><span className="grid h-12 place-items-center rounded-xl bg-slate-50 text-slate-500"><FileText className="h-4 w-4" /></span><span className="grid h-12 place-items-center rounded-xl bg-slate-50 text-emerald-700"><CheckCircle2 className="h-4 w-4" /></span></div></article><ZeroActivityShareCard audience="referrer" /></section></div></main>;
}

function DocumentReview({ attachments, active, setActive, document, previewable }: { attachments: Attachment[]; active: number; setActive: (value: number) => void; document?: Attachment; previewable: boolean }) {
  return <div className="mt-5 rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Candidate documents</p><p className="text-xs font-semibold text-[#0B57D0]">{attachments.length} attached</p></div>{attachments.length ? <><div className="mt-3 grid gap-2 sm:grid-cols-2">{attachments.map((attachment, index) => <button type="button" key={attachment.id} onClick={() => setActive(index)} className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition ${active === index ? "border-blue-200 bg-blue-50" : "border-slate-200 hover:border-blue-200"}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#0B57D0] shadow-sm"><FileText className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{attachment.fileName}</span><span className="block text-xs text-slate-500">{attachment.mimeType || "Document"}</span></span></button>)}</div>{document ? <><div className="mt-4 flex min-w-0 items-center justify-between gap-3"><p className="min-w-0 truncate text-sm font-semibold text-slate-800">Viewing {document.fileName}</p><a href={document.url} download={document.fileName} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><Download className="h-3.5 w-3.5" />Download</a></div>{previewable ? <iframe title={`Document preview for ${document.fileName}`} src={document.url} className="mt-4 h-[360px] w-full rounded-xl border border-slate-200 bg-slate-50" /> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">This file is available to download. PDF and image files can be viewed directly here.</p>}</> : null}</> : <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">A document is required before this request can be submitted.</p>}</div>;
}
