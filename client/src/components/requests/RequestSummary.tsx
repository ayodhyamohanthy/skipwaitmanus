// Kit v4 Requests summary row (open slots · in conversation · expiring soon)
// plus the slots-full nudge, ported from app/src/routes/requests.tsx and
// driven by the live wallet (/api/credits/summary) through slotMeter.
import { Clock3 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { slotMeter, slotsFullCopy, type SlotMeter } from "./requestModel";
import type { CreditSummary } from "./requestsApi";

type RequestSummaryProps = {
  credits: CreditSummary | null;
  creditsFailed: boolean;
  inConversation: number;
  expiringSoon: number;
  hasWithdrawableAsk: boolean;
  onRetryCredits: () => void;
};

/** Kit segments for small allowances (Free: 3); larger plans fill one continuous bar. */
const SEGMENTED_MAX = 5;

function SlotBar({ meter }: { meter: SlotMeter }) {
  const segmented = meter.allowance <= SEGMENTED_MAX;
  return (
    <div role="progressbar" aria-label="Open slots this month" aria-valuemin={0} aria-valuemax={meter.allowance} aria-valuenow={meter.open} className={`mt-2 flex h-2 ${segmented ? "gap-1" : "overflow-hidden rounded-full bg-muted"}`}>
      {Array.from({ length: meter.allowance }, (_, index) => {
        const filled = index < meter.open;
        if (segmented) return <span key={index} className={`flex-1 rounded-full ${filled ? "bg-primary" : "bg-muted"}`} />;
        return <span key={index} className={`flex-1 ${filled ? "bg-primary" : ""} ${filled && index === meter.open - 1 ? "rounded-r-full" : ""}`} />;
      })}
    </div>
  );
}

export function RequestSummary({ credits, creditsFailed, inConversation, expiringSoon, hasWithdrawableAsk, onRetryCredits }: RequestSummaryProps) {
  const meter = credits ? slotMeter(credits) : null;
  const extras = meter ? [meter.packCredits > 0 ? `+${meter.packCredits} one-time credit${meter.packCredits === 1 ? "" : "s"}` : null, meter.renewsOn ? `Renews ${meter.renewsOn}` : null].filter((part): part is string => Boolean(part)) : [];
  const full = meter?.full ? slotsFullCopy(meter, hasWithdrawableAsk) : null;
  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Request summary">
        <Panel>
          {meter ? (
            <div role="group" aria-label={`Open slots: ${meter.open} of ${meter.allowance}`}>
              <span className="eyebrow">{`OPEN SLOTS · ${meter.planLabel.toUpperCase()}`}</span>
              <p className="mt-1 text-3xl font-semibold">{meter.open}<span className="text-lg text-muted-foreground">/{meter.allowance}</span></p>
              <SlotBar meter={meter} />
              {extras.length ? <small className="mt-2 block text-muted-foreground">{extras.join(" · ")}</small> : null}
            </div>
          ) : (
            <>
              <span className="eyebrow">OPEN SLOTS</span>
              <p className="mt-1 text-3xl font-semibold"><span aria-hidden="true">–</span><span className="sr-only">{creditsFailed ? "Open slots not loaded" : "Loading open slots"}</span></p>
              {creditsFailed ? <small className="mt-2 block text-muted-foreground">Credits didn’t load. <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetryCredits}>Reload credits</Button></small> : null}
            </>
          )}
        </Panel>
        <Panel><span className="eyebrow">IN CONVERSATION</span><p className="mt-1 text-3xl font-semibold">{inConversation}</p></Panel>
        <Panel><span className="eyebrow">EXPIRING SOON</span><p className="mt-1 flex items-center gap-2 text-3xl font-semibold">{expiringSoon}<Clock3 className="size-5 text-muted-foreground" aria-hidden="true" /></p></Panel>
      </div>
      {full ? (
        <div role="status">
          <Panel tone="muted" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm"><span>{full.lead}</span> {full.next}</span>
            <Button size="sm" variant="outline" asChild><Link href="/plans">See plans</Link></Button>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
