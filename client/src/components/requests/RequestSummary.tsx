// Kit v4 Requests summary row (credit meter · in conversation · expiring soon)
// plus the credits-full nudge, ported from app/src/routes/requests.tsx.
import { Clock3 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { creditMeter, creditsFullCopy } from "./requestModel";
import type { CreditSummary } from "./requestsApi";

type RequestSummaryProps = {
  credits: CreditSummary | null;
  creditsFailed: boolean;
  inConversation: number;
  expiringSoon: number;
  hasWithdrawableAsk: boolean;
  onRetryCredits: () => void;
};

export function RequestSummary({ credits, creditsFailed, inConversation, expiringSoon, hasWithdrawableAsk, onRetryCredits }: RequestSummaryProps) {
  const meter = credits ? creditMeter(credits) : null;
  const extras = meter ? [meter.packCredits > 0 ? `+${meter.packCredits} one-time credit${meter.packCredits === 1 ? "" : "s"}` : null, meter.renewsOn ? `Renews ${meter.renewsOn}` : null].filter((part): part is string => Boolean(part)) : [];
  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Request summary">
        <Panel>
          <span className="eyebrow">{meter ? `CREDITS USED · ${meter.planLabel.toUpperCase()}` : "CREDITS USED"}</span>
          {meter ? (
            <>
              <p className="mt-1 text-3xl font-semibold">{meter.used}<span className="text-lg text-muted-foreground">/{meter.allowance}</span></p>
              <div role="progressbar" aria-label="Monthly credits used" aria-valuemin={0} aria-valuemax={meter.allowance} aria-valuenow={meter.used} className="mt-2 flex gap-1">
                {Array.from({ length: meter.allowance }, (_, index) => <span key={index} className={`h-2 flex-1 rounded-full ${index < meter.used ? "bg-primary" : "bg-muted"}`} />)}
              </div>
              {extras.length ? <small className="mt-2 block text-muted-foreground">{extras.join(" · ")}</small> : null}
            </>
          ) : (
            <>
              <p className="mt-1 text-3xl font-semibold"><span aria-hidden="true">–</span><span className="sr-only">{creditsFailed ? "Credits not loaded" : "Loading credits"}</span></p>
              {creditsFailed ? <small className="mt-2 block text-muted-foreground">Credits didn’t load. <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetryCredits}>Reload credits</Button></small> : null}
            </>
          )}
        </Panel>
        <Panel><span className="eyebrow">IN CONVERSATION</span><p className="mt-1 text-3xl font-semibold">{inConversation}</p></Panel>
        <Panel><span className="eyebrow">EXPIRING SOON</span><p className="mt-1 flex items-center gap-2 text-3xl font-semibold">{expiringSoon}<Clock3 className="size-5 text-muted-foreground" aria-hidden="true" /></p></Panel>
      </div>
      {meter?.full ? (
        <Panel tone="muted" className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm">{creditsFullCopy(meter, hasWithdrawableAsk)}</span>
          <Button size="sm" variant="outline" asChild><Link href="/plans?role=job_seeker">See plans</Link></Button>
        </Panel>
      ) : null}
    </>
  );
}
