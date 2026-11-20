// D-048-p3-employer-billing: the goal /employer/billing (packet
// docs/plans/D-048-employer.md §3). Same endpoints and checkout as the kit page
// (client/src/pages/EmployerBilling.tsx): the account, the spend record, and one
// Razorpay order per top-up. No employer price, unit, unlock or access rule is
// touched (§4.1) and the money numbers come from unlockPacks.ts, the kit page's own
// values. Display copy follows rule 1a (D-153/D-173/D-180): no employer-facing
// string names the internal unit or the noun for a request - the copy names what the
// money buys. §3 sets this page: it opens "Control what you spend.", the record is
// the spend history, and one black commit says what it buys. D-006/D-040 stays on
// the page: employers never buy referrals. Nothing is claimed as paid before the
// provider captures, and the ledger reloads when it does.
import { ArrowLeft, Receipt } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalEmptyState, GoalNextStep, GoalNum, GoalSkeletonRows } from "@/components/goal";
import { applySeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { REFERRERS_NEVER_PAID } from "@shared/moneyCopy";
import { EmployerGoalFrame } from "../employer/EmployerGoalFrame";
import { SPONSOR_TIERS } from "../employer/sponsorTiers";
import { fetchBillingState, openRazorpayCheckout, startUnlockTopUp, type OpenSpend, type SpendRow } from "./employerBillingData";
import { UNLOCK_PACKS, rupee, type UnlockPack, type UnlockPackId } from "./unlockPacks";

export const GOAL_PAGE = { goalLine: "Control what you spend." } as const;

const SUBLINE = "Top-ups pay for talent unlocks and sponsored roles. Your balance never expires.";
const BALANCE_LABEL = "Talent unlock balance";
const TOPUP_HEADING = "Top up your balance";
const PACK_TERMS = "one-time · never expires";
const SPEND_HEADING = "Spend history";
const COMMIT_LABEL = "Top up for talent unlocks and sponsored roles";
const COMMIT_BUSY = "Opening your checkout";
const SIGN_IN_LABEL = "Sign in to continue";
const NO_ACCOUNT_REASON = "Open your employer account first";
const NO_ACCOUNT_TITLE = "No employer account yet.";
const NO_ACCOUNT_BODY = "Open your employer account from the overview first — top-ups start after that.";
const RESTRICTED_NOTICE = "Employer tools, including top-ups, are closed for this account.";
const RESTRICTED_REASON = "Top-ups open when your employer access is active";
const LOAD_ERROR_FALLBACK = "We could not load your billing details";
const LOAD_ERROR_BUSY = "Reloading your billing details";
const EMPTY_TITLE = "No spend yet.";
const EMPTY_BODY = "Nothing has been spent on this account yet — top-ups, talent unlocks and sponsored roles appear here.";
const CAPPED_NOTE = "Showing your latest 50 entries; older spend is not listed here.";
const CHECKOUT_ERROR_FALLBACK = "We could not start the Razorpay checkout";
const CHECKOUT_OPENED = "Razorpay checkout opened. Nothing is charged until you confirm there.";
const BACK_LABEL = "Back to overview";
const RETRY_LABEL = "Try again";
const NEVER_FOR_SALE = `Employers never buy referrals. ${REFERRERS_NEVER_PAID}`;

const BILLING_KEY = ["employer", "billing"] as const;

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const packLine = (pack: UnlockPack) => `Adds ${pack.adds} to your balance`;
const selectedLine = (pack: UnlockPack) => `Selected: ${rupee(pack.amountInPaise)} one-time, adds ${pack.adds} to your balance. The payment opens in Razorpay and nothing is charged until you confirm there.`;
const budgetLine = (budgetMonthlyUsdCents: number) => `Monthly promotion budget: $${(budgetMonthlyUsdCents / 100).toFixed(0)}`;

/** The ledger's own kinds, in the employer's words. The unit word stays out and no
 * row is invented: only the fields server/db.ts listEmployerSpendHistory returns. */
function spendLabel(row: SpendRow) {
  if (row.kind === "credit_purchase") return row.pack ? `Top-up added ${row.creditsAdded ?? 0} to your balance · ${row.pack} pack` : `Top-up added ${row.creditsAdded ?? 0} to your balance`;
  const tier = row.kind === "sponsorship" && typeof row.tier === "string" ? SPONSOR_TIERS.find(item => item.id === row.tier)?.label : undefined;
  if (row.kind === "sponsorship") return tier ? `Sponsored a role · ${tier} listing` : "Sponsored a role";
  return row.displayRef ? `Talent unlock · ${row.displayRef}` : "Talent unlock";
}

const spendAmount = (row: SpendRow) => (row.kind === "credit_purchase" ? `+${row.creditsAdded ?? 0}` : `−${row.creditsSpent ?? 0}`);
const spendDate = (row: SpendRow) => new Date(row.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function GoalEmployerBilling() {
  const { isLoaded, isSignedIn, openSignIn } = useAuth();
  const [, go] = useLocation();
  const [packId, setPackId] = useState<UnlockPackId>("starter");
  const [attemptKey, setAttemptKey] = useState("");

  useEffect(() => {
    applySeo({ title: "Employer billing on skipwait.me", description: `${SUBLINE} ${NEVER_FOR_SALE}`, path: "/employer/billing" });
  }, []);

  const billingQuery = useQuery({ queryKey: BILLING_KEY, queryFn: fetchBillingState, enabled: isLoaded && isSignedIn, retry: false });
  const selectedPack = UNLOCK_PACKS.find(pack => pack.id === packId) ?? UNLOCK_PACKS[0];
  const topUp = useMutation({
    mutationFn: async (input: { pack: UnlockPack; idempotencyKey: string }) => {
      const order = await startUnlockTopUp({ pack: input.pack.id, idempotencyKey: input.idempotencyKey });
      if (
        order.pack !== input.pack.id ||
        order.amount !== input.pack.amountInPaise ||
        order.currency !== "INR" ||
        order.credits !== input.pack.adds
      ) {
        throw new Error(CHECKOUT_ERROR_FALLBACK);
      }
      await openRazorpayCheckout({
        orderId: order.orderId,
        amount: order.amount,
        ...(order.keyId ? { keyId: order.keyId } : {}),
        description: COMMIT_LABEL,
        // The provider's capture event is the only truth that the ledger moved, so
        // the balance and the record reload from it, never from an optimistic guess.
        onCaptured: () => { void billingQuery.refetch(); },
      });
      return order;
    },
    onSuccess: () => { setAttemptKey(""); toast(CHECKOUT_OPENED); },
  });

  // One key per top-up attempt: the route replays a retry of the same key instead of
  // creating a second order, so a failed attempt keeps its key; a different pack is a
  // new decision and starts a new one.
  const topUpNow = () => {
    const idempotencyKey = attemptKey || crypto.randomUUID();
    if (!attemptKey) setAttemptKey(idempotencyKey);
    topUp.mutate({ pack: selectedPack, idempotencyKey });
  };

  const selectPack = (pack: UnlockPack) => {
    if (pack.id === packId) return;
    setPackId(pack.id);
    setAttemptKey("");
  };

  const data = billingQuery.data;

  // Signed-out first, then a failed load: both leave the query pending or errored
  // with no data, and either one read as "still loading" would strand the visitor
  // on skeleton rows instead of the gate or the honest error.
  if (!isLoaded) return <Loading go={go} />;
  if (!isSignedIn) {
    return (
      <Frame go={go}>
        <div className="mx-auto mt-6 grid grid-cols-1 w-full max-w-xl gap-5">
          <Intro />
          <GoalNextStep reason={NEVER_FOR_SALE}>
            <GoalButton variant="primary" touch="large" className="w-full" onClick={() => openSignIn()}>{SIGN_IN_LABEL}</GoalButton>
          </GoalNextStep>
        </div>
      </Frame>
    );
  }

  if (billingQuery.isError) {
    const message = errorText(billingQuery.error, LOAD_ERROR_FALLBACK);
    return (
      <Frame go={go}>
        <div className="mt-6 grid grid-cols-1 gap-5">
          <Intro />
          <div role="alert" data-testid="goal-error-state" className="border border-g-hairline bg-g-surface px-5 py-6 max-gdesk:px-4">
            <p className="text-g-label text-g-ink">Nothing was changed.</p>
            <p className="mt-1 text-g-meta text-g-ink-2">{`${message} Check your connection and try again.`}</p>
          </div>
          <GoalNextStep reason={message}>
            <GoalButton variant="primary" touch="large" busy={billingQuery.isFetching} busyLabel={LOAD_ERROR_BUSY} className="w-full gdesk:w-auto" onClick={() => void billingQuery.refetch()}>{RETRY_LABEL}</GoalButton>
          </GoalNextStep>
        </div>
      </Frame>
    );
  }

  if (billingQuery.isPending || !data) return <Loading go={go} />;

  const restricted = data.spend.access === "restricted";
  const spend = data.spend;
  // The ledger's 403 follows from a missing account too (requireEmployer needs an
  // approved one), so the missing account is the fact to name first; the
  // restricted-tools notice only speaks for an account that exists.
  const disabledReason = data.account ? (restricted ? RESTRICTED_REASON : undefined) : NO_ACCOUNT_REASON;
  const checkoutError = topUp.isError ? errorText(topUp.error, CHECKOUT_ERROR_FALLBACK) : "";

  return (
    <Frame go={go}>
      <div className="mt-6 grid grid-cols-1 gap-4">
        <Intro />
        {checkoutError ? (
          <div role="alert" data-testid="goal-checkout-error" className="border border-g-hairline bg-g-surface px-5 py-4 max-gdesk:px-4">
            <p className="text-g-label text-g-ink">No payment was taken.</p>
            <p className="mt-1 text-g-meta text-g-ink-2">{`${checkoutError} Nothing changed on your balance.`}</p>
          </div>
        ) : null}
        {data.account ? (
          <section className="border border-g-hairline bg-g-surface p-4 gdesk:p-5">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-g-label text-g-ink">{BALANCE_LABEL}</span>
              <GoalNum className="text-g-heading">{data.account.credits}</GoalNum>
            </p>
            <p className="mt-1 text-g-meta text-g-ink-2">{budgetLine(data.account.budgetMonthlyUsdCents)}</p>
          </section>
        ) : (
          <GoalEmptyState title={NO_ACCOUNT_TITLE} body={NO_ACCOUNT_BODY} className="border border-g-hairline bg-g-surface" />
        )}
        {data.account === null ? null : spend.access === "restricted" ? (
          <section className="border border-g-hairline bg-g-surface p-4 gdesk:p-5">
            <p className="text-g-label text-g-ink">{RESTRICTED_NOTICE}</p>
            {data.account.decisionNote ? <p className="mt-1 text-g-meta text-g-ink-2">{data.account.decisionNote}</p> : null}
          </section>
        ) : (
          <SpendRecord spend={spend} />
        )}
        <section aria-labelledby="goal-employer-billing-topup" className="border border-g-hairline bg-g-surface p-4 gdesk:p-5">
          <h2 id="goal-employer-billing-topup" className="text-g-label text-g-ink">{TOPUP_HEADING}</h2>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {UNLOCK_PACKS.map(pack => (
              <button
                key={pack.id}
                type="button"
                data-testid="goal-employer-topup-pack"
                aria-pressed={pack.id === packId}
                onClick={() => selectPack(pack)}
                className={cn("flex items-baseline justify-between gap-3 border p-3.5 text-left", pack.id === packId ? "border-g-ink bg-g-surface-hover" : "border-g-hairline bg-g-surface")}
              >
                <span className="min-w-0">
                  <span className="block text-g-label text-g-ink">{packLine(pack)}</span>
                  <span className="block text-g-meta text-g-ink-2">{PACK_TERMS}</span>
                </span>
                <GoalNum className="shrink-0">{rupee(pack.amountInPaise)}</GoalNum>
              </button>
            ))}
          </div>
          <p className="mt-3 text-g-meta text-g-ink-3">{NEVER_FOR_SALE}</p>
        </section>
        <GoalNextStep reason={disabledReason ? NEVER_FOR_SALE : selectedLine(selectedPack)}>
          <GoalButton
            variant="primary"
            touch="large"
            busy={topUp.isPending}
            busyLabel={COMMIT_BUSY}
            {...(disabledReason ? { disabledReason } : {})}
            className="w-full gdesk:w-auto"
            onClick={topUpNow}
          >
            {COMMIT_LABEL}
          </GoalButton>
        </GoalNextStep>
      </div>
    </Frame>
  );
}

type Go = (href: string) => void;

const Loading = ({ go }: { go: Go }) => (
  <Frame go={go}>
    <Intro />
    <div className="mt-6"><GoalSkeletonRows density="queue" count={3} /></div>
  </Frame>
);

const Frame = ({ go, children }: { go: Go; children: ReactNode }) => (
  <EmployerGoalFrame screen="employer-billing" page="employer">
    <div className="mx-auto w-full max-w-2xl">
      <header className="flex h-10 items-center">
        <GoalButton size="sm" variant="ghost" flush leadingIcon={ArrowLeft} onClick={() => go("/employer")}>{BACK_LABEL}</GoalButton>
      </header>
      {children}
    </div>
  </EmployerGoalFrame>
);

/** The h1 always carries the goal line (goal page contract); the sections below it
 * state the record and the one thing the page can buy. */
const Intro = () => (
  <section>
    <h1 className="text-g-heading text-g-ink">{GOAL_PAGE.goalLine}</h1>
    <p className="mt-2 max-w-xl text-g-meta text-g-ink-2">{SUBLINE}</p>
  </section>
);

function SpendRecord({ spend }: { spend: OpenSpend }) {
  return (
    <section aria-labelledby="goal-employer-billing-spend" className="border border-g-hairline bg-g-surface p-4 gdesk:p-5">
      <h2 id="goal-employer-billing-spend" className="text-g-label text-g-ink">{SPEND_HEADING}</h2>
      {spend.rows.length === 0 ? (
        <GoalEmptyState title={EMPTY_TITLE} body={EMPTY_BODY} className="px-0 py-3" />
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-1 gap-2">
            {spend.rows.map((row, index) => (
              <li key={`${row.kind}-${row.createdAt}-${index}`} data-testid="goal-employer-spend-row" className="flex items-center justify-between gap-3 border border-g-hairline bg-g-surface p-3.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Receipt aria-hidden="true" className="size-4 shrink-0 text-g-ink-2" strokeWidth={1.75} />
                  <span className="min-w-0">
                    <span className="block truncate text-g-small text-g-ink">{spendLabel(row)}</span>
                    <span className="block text-g-meta text-g-ink-3">{spendDate(row)}</span>
                  </span>
                </span>
                <GoalNum className="shrink-0">{spendAmount(row)}</GoalNum>
              </li>
            ))}
          </ul>
          {spend.capped ? <p className="mt-3 text-g-meta text-g-ink-3">{CAPPED_NOTE}</p> : null}
        </>
      )}
    </section>
  );
}
