// Kit v4 Requests summary row (open slots · in conversation · expiring soon)
// plus the slots-full nudge, ported from app/src/routes/requests.tsx. The meter
// is the seeker's open asks against the plan's open-ask cap, counted by the
// server (/api/company-referrals/mine `slots`); the nudge names the next plan
// and its cap from the plan catalog.
import { Clock3 } from "lucide-react";
import { Link } from "wouter";
import type { OpenAskSlots } from "@shared/openAskSlots";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { slotMeter, slotsFullCopy, type SlotMeter } from "./requestModel";

type RequestSummaryProps = {
  /** null when the server could not count them; the meter then says so instead of guessing. */
  slots: OpenAskSlots | null;
  inConversation: number;
  expiringSoon: number;
  hasWithdrawableAsk: boolean;
  onRetrySlots: () => void;
};

/** Kit segments for small caps (Free: 3); larger caps fill one continuous bar. */
const SEGMENTED_MAX = 5;

function SlotBar({ meter }: { meter: SlotMeter }) {
  if (meter.cap === null) return null;
  const cap = meter.cap;
  const segmented = cap <= SEGMENTED_MAX;
  return (
    <div role="progressbar" aria-label="Open slots used" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={meter.filled} className={`mt-2 flex h-2 ${segmented ? "gap-1" : "overflow-hidden rounded-full bg-muted"}`}>
      {Array.from({ length: cap }, (_, index) => {
        const filled = index < meter.filled;
        if (segmented) return <span key={index} className={`flex-1 rounded-full ${filled ? "bg-primary" : "bg-muted"}`} />;
        return <span key={index} className={`flex-1 ${filled ? "bg-primary" : ""} ${filled && index === meter.filled - 1 ? "rounded-r-full" : ""}`} />;
      })}
    </div>
  );
}

export function RequestSummary({ slots, inConversation, expiringSoon, hasWithdrawableAsk, onRetrySlots }: RequestSummaryProps) {
  const meter = slots ? slotMeter(slots) : null;
  const full = slots && meter?.full ? slotsFullCopy(slots, hasWithdrawableAsk) : null;
  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Request summary">
        <Panel>
          {meter ? (
            <div role="group" aria-label={meter.cap === null ? `Open slots: ${meter.open} used, no cap` : `Open slots: ${meter.open} of ${meter.cap} used`}>
              <span className="eyebrow">{meter.label}</span>
              <p className="mt-1 text-3xl font-semibold">{meter.open}<span className="text-lg text-muted-foreground">{meter.cap === null ? " · unlimited" : `/${meter.cap}`}</span></p>
              <SlotBar meter={meter} />
            </div>
          ) : (
            <>
              <span className="eyebrow">OPEN SLOTS</span>
              <p className="mt-1 text-3xl font-semibold"><span aria-hidden="true">–</span><span className="sr-only">Open slots not loaded</span></p>
              <small className="mt-2 block text-muted-foreground">Open slots didn’t load. <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetrySlots}>Reload</Button></small>
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
