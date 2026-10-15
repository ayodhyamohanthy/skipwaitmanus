// The send column of /ask: where the ask goes, the send error, and the one
// primary action. A referrer's personal link (D-017) adds a routing line with
// a way to send to the whole company instead; when the link cannot be used
// (paused, invalid, malformed), sending to the company becomes the only
// primary action, because pressing "Send ask" again would fail the same way.
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/kit/button";

/** Why the personal link stopped the ask: it can never work, or the job is at another company. */
export type AskLinkRefusal = "unusable" | "other_company";

type AskSendActionsProps = {
  readonly companyName: string;
  readonly hasReferrerLink: boolean;
  readonly linkRefusal: AskLinkRefusal | null;
  readonly sendError: string;
  readonly canSend: boolean;
  readonly sending: boolean;
  readonly uploading: boolean;
  readonly sendStage: "resume" | "ask";
  readonly onSend: () => void;
  readonly onSendToCompany: () => void;
  readonly onSendToWholeCompany: () => void;
};

export function AskSendActions({ companyName, hasReferrerLink, linkRefusal, sendError, canSend, sending, uploading, sendStage, onSend, onSendToCompany, onSendToWholeCompany }: AskSendActionsProps) {
  const busy = sending || uploading;
  const busyLabel = busy ? (sending && sendStage === "ask" ? "Sending your ask…" : "Uploading your resume…") : null;
  const unusable = linkRefusal === "unusable";
  return (
    <>
      {hasReferrerLink && !unusable ? (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>Goes first to the verified employee whose private link you used. If they pass, other verified employees there can pick it up.</p>
          {linkRefusal === null ? <Button type="button" variant="link" className="h-auto p-0" disabled={busy} onClick={onSendToWholeCompany}>Send to the whole company instead</Button> : null}
        </div>
      ) : null}
      {sendError ? <p role="alert" className="flex gap-2 text-sm text-destructive"><AlertTriangle className="size-4 shrink-0" />{sendError}</p> : null}
      {unusable ? (
        <Button className="w-full" disabled={!canSend || busy} onClick={onSendToCompany}>{busyLabel ?? <>Send to {companyName} instead <ArrowRight /></>}</Button>
      ) : (
        <>
          {linkRefusal === "other_company" ? <Button variant="outline" className="w-full" disabled={busy} onClick={onSendToCompany}>Send to {companyName} instead</Button> : null}
          <Button className="w-full" disabled={!canSend || busy} onClick={onSend}>{busyLabel ?? <>Send ask <ArrowRight /></>}</Button>
        </>
      )}
      <p role="status" aria-live="polite" className="sr-only">{sending ? (sendStage === "ask" ? "Sending your ask" : "Uploading your resume") : ""}</p>
      <p className="text-center text-xs text-muted-foreground">Uses 1 credit · referrals are always free</p>
    </>
  );
}
