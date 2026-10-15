// Candidate preview inside the kit v4 queue card: the seeker's note, role link
// and how many files wait, then the one-click decision (accept, or decline with
// one reason after a confirmation). Before acceptance the seeker stays anonymous:
// no name and no file names or links (D-019; the server sends neither).
import { CheckCircle2, FileText } from "lucide-react";
import type { ReferrerAskPreview } from "@shared/referrerAskView";
import { NO_PERSONAL_NOTE_TEXT } from "@shared/askNote";
import { Button } from "@/components/kit/button";
import { ActionErrorCard } from "@/components/ActionErrorCard";
import { companyInitial } from "./ClaimedReview";
import { RoleLink, displayRef } from "./QueueParts";

export type DeclineReason = "role_not_a_fit" | "cannot_support" | "timing";
export const declineReasonOptions: ReadonlyArray<{ readonly value: DeclineReason; readonly label: string; readonly hint: string }> = [
  { value: "role_not_a_fit", label: "Not a fit", hint: "The role and profile don’t line up." },
  { value: "cannot_support", label: "Can’t support", hint: "You can’t vouch for this referral." },
  { value: "timing", label: "Not now", hint: "You’re out of capacity at the moment." },
];

/** Parsed with the shared preview contract (referrerAskPreviewResponseSchema) before it reaches the card. */
export type CandidatePreview = ReferrerAskPreview;

export function CandidatePreviewCard({ preview, working, error, raceError, pendingDecline, onAccept, onDecline, onConfirmDecline, onCancelDecline, onRetry, onBackToQueue }: {
  preview: CandidatePreview;
  working: boolean;
  error: string;
  raceError: boolean;
  pendingDecline: DeclineReason | null;
  onAccept: () => void;
  onDecline: (reason: DeclineReason) => void;
  onConfirmDecline: (reason: DeclineReason) => void;
  onCancelDecline: () => void;
  onRetry: () => void;
  onBackToQueue: () => void;
}) {
  const pendingOption = declineReasonOptions.find(option => option.value === pendingDecline);
  const fileCount = preview.attachments?.length ?? 0;
  const company = preview.companyDomain ?? "";
  return (
    <article aria-label="Candidate preview" className="queue-card min-w-0">
      <header>
        <span className="company-mark" aria-hidden="true">{companyInitial(company)}</span>
        <div className="min-w-0"><span className="eyebrow block truncate">{company ? `${company} · ${displayRef(preview.id)}` : displayRef(preview.id)}</span><h2>Job Seeker</h2></div>
      </header>
      <RoleLink url={preview.targetRoleUrl ?? null} />
      <span className="eyebrow mt-6 block">Job Seeker’s note</span>
      <blockquote className="!mt-2 whitespace-pre-wrap">{preview.candidateMessage?.trim() || NO_PERSONAL_NOTE_TEXT}</blockquote>
      <section aria-label="Resume and documents" className="border-t border-border pt-5">
        <div className="flex items-center justify-between gap-3"><span className="eyebrow">Resume & documents</span><span className="text-xs font-semibold">{fileCount} attached</span></div>
        {fileCount > 0
          ? <p className="mt-3 flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 shrink-0 text-primary" />Resume ready after acceptance</p>
          : <p className="mt-3 text-sm text-muted-foreground">No resume was attached.</p>}
      </section>
      <div className="mt-6 border-t border-border pt-5">
        {error ? (
          <ActionErrorCard
            className="mb-4"
            title={raceError ? "Accept failed" : "That didn’t go through"}
            detail={error.replace(/^Accept failed — /, "")}
            reassurance={raceError ? undefined : "Nothing was recorded and the request is still in your queue."}
            onRetry={raceError ? undefined : onRetry}
            retrying={working}
            dismissLabel="Back to queue"
            onDismiss={onBackToQueue}
          />
        ) : null}
        {pendingDecline && pendingOption ? (
          <div role="group" aria-label="Confirm decline" className="rounded-[7px] bg-muted p-4">
            <p className="text-sm font-semibold">Decline as “{pendingOption.label}”?</p>
            <p className="mt-1 text-[13px] leading-[1.7] text-muted-foreground">{pendingOption.hint} The Job Seeker sees a short private note — never your name — and their credit is returned.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="flex-1 text-destructive" disabled={working} onClick={() => onConfirmDecline(pendingDecline)}>{working ? "Recording…" : "Confirm decline"}</Button>
              <Button type="button" variant="ghost" className="min-h-11 flex-1" disabled={working} onClick={onCancelDecline}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <Button type="button" className="w-full" onClick={onAccept} disabled={working || !fileCount}>{working ? "Recording decision…" : "Accept & submit referral"}<CheckCircle2 /></Button>
            <p className="mt-4 text-center text-xs font-semibold text-muted-foreground">Or decline with one reason</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {declineReasonOptions.map(option => (
                <button key={option.value} type="button" disabled={working} onClick={() => onDecline(option.value)} className="min-h-11 rounded-[7px] border border-border px-2 py-2 text-xs font-semibold text-muted-foreground hover:border-foreground hover:text-foreground">{option.label}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
