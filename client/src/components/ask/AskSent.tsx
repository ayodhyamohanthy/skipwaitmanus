// Ask-sent confirmation, ported from the kit's /ask sent state. Company,
// coverage, the personal-link flag and the open-slot count all come from the
// live send response; the expiry windows are the shared ASK_TTL_DAYS and
// COVERAGE_WAIT_DAYS. The credit lines say only what the ledger does
// (shared/moneyCopy.ts): a waiting ask spends nothing until a verified employee
// can see it (D-034), a creditless ask is held at that moment (D-047), the
// 7-day clock runs from first visibility (D-061), and a personal-link ask its
// employee never acted on (D-050) expires with its credit back.
import { ArrowRight, Check } from "lucide-react";
import { Link } from "wouter";
import type { OpenAskSlots } from "@shared/openAskSlots";
import { CREDIT_ENDED_CAVEAT } from "@shared/moneyCopy";
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS } from "@shared/referral";
import { Button } from "@/components/kit/button";

export type SentAsk = { readonly requestId: number; readonly companyDomain: string | null; readonly waitingForCoverage: boolean; readonly fastTrack: boolean; readonly slots: OpenAskSlots | null };

/** Kit "Open slots: 2 of 3 used"; an unlimited plan has no "of". */
function SlotsLine({ slots }: { slots: OpenAskSlots }) {
  return <p className="mt-4 text-sm">Open slots: <strong>{slots.cap === null ? slots.open : `${slots.open} of ${slots.cap}`}</strong> used</p>;
}

export function AskSent({ sent, onWriteAnother }: { sent: SentAsk; onWriteAnother: () => void }) {
  const company = sent.companyDomain ?? "the company";
  const companyPrefix = sent.companyDomain ? `${sent.companyDomain} ` : "";
  // A personal-link ask is never routed to anyone else, so it gets its own line even while the company waits for coverage.
  const detail = sent.fastTrack
    ? `Only the ${companyPrefix}employee whose link you used will see it. If they don't pick it up within ${ASK_TTL_DAYS} days, it expires and the credit comes back, ${CREDIT_ENDED_CAVEAT}.`
    : sent.waitingForCoverage
      ? `No verified referrers there yet, so nothing was spent. Your ask waits for free up to ${COVERAGE_WAIT_DAYS} days: when a verified employee can see it, 1 credit is used and it goes live; unclaimed ${ASK_TTL_DAYS} days after that, it expires and the credit comes back, ${CREDIT_ENDED_CAVEAT}. No credit then? We hold it until you add one.`
      : `Verified ${companyPrefix}referrers will see it. If nobody picks it up within ${ASK_TTL_DAYS} days, it expires and the credit comes back, ${CREDIT_ENDED_CAVEAT}; once someone picks it up, the credit stays spent, unless they pass for a reason you can't fix.`;
  return (
    <main data-skipwait-screen="ask-sent" className="page-content mx-auto max-w-xl text-center">
      <span className="mx-auto grid size-20 place-items-center rounded-full bg-accent"><Check className="size-10 text-primary" /></span>
      <h1 className="mt-4 text-3xl font-semibold">Ask sent to {company}.</h1>
      <p className="mt-2 text-muted-foreground">{detail}</p>
      {sent.slots ? <SlotsLine slots={sent.slots} /> : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={onWriteAnother}>Write another</Button>
        <Button asChild><Link href={`/conversation/${sent.requestId}`}>Track this ask <ArrowRight /></Link></Button>
      </div>
    </main>
  );
}
