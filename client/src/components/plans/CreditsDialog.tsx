// Kit v4 Add credits dialog (pack → pay → confirmation) on top of the pack
// credits the catalog sells (§3.2). Packs are one-time: quantity is always 1,
// so the dialog selects a pack id and hands the kept checkout state to the
// hosted Chargebee page. Purchased credits never expire.
import { Check } from "lucide-react";
import { Button } from "@/components/kit/button";
import type { SubscriptionCurrency } from "@shared/subscriptionPlans";
import { CREDIT_ACTIONS } from "@shared/creditCatalog";
import { creditPackCards, type CreditPackCard } from "./kitPlans";
import { KitDialog } from "./KitDialog";

type CreditsDialogProps = {
  currency: SubscriptionCurrency;
  signedIn: boolean;
  pack: CreditPackCard;
  onPackChange: (pack: CreditPackCard) => void;
  opening: boolean;
  error: string;
  onPay: (pack: CreditPackCard) => void;
  onClose: () => void;
};

export function creditsDialogPacks(currency: SubscriptionCurrency): CreditPackCard[] {
  return creditPackCards(currency);
}

export function CreditsDialog({ currency, signedIn, pack, onPackChange, opening, error, onPay, onClose }: CreditsDialogProps) {
  const packs = creditsDialogPacks(currency);
  return <KitDialog label="Add credits" onClose={onClose} className="credits-dialog">
    <h2 id="add-credits-title" className="text-xl font-semibold">Add credits</h2>
    <p className="dialog-lead">One-off tools, no subscription. Credits never expire and never change your place in any queue.</p>
    <div className="pack-grid" role="radiogroup" aria-label="Credit packs">
      {packs.map(option => <button key={option.id} type="button" role="radio" aria-checked={pack.id === option.id} className={`pack-card ${pack.id === option.id ? "selected" : ""} ${option.firstPack ? "featured" : ""}`} onClick={() => onPackChange(option)}>
        {option.firstPack && <span className="pack-note">First pack</span>}
        <strong>{option.credits}<small> credits</small></strong>
        <span className="pack-price">{option.display}{signedIn && option.firstPack ? <em> one-time</em> : null}</span>
        {pack.id === option.id && <Check className="pack-check" />}
      </button>)}
    </div>
    <div className="pay-panel">
      <h3>Pay {pack.display} for {pack.credits} credits</h3>
      <p className="secure">Secure hosted checkout · {currency === "INR" ? "UPI, cards and netbanking" : "Cards and PayPal"} · Unused credits stay on your balance forever</p>
      <Button data-autofocus className="brand-button" disabled={opening} onClick={() => onPay(pack)}>{opening ? "Opening secure checkout…" : signedIn ? `Pay ${pack.display}` : `Sign in to pay ${pack.display}`}</Button>
      {error ? <p role="alert" className="mb-0 font-semibold text-destructive">{error}</p> : null}
    </div>
    <div className="dialog-costs"><span className="eyebrow">WHAT CREDITS DO</span><div className="cost-list">{CREDIT_ACTIONS.map(action => <div key={action.id}><span className="cost-badge">{action.cost} cr</span><span><strong>{action.label}</strong></span></div>)}</div></div>
  </KitDialog>;
}
