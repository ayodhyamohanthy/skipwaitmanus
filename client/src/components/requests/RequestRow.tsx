// One ask in the kit v4 Requests list. Ported from app/src/routes/requests.tsx:
// the kit row is a single link card; here the link is stretched over the card
// so the live Withdraw action can sit inside it without nesting a button in
// an anchor.
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Action as AlertDialogAction, Cancel as AlertDialogCancel } from "@radix-ui/react-alert-dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/kit/button";
import { StatusPill } from "@/components/kit/status-pill";
import { canWithdrawRequest, displayRef, isUrgentExpiry, requestNote, requestPillStatus } from "./requestModel";
import type { ReferralRequest } from "./requestsApi";

type RequestRowProps = {
  request: ReferralRequest;
  nowMs: number;
  withdrawing: boolean;
  onWithdraw: (request: ReferralRequest) => void;
};

export function RequestRow({ request, nowMs, withdrawing, onWithdraw }: RequestRowProps) {
  const pill = requestPillStatus(request);
  const title = request.title || "Referral request";
  const mark = (request.companyDomain.charAt(0) || "?").toUpperCase();
  const urgent = isUrgentExpiry(request, nowMs);
  const showUpdate = Boolean(request.referrerMessage) && request.status !== "pending" && request.status !== "declined";
  return (
    <li>
      <div className="relative flex min-h-20 items-center gap-3 rounded-3xl border border-border p-4 hover:border-foreground/40 focus-within:border-foreground focus-within:ring-1 focus-within:ring-ring">
        <span className="company-mark" aria-hidden="true">{mark}</span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate">
            <Link href={`/conversation/${request.id}`} aria-label={`${request.companyDomain} request, ${pill}`} className="outline-none after:absolute after:inset-0 after:rounded-3xl after:content-['']">{title}</Link>
          </strong>
          <small className={urgent ? "font-semibold text-destructive" : "text-muted-foreground"}>{request.companyDomain} · {requestNote(request, nowMs)}<span className="whitespace-nowrap font-normal text-muted-foreground"> · {displayRef(request.id)}</span></small>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill status={pill} />
          {canWithdrawRequest(request) ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="link" size="sm" className="relative z-10 h-auto px-0 py-0.5 text-xs font-semibold text-destructive">Withdraw</Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Withdraw this request?</AlertDialogTitle>
                  <AlertDialogDescription>{request.companyDomain} employees will no longer see it. Your credit returns to your balance.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-3">
                  <AlertDialogCancel asChild><Button type="button" variant="outline">Keep request</Button></AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button type="button" variant="destructive" disabled={withdrawing} onClick={() => onWithdraw(request)}>{withdrawing ? "Withdrawing…" : "Withdraw request"}</Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </span>
        <ArrowRight className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
      </div>
      {showUpdate ? (
        <aside aria-label="Referrer update" className="mt-2 rounded-2xl bg-muted p-3">
          <p className="text-xs leading-5 text-muted-foreground">{request.referrerMessage}</p>
        </aside>
      ) : null}
    </li>
  );
}
