// Ask-sent confirmation, ported from the kit's /ask sent state. Company,
// coverage and the open-slot count all come from the live send response; the
// expiry window is the shared ASK_TTL_DAYS (an unclaimed ask expires and its
// open slot frees; asks reserve no credit).
import { ArrowRight, Check } from "lucide-react";
import { Link } from "wouter";
import type { OpenAskSlots } from "@shared/openAskSlots";
import { ASK_TTL_DAYS } from "@shared/referral";
import { Button } from "@/components/kit/button";

export type SentAsk = { readonly requestId: number; readonly companyDomain: string | null; readonly waitingForCoverage: boolean; readonly slots: OpenAskSlots | null };

/** Kit "Open slots: 2 of 3 used"; an unlimited plan has no "of". */
function SlotsLine({ slots }: { slots: OpenAskSlots }) {
  return <p className="mt-4 text-sm">Open slots: <strong>{slots.cap === null ? slots.open : `${slots.open} of ${slots.cap}`}</strong> used</p>;
}

export function AskSent({ sent, onWriteAnother }: { sent: SentAsk; onWriteAnother: () => void }) {
  const company = sent.companyDomain ?? "the company";
  const detail = sent.waitingForCoverage
    ? "No verified referrers there yet — we'll route it privately the moment coverage opens."
    : `Verified ${sent.companyDomain ? `${sent.companyDomain} ` : ""}referrers will see it. It expires in ${ASK_TTL_DAYS} days if nobody accepts, and your slot returns.`;
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
