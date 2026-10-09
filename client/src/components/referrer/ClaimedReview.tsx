// Claimed private request review (/referrer?request=:id) and the recorded
// decision, restyled into kit v4 queue-card / queue-guidance markup. Behavior
// (free approval, optional note, decline, document preview) is unchanged.
import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, CheckCircle2, Download, ExternalLink, FileText, Send, XCircle } from "lucide-react";
import { Button } from "@/components/kit/button";
import { ReferralCoverageInviteBanner } from "./CoverageInviteBanner";

export type ClaimedAttachment = { id: string; fileName: string; mimeType: string; fileSize: number; key: string; url: string };
export type ClaimedCompanyRequest = { id: number; targetRoleUrl: string; companyDomain: string; candidateName: string | null; attachments: ClaimedAttachment[] };

export function companyInitial(domain: string) {
  return (domain.trim().charAt(0) || "?").toUpperCase();
}

export function ReviewFrame({ screen, eyebrow, title, backHref, children }: { screen: string; eyebrow: string; title: string; backHref: string; children?: ReactNode }) {
  return (
    <main data-skipwait-screen={screen} className="page-content">
      <Button variant="ghost" asChild className="-ml-3 mb-5"><Link href={backHref}><ArrowLeft />Back</Link></Button>
      <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div></div>
      {children}
    </main>
  );
}

export function ClaimedReview({ request, activeDocument, setActiveDocument, message, setMessage, deciding, error, onDecide }: {
  request: ClaimedCompanyRequest;
  activeDocument: number;
  setActiveDocument: (index: number) => void;
  message: string;
  setMessage: (value: string) => void;
  deciding: boolean;
  error: string;
  onDecide: (approved: boolean) => void;
}) {
  const candidate = request.candidateName || "Candidate";
  const attachments = request.attachments;
  return (
    <ReviewFrame screen="referrer-review" eyebrow="PRIVATE REVIEW" title={`${candidate} is requesting your referral`} backHref="/inbox">
      {error ? <p role="alert" className="mt-6 rounded-[8px] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      <section className="queue-layout">
        <article className="queue-card min-w-0">
          <header>
            <span className="company-mark" aria-hidden="true">{companyInitial(request.companyDomain)}</span>
            <div className="min-w-0"><span className="eyebrow block truncate">{request.companyDomain}</span><h2>Role and documents</h2></div>
          </header>
          <a href={request.targetRoleUrl} target="_blank" rel="noreferrer" className="mt-6 flex min-w-0 items-center gap-2 rounded-[7px] bg-muted p-3.5 text-sm font-semibold">
            <ExternalLink className="size-4 shrink-0 text-primary" /><span className="min-w-0 truncate">{request.targetRoleUrl}</span>
          </a>
          <DocumentReview attachments={attachments} active={activeDocument} setActive={setActiveDocument} />
        </article>
        <aside className="queue-guidance h-fit">
          <span className="eyebrow">YOUR DECISION</span>
          <h3>Reviewing is free.</h3>
          <p>Approve only if you can genuinely help. You can send a private note after approval.</p>
          <label className="grid gap-2 text-xs font-semibold">
            <span>Note for the Job Seeker <span className="font-normal text-muted-foreground">(optional)</span></span>
            <textarea value={message} onChange={event => setMessage(event.target.value.slice(0, 3000))} placeholder="A brief update, if helpful." className="min-h-24 w-full resize-none rounded-[7px] border border-border bg-background p-3 text-sm font-normal outline-none focus:border-primary" />
          </label>
          <Button type="button" className="mt-5 w-full" disabled={!attachments.length || deciding} onClick={() => onDecide(true)}>{deciding ? "Recording decision…" : "Approve referral"} <Send /></Button>
          <Button type="button" variant="outline" className="mt-3 w-full" disabled={deciding} onClick={() => onDecide(false)}>Decline respectfully</Button>
        </aside>
      </section>
    </ReviewFrame>
  );
}

function DocumentReview({ attachments, active, setActive }: { attachments: ClaimedAttachment[]; active: number; setActive: (value: number) => void }) {
  const document = attachments[active];
  const previewable = Boolean(document && (document.mimeType === "application/pdf" || document.mimeType.startsWith("image/")));
  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3"><span className="eyebrow">Candidate documents</span><span className="text-xs font-semibold">{attachments.length} attached</span></div>
      {attachments.length ? (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {attachments.map((attachment, index) => (
              <button type="button" key={attachment.id} onClick={() => setActive(index)} aria-pressed={active === index} className={`flex min-w-0 items-center gap-3 rounded-[7px] border p-3 text-left ${active === index ? "border-foreground bg-muted" : "border-border hover:border-foreground"}`}>
                <span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-background text-primary"><FileText className="size-4" /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{attachment.fileName}</span><span className="block text-xs text-muted-foreground">{attachment.mimeType || "Document"}</span></span>
              </button>
            ))}
          </div>
          {document ? (
            <>
              <div className="mt-4 flex min-w-0 items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold">Viewing {document.fileName}</p>
                <Button variant="ghost" size="sm" asChild><a href={document.url} download={document.fileName}><Download />Download</a></Button>
              </div>
              {previewable
                ? <iframe title={`Document preview for ${document.fileName}`} src={document.url} className="mt-4 h-[360px] w-full rounded-[7px] border border-border bg-background" />
                : <p className="mt-4 rounded-[7px] bg-muted p-4 text-sm text-muted-foreground">This file is available to download. PDF and image files can be viewed directly here.</p>}
            </>
          ) : null}
        </>
      ) : <p className="mt-3 rounded-[7px] bg-destructive/10 p-3 text-sm text-destructive">A document is required before this request can be submitted.</p>}
    </div>
  );
}

export function DecisionRecorded({ decision, request, onMessage }: { decision: "approved" | "declined"; request: ClaimedCompanyRequest | null; onMessage: (requestId: number) => void }) {
  const approved = decision === "approved";
  return (
    <main data-skipwait-screen="referrer-decision" className="page-content">
      <section className="mx-auto grid max-w-xl justify-items-center py-14 text-center">
        <span className="impact-door">{approved ? <CheckCircle2 /> : <XCircle />}</span>
        <span className="eyebrow">{approved ? "REFERRAL APPROVED" : "DECISION RECORDED"}</span>
        <h1 className="mt-2.5 text-[28px] font-semibold">{approved ? "Referral approved." : "Request declined."}</h1>
        <p className="mt-2 text-[13px] leading-[1.7] text-muted-foreground">{approved ? "You can now continue privately with this Job Seeker." : "The Job Seeker will receive your update privately."}</p>
        {approved && request ? <div className="mt-7 w-full"><ReferralCoverageInviteBanner companyDomain={request.companyDomain} /></div> : null}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {approved && request ? <Button type="button" onClick={() => onMessage(request.id)}>Message Job Seeker <ArrowRight /></Button> : null}
          <Button variant="ghost" asChild><Link href="/inbox">Return to My Company Inbox</Link></Button>
        </div>
      </section>
    </main>
  );
}
