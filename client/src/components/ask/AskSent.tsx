// Ask-sent confirmation, ported from the kit's /ask sent state. Company,
// coverage and open-ask count come from the live send response and
// /api/company-referrals/mine; the expiry window is the shared ASK_TTL_DAYS
// (an unclaimed ask expires and its reserved credit is returned).
import { ArrowRight, Check } from "lucide-react";
import { Link } from "wouter";
import { ASK_TTL_DAYS } from "@shared/referral";
import { Button } from "@/components/kit/button";

export type SentAsk = { readonly requestId: number; readonly companyDomain: string | null; readonly waitingForCoverage: boolean };

export function AskSent({ sent, openAsks, onWriteAnother }: { sent: SentAsk; openAsks: number | null; onWriteAnother: () => void }) {
  const company = sent.companyDomain ?? "the company";
  const detail = sent.waitingForCoverage
    ? "No verified referrers there yet — we'll route it privately the moment coverage opens."
    : `Verified ${sent.companyDomain ? `${sent.companyDomain} ` : ""}referrers will see it. It expires in ${ASK_TTL_DAYS} days if nobody accepts, and your credit returns.`;
  return (
    <main data-skipwait-screen="ask-sent" className="page-content mx-auto max-w-xl text-center">
      <span className="mx-auto grid size-20 place-items-center rounded-full bg-accent"><Check className="size-10 text-primary" /></span>
      <h1 className="mt-4 text-3xl font-semibold">Ask sent to {company}.</h1>
      <p className="mt-2 text-muted-foreground">{detail}</p>
      {openAsks !== null ? <p className="mt-4 text-sm">Open asks: <strong>{openAsks}</strong></p> : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={onWriteAnother}>Write another</Button>
        <Button asChild><Link href={`/conversation/${sent.requestId}`}>Track this ask <ArrowRight /></Link></Button>
      </div>
    </main>
  );
}
