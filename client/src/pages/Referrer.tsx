import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, useUser } from "@/_core/auth";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Download, ExternalLink, FileText, Send, XCircle } from "lucide-react";
import { ReferrerOtpSignIn } from "@/components/ReferrerOtpSignIn";
import { WorkEmailSignIn, coverageInviteSessionKey } from "@/components/WorkEmailSignIn";
import { OneTapShareActions } from "@/components/OneTapShareActions";
import { ZeroActivityShareCard } from "@/components/ZeroActivityShareCard";
import { AccountMenu } from "@/components/AccountMenu";
import { readApiJson } from "@/lib/apiResponse";
import { applySeo } from "@/lib/seo";
import { isCompanyEmail } from "@/lib/workEmail";

type Attachment = { id: string; fileName: string; mimeType: string; fileSize: number; key: string; url: string };
type CompanyInboxItem = { id: number; targetRoleUrl: string; companyDomain: string; createdAt: string; attachmentCount: number };
type ClaimedCompanyRequest = { id: number; targetRoleUrl: string; companyDomain: string; candidateName: string | null; attachments: Attachment[] };
type CompanyResponse = { error?: string; reward?: { rewarded?: boolean }; request?: ClaimedCompanyRequest; requests?: CompanyInboxItem[] };

function ReferrerFlowHeader({ backHref = "/", right }: { backHref?: string; right?: React.ReactNode }) {
  return <header className="flex h-10 shrink-0 items-center justify-between gap-3"><Link href={backHref} className="inline-flex min-h-11 min-w-11 items-center gap-1 text-sm font-bold text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back</Link>{right ? <div className="shrink-0">{right}</div> : <AccountMenu />}</header>;
}

export function ReferralCoverageInviteBanner({ companyDomain, inviteCode }: { companyDomain: string; inviteCode?: string }) {
  const origin = typeof window === "undefined" ? "https://skipwait.me" : window.location.origin;
  const link = `${origin}/referrer?company=${encodeURIComponent(companyDomain)}${inviteCode ? `&invite=${encodeURIComponent(inviteCode)}` : ""}`;
  return <section aria-label={`Strengthen private coverage at ${companyDomain}`} className="w-full rounded-xl border border-primary bg-accent/40 p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-black">Strengthen private coverage</p><p className="mt-2 text-sm leading-6 text-black"><strong>{companyDomain}</strong> has a waiting private referral request. Share one link with a trusted colleague there — they verify a work email and choose whether to help.</p><OneTapShareActions title={`Strengthen private coverage at ${companyDomain}`} message={`A private referral request is waiting at ${companyDomain}. If you work there, verify a work email and choose whether to help:`} link={link} className="mt-3" /></section>;
}

export default function Referrer() {
  const [, go] = useLocation();
  const { isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();
  const inviteCompany = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("company")?.trim().toLowerCase() || "";
  const inviteCode = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("invite")?.trim() || "";
  const claimedRequestId = typeof window === "undefined" ? 0 : Number(new URLSearchParams(window.location.search).get("request"));
  const returnTo = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("returnTo") || "";
  const safeReturnTo = returnTo === "/post-opportunity" ? returnTo : "";
  const employeeSignInEmail = typeof window === "undefined" ? "" : window.sessionStorage.getItem("skipwait:employee-sign-in-email")?.trim().toLowerCase() || "";
  // The OTP-first referrer sign-in (ReferrerOtpSignIn) enrolls the verified
  // company email on the server and never writes the legacy
  // "skipwait:employee-sign-in-email" sessionStorage key. After its reload the
  // session email IS the verified work email, so derive enrollment from the
  // compat session (tRPC auth.me) instead of that key — otherwise this screen
  // re-shows the "Continue with work email" card and its button signs the
  // fresh session out. The sessionStorage key stays as the fallback for the
  // legacy WorkEmailSignIn flow (/email-review/:token via EmailReviewAction).
  const sessionEmail = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || "";
  const sessionEmailIsCompany = Boolean(sessionEmail) && isCompanyEmail(sessionEmail);
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
  useEffect(() => {
    // /referrer is the public employee entry point, so it carries its own title
    // instead of inheriting the current shell metadata.
    applySeo({ title: "Verify a work email to review private referrals", description: "Verify a company email once, then review private referral requests for your own company and choose whether to help. Reviewing is always free.", path: "/referrer" });
  }, []);

  const companyFetch = async (path: string, init?: RequestInit) => {
    const token = await getToken();
    const response = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: "include" });
    const payload = await readApiJson<CompanyResponse>(response, "We could not complete that private company request");
    if (!response.ok) throw new Error(payload.error || "We could not complete that private company request");
    return payload;
  };

  useEffect(() => {
    if (!isSignedIn) { setEmployeeEnrollmentReady(false); return; }
    if (!employeeSignInEmail) {
      setEmployeeEnrollmentReady(true);
      if (sessionEmailIsCompany) {
        // Signed in and the session email is already a company address: the
        // server verified + enrolled it during /api/auth/otp/verify. Hide the
        // legacy "Continue with work email" card (its only action would sign
        // the fresh OTP session out) and let the inbox load directly.
        setShowWorkEmailEnrollment(false);
        setWorkEmailError("");
      }
      return;
    }
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
  }, [isSignedIn, employeeSignInEmail, sessionEmailIsCompany]);

  useEffect(() => {
    if (!isSignedIn || claimedRequest || !employeeEnrollmentReady) return;
    let active = true;
    const path = Number.isInteger(claimedRequestId) && claimedRequestId > 0 ? `/api/company-referrals/${claimedRequestId}` : "/api/company-referrals/inbox";
    void companyFetch(path).then(payload => {
      if (!active) return;
      if (claimedRequestId > 0) { setClaimedRequest(payload.request || null); setActiveDocument(0); }
      else setInbox(payload.requests || []);
    }).catch((error: unknown) => {
      if (!active) return;
      if (claimedRequestId > 0) setInboxError("This private request is not available to your verified employee account.");
      else if (sessionEmailIsCompany) {
        // The session email is the verified company address (OTP enrollment ran
        // server-side), so a failure here is transient/specific — surface it
        // without the "verify your work email" mask. Never flash the
        // enrollment card or sign the user out for this.
        setInboxError(error instanceof Error ? error.message : "We could not load private company requests.");
      } else setInboxError("Verify your work email to view private company requests.");
    }).finally(() => { if (active) setInboxReady(true); });
    return () => { active = false; };
  }, [isSignedIn, claimedRequest, claimedRequestId, employeeEnrollmentReady, sessionEmailIsCompany]);

  useEffect(() => { if (isSignedIn && inboxReady && !claimedRequest && !showWorkEmailEnrollment && !claimedRequestId && !inboxError) go(safeReturnTo || "/inbox"); }, [claimedRequest, claimedRequestId, go, inboxError, inboxReady, isSignedIn, safeReturnTo, showWorkEmailEnrollment]);

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

  if (decision) return <main data-skipwait-screen="referrer-decision" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><ReferrerFlowHeader backHref="/inbox" /><section className="flex min-h-0 flex-1 flex-col justify-center"><span className={`grid h-12 w-12 place-items-center rounded-xl ${decision === "approved" ? "bg-[#15803d]/10 text-[#15803d]" : "bg-muted text-muted-foreground"}`}>{decision === "approved" ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}</span><h1 className="font-display mt-3 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">{decision === "approved" ? "Referral approved." : "Request declined."}</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">{decision === "approved" ? "You can now continue privately with this Job Seeker." : "The Job Seeker will receive your update privately."}</p>{decision === "approved" && claimedRequest ? <div className="mt-5"><ReferralCoverageInviteBanner companyDomain={claimedRequest.companyDomain} /></div> : null}</section><footer className="shrink-0 border-t border-border pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">{decision === "approved" && claimedRequest ? <button type="button" onClick={() => go(`/conversation/${claimedRequest.id}?from=inbox`)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3.5 text-sm font-bold text-white">Message Job Seeker <ArrowRight className="h-4 w-4" /></button> : null}<Link href="/inbox" className={`${decision === "approved" ? "mt-3 " : ""}block text-center text-sm font-semibold text-muted-foreground`}>Return to My Company Inbox</Link></footer></div></main>;

  if (!isSignedIn) return <main data-skipwait-screen="referrer-sign-in" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><ReferrerFlowHeader /><section className="flex min-h-0 flex-1 flex-col justify-center gap-4 py-3">{inviteCompany ? <ReferralCoverageInviteBanner companyDomain={inviteCompany} inviteCode={inviteCode || undefined} /> : null}<div className={inviteCompany ? "w-full rounded-2xl border border-border bg-white p-6 sm:p-8" : "w-full"}>{inviteCompany ? <><p className="text-[11px] font-bold uppercase tracking-[.16em] text-black">Private company coverage</p><h1 className="font-display mt-2 text-[1.85rem] font-semibold leading-[1.04] tracking-[-.02em]">Help {inviteCompany} cover referrals privately.</h1></> : <><span aria-hidden="true" className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-3xl bg-accent text-black"><ClipboardCheck className="h-6 w-6" /></span><div className="mb-5"><h1 className="font-display text-center text-[1.85rem] font-semibold leading-[1.04] tracking-[-.02em] text-black">Become a verified referrer</h1><p className="mt-2 text-center text-sm leading-5 text-muted-foreground">Two quick steps: sign in, then verify your work email.</p></div></>}<ReferrerOtpSignIn /></div></section></div></main>;

  if (!inboxReady) return <main data-skipwait-screen="referrer-loading" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><ReferrerFlowHeader backHref="/" /><section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-white p-5"><h1 role="status" aria-busy="true" aria-live="polite" className="mt-3 text-2xl font-semibold">Loading your private company requests…</h1></section></div></main>;

  if (!claimedRequest && inbox.length === 0 && !showWorkEmailEnrollment && !inboxError) return <EmptyCompanyInbox />;

  if (!claimedRequest) return <main data-skipwait-screen="referrer-inbox" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><ReferrerFlowHeader backHref="/" /><section className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-border bg-white p-5"><h1 className="font-display mt-3 text-3xl font-semibold tracking-[-.04em]">Private requests at your company.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Reviewing and responding are always free. Your identity stays hidden until you choose to help.</p>{coverageRewardMessage ? <p className="mt-4 rounded-xl bg-[#15803d]/10 p-3 text-sm font-medium text-[#15803d]">{coverageRewardMessage}</p> : null}{showWorkEmailEnrollment ? <div className="mt-6 rounded-xl border border-primary bg-accent p-4"><p className="text-sm font-semibold text-black">Use your company email account.</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Private Referrer access is a separate passwordless company-email sign-in. We never add that email to a personal account or send a code to another address.</p><button type="button" onClick={() => { void switchToWorkEmail(); }} className="mt-3 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Continue with work email</button></div> : null}{workEmailError && !showWorkEmailEnrollment ? <p role="alert" className="mt-4 rounded-xl bg-[#b45309]/10 p-3 text-sm text-[#B45309]">{workEmailError}</p> : null}{inboxError ? <p role="alert" className="mt-4 rounded-xl bg-[#b45309]/10 p-3 text-sm text-[#B45309]">{inboxError}</p> : null}<div className="mt-6 space-y-3">{inbox.map(request => <article key={request.id} className="rounded-xl border border-border p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">{request.companyDomain} · {request.attachmentCount} document{request.attachmentCount === 1 ? "" : "s"}</p><a href={request.targetRoleUrl} target="_blank" rel="noreferrer" className="mt-2 block truncate text-sm font-semibold text-black">{request.targetRoleUrl}</a><p className="mt-2 text-sm text-muted-foreground">Review the candidate’s note and resume before deciding whether you can help.</p><button type="button" onClick={() => { void claim(request.id); }} disabled={claimingId === request.id} className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">{claimingId === request.id ? "Opening review…" : "Review candidate"}</button></article>)}</div></section></div></main>;

  return <main data-skipwait-screen="referrer-review" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-5xl flex-col"><ReferrerFlowHeader backHref="/inbox" right={<span className="text-xs font-bold text-muted-foreground">Private review</span>} />{inboxError ? <p role="alert" className="mt-4 rounded-xl border border-[#b91c1c]/30 bg-[#b91c1c]/10 p-3 text-sm text-[#B91C1C]">{inboxError}</p> : null}<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 lg:mt-4 lg:grid lg:grid-cols-[1.35fr_.65fr] lg:gap-6 lg:overflow-hidden"><section className="min-w-0 rounded-xl border border-border bg-white p-5 lg:min-h-0 lg:overflow-y-auto"><h1 className="font-display mt-4 text-3xl font-semibold tracking-[-.04em]">{candidate} is requesting your referral</h1><a href={claimedRequest.targetRoleUrl} target="_blank" rel="noreferrer" className="mt-5 flex min-w-0 items-center gap-2 rounded-xl bg-accent p-3 text-sm font-medium text-black"><ExternalLink className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{claimedRequest.targetRoleUrl}</span></a><DocumentReview attachments={attachments} active={activeDocument} setActive={setActiveDocument} document={document} previewable={previewable} /></section><aside className="mt-4 rounded-xl bg-primary p-5 text-white lg:mt-0 lg:min-h-0 lg:overflow-y-auto"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#fffc52]">Your decision</p><h2 className="font-display mt-3 text-2xl font-semibold tracking-[-.04em]">Reviewing is free.</h2><p className="mt-3 text-sm leading-6 text-[#ededff]">Approve only if you can genuinely help. You can send a private note after approval.</p><label className="mt-5 block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#ededff]">Note for the Job Seeker <span className="normal-case font-medium">(optional)</span></span><textarea value={message} onChange={event => setMessage(event.target.value.slice(0, 3000))} placeholder="A brief update, if helpful." className="mt-2 min-h-24 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-muted-foreground focus:border-primary" /></label><button type="button" disabled={!attachments.length || deciding} onClick={() => { void decide(true); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold hover:bg-[#0000cc]">{deciding ? "Recording decision…" : "Approve referral"} <Send className="h-4 w-4" /></button><button type="button" disabled={deciding} onClick={() => { void decide(false); }} className="mt-3 w-full rounded-lg border border-white/20 px-4 py-3 text-sm font-semibold">Decline respectfully</button></aside></div></div></main>;
}

function EmptyCompanyInbox() {
  return <main data-skipwait-screen="referrer-inbox-preview" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><ReferrerFlowHeader backHref="/" /><section className="flex flex-1 flex-col items-center justify-center"><article data-skipwait-empty-preview="referrer" aria-label="Illustrative future private request layout" className="w-full max-w-sm rounded-3xl border border-dashed border-primary bg-white p-5"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-black"><ClipboardCheck className="h-5 w-5" /></span><span className="h-2 w-16 rounded-full bg-muted" /></div><div className="mt-6 grid grid-cols-3 gap-3"><span className="grid h-12 place-items-center rounded-xl bg-white text-black"><ClipboardCheck className="h-4 w-4" /></span><span className="grid h-12 place-items-center rounded-xl bg-white text-muted-foreground"><FileText className="h-4 w-4" /></span><span className="grid h-12 place-items-center rounded-xl bg-white text-[#15803d]"><CheckCircle2 className="h-4 w-4" /></span></div></article><ZeroActivityShareCard audience="referrer" /></section></div></main>;
}

function DocumentReview({ attachments, active, setActive, document, previewable }: { attachments: Attachment[]; active: number; setActive: (value: number) => void; document?: Attachment; previewable: boolean }) {
  return <div className="mt-5 rounded-xl border border-border p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Candidate documents</p><p className="text-xs font-semibold text-black">{attachments.length} attached</p></div>{attachments.length ? <><div className="mt-3 grid gap-2 sm:grid-cols-2">{attachments.map((attachment, index) => <button type="button" key={attachment.id} onClick={() => setActive(index)} className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition ${active === index ? "border-primary bg-accent" : "border-border hover:border-primary"}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-black shadow-sm"><FileText className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-black">{attachment.fileName}</span><span className="block text-xs text-muted-foreground">{attachment.mimeType || "Document"}</span></span></button>)}</div>{document ? <><div className="mt-4 flex min-w-0 items-center justify-between gap-3"><p className="min-w-0 truncate text-sm font-semibold text-black">Viewing {document.fileName}</p><a href={document.url} download={document.fileName} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-black"><Download className="h-3.5 w-3.5" />Download</a></div>{previewable ? <iframe title={`Document preview for ${document.fileName}`} src={document.url} className="mt-4 h-[360px] w-full rounded-xl border border-border bg-white" /> : <p className="mt-4 rounded-xl bg-white p-4 text-sm text-muted-foreground">This file is available to download. PDF and image files can be viewed directly here.</p>}</> : null}</> : <p className="mt-3 rounded-xl bg-[#b91c1c]/10 p-3 text-sm text-[#B91C1C]">A document is required before this request can be submitted.</p>}</div>;
}
