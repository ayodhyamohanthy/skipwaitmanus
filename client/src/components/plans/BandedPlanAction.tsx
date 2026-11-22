// BANDED-ui: the bottom of one plan card on /plans, from the server's offer.
// Off (or no offer wired): the honest not-on-sale state, never a button.
// On sale: Buy (hosted checkout), Apply for a by-application plan, the
// cap-full state, or the member's own plan. Places left come only from the
// offer's real count.
import type { ReactNode } from "react";
import { planFamilyEntry, type PlanFamilyId } from "@shared/planFamily";
import type { BandedSales } from "./bandedSales";
import { planKey } from "./bandedSales";

/** Off state label, unchanged from the read-only page. */
export const CHECKOUT_OFF_LABEL = "Checkout not switched on yet";
export const CAP_FULL_LABEL = "Founding places for this plan are taken";
export const OFFER_LOADING_LABEL = "Checking whether this plan is on sale…";
const APPLY_EMAIL = "support@skipwait.me";

const buttonBase = "g-hit flex w-full items-center justify-center rounded-[10px] border px-5 text-center text-g-small font-semibold";
// Actions are 40px on desktop and 44px on phones (DESIGN.md controls and rule 15); the off-state box keeps its old size.
const actionBase = `${buttonBase} h-10 max-gdesk:h-11`;
export const primaryButton = `${actionBase} border-transparent bg-g-primary text-g-on-primary hover:bg-g-primary-hover active:bg-g-primary-pressed`;
export const outlineButton = `${actionBase} border-g-ink bg-g-surface text-g-ink hover:bg-g-surface-hover`;
export const inertButton = `${actionBase} cursor-not-allowed border-g-control-edge bg-g-surface text-g-ink-3`;
const statusBox = `${buttonBase} border-g-hairline bg-g-surface text-g-ink-3`;

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-g-badge text-g-ink-3">{children}</p>;
}

function OffState({ primary }: { primary: boolean }) {
  return (
    <>
      <p data-g-primary={primary || undefined} aria-disabled="true" className={statusBox}>{CHECKOUT_OFF_LABEL}</p>
      <Note>These are the frozen founding prices. Billing is not switched on yet.</Note>
    </>
  );
}

function Status({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return <p aria-busy={busy || undefined} className={statusBox}>{children}</p>;
}

function PlacesLeft({ planId, count }: { planId: PlanFamilyId; count: number }) {
  return <Note><span data-testid={`places-left-${planId}`} className="font-g-mono text-[13px] text-g-ink-2">{count}</span> founding places left</Note>;
}

/** Featured plan first; the page's one black commit goes to the first plan a visitor can actually buy. */
const PRIMARY_ORDER: readonly PlanFamilyId[] = ["mid_to_senior", "early_to_mid"];

/** Which on-sale action carries the page's single black commit: a plan, the member's extras, or none. */
export function bandedPrimaryTarget(sales: BandedSales | undefined): PlanFamilyId | "referrals" | null {
  if (!sales || sales.offer.status !== "ready" || !sales.offer.offer.onSale) return null;
  const live = sales.offer.offer;
  if (live.memberPlan !== null) return "referrals";
  return PRIMARY_ORDER.find(id => live.plans.some(plan => plan.planId === id && !plan.byApplication && plan.foundingPlacesLeft > 0)) ?? null;
}

/** The action area of one plan card. `primary` marks the page's one black commit. */
export function BandedPlanAction({ planId, sales, primary, offPrimary }: { planId: PlanFamilyId; sales?: BandedSales; primary: boolean; offPrimary: boolean }) {
  const entry = planFamilyEntry(planId);
  if (!sales) return <OffState primary={offPrimary} />;
  const { offer } = sales;
  if (offer.status === "loading") return <Status busy>{OFFER_LOADING_LABEL}</Status>;
  if (offer.status === "error") return <><Status>Not available right now</Status><Note>Nothing is charged.</Note></>;
  if (!offer.offer.onSale) return <OffState primary={offPrimary} />;

  const live = offer.offer;
  const row = live.plans.find(plan => plan.planId === planId);
  if (live.memberPlan === planId) return <><Status>Your plan</Status><Note>Manage it from Billing.</Note></>;
  if (!row) return <><Status>Not on sale right now</Status><Note>Nothing is charged.</Note></>;
  if (row.foundingPlacesLeft === 0) return <><Status>{CAP_FULL_LABEL}</Status><Note>Nothing is on sale for this plan right now.</Note></>;
  if (live.memberPlan !== null) return <><Status>You already have a plan</Status><PlacesLeft planId={planId} count={row.foundingPlacesLeft} /></>;

  if (row.byApplication) {
    const subject = encodeURIComponent(`${entry.label} plan application`);
    return (
      <>
        <a href={`mailto:${APPLY_EMAIL}?subject=${subject}`} className={outlineButton}>Apply</a>
        <PlacesLeft planId={planId} count={row.foundingPlacesLeft} />
        <Note>By application: we set it up with you. No checkout here.</Note>
      </>
    );
  }

  const key = planKey(planId);
  const opening = sales.buying === key;
  const blocked = sales.buying !== null;
  const failure = sales.failure?.key === key ? sales.failure.message : null;
  return (
    <>
      <button
        type="button"
        data-g-primary={primary && !blocked ? true : undefined}
        aria-disabled={blocked ? "true" : undefined}
        aria-busy={opening ? "true" : undefined}
        onClick={() => { if (!blocked) void sales.buyPlan(planId); }}
        className={blocked ? inertButton : primary ? primaryButton : outlineButton}
      >
        {opening ? "Opening secure checkout…" : `Buy ${entry.label}`}
      </button>
      <PlacesLeft planId={planId} count={row.foundingPlacesLeft} />
      {failure ? <p role="alert" className="mt-2 text-g-small text-g-ink">{failure}</p> : null}
    </>
  );
}
