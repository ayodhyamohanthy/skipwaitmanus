// Gift subscription notices on /plans, in kit Panel styling: buyer return status,
// gifts waiting to be claimed, the claimed confirmation and gifts already sent.
import { Gift } from "lucide-react";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import type { ClaimableGift, SentGift } from "./billingApi";

const giftPlanName = (plan: string | null) => (plan === "max" ? "Max" : "Pro");

type GiftNoticesProps = {
  giftReturn: string | null;
  claimedPlan: string;
  claimable: ClaimableGift[];
  claimingId: string | null;
  onClaim: (giftId: string) => void;
};

export function GiftNotices({ giftReturn, claimedPlan, claimable, claimingId, onClaim }: GiftNoticesProps) {
  const notices = [
    giftReturn === "done" ? "Gift checkout complete. Your recipient gets an email to claim their plan." : null,
    giftReturn === "cancelled" ? "Gift checkout was cancelled. Nothing was charged." : null,
    claimedPlan ? `Your gifted ${claimedPlan} plan is active. Monthly credits are on your balance.` : null,
  ].filter((notice): notice is string => notice !== null);
  if (!notices.length && !claimable.length) return null;
  return <div className="my-6 grid gap-3">
    {notices.map(notice => <Panel key={notice} tone="muted"><p role="status" className="text-sm font-semibold">{notice}</p></Panel>)}
    {claimable.length ? <Panel tone="accent"><div role="alert">
      <p className="flex items-center gap-2 font-semibold"><Gift className="size-4" />You received a gift</p>
      {claimable.map(gift => <div key={gift.giftId} className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{giftPlanName(gift.plan)} plan · monthly credits included</p><Button size="sm" disabled={claimingId === gift.giftId} onClick={() => onClaim(gift.giftId)}>{claimingId === gift.giftId ? "Claiming…" : "Claim gift"}</Button></div>)}
    </div></Panel> : null}
  </div>;
}

export function SentGifts({ sent, error }: { sent: SentGift[]; error: string }) {
  if (!sent.length && !error) return null;
  return <div className="mx-auto mt-4 grid max-w-[720px] gap-3">
    {error ? <p role="alert" className="text-center text-sm font-semibold text-destructive">{error}</p> : null}
    {sent.length ? <details className="rounded-2xl border border-border p-4 text-left"><summary className="cursor-pointer text-sm font-semibold">Gifts you have sent ({sent.length})</summary><ul className="mt-2 grid gap-1.5">{sent.map(gift => <li key={gift.giftId} className="text-sm text-muted-foreground">{giftPlanName(gift.plan)} → {gift.receiverEmail || "recipient"} · {gift.fulfillmentStatus === "credited" ? "claimed" : gift.fulfillmentStatus === "pending" ? "waiting for claim" : gift.fulfillmentStatus}</li>)}</ul></details> : null}
  </div>;
}
