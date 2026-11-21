import { useEffect } from "react";
import { Link } from "wouter";
import { GoalButton, GoalNextStep, GoalNum, GoalStatus } from "@/components/goal";
import { applySeo } from "@/lib/seo";
import { tokenReturnPath } from "@/lib/tokens";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";
import { REFERRERS_NEVER_PAY } from "@shared/referrerPurchases";
import { useLocationSearch } from "../sign-in/useLocationSearch";
import { usePremiumPayment } from "./usePremiumPayment";
import type { TokenRole } from "@/lib/tokens";

export const GOAL_PAGE = { goalLine: "Get more referral requests." } as const;
const LINK = "inline-flex min-h-11 items-center text-g-label text-g-ink underline underline-offset-4";

export default function GoalPremium() {
  const search = useLocationSearch();
  return <PremiumFlow key={search} search={search} />;
}

function PremiumFlow({ search }: { search: string }) {
  const params = new URLSearchParams(search);
  const role: TokenRole = params.get("role") === "referrer" ? "referrer" : "job_seeker";
  const pending = params.get("payment") === "pending";
  const referrerOff = role === "referrer";
  const { auth, balance, recovery } = usePremiumPayment(role, pending);
  const back = tokenReturnPath(role);

  useEffect(() => {
    applySeo({
      title: "Get more referral requests",
      description: "Extra referral requests are paused. Existing balances still work. Get help with a recent payment.",
      path: "/premium",
    });
  }, []);

  let label = "Extra referral requests are paused.";
  let reason = "We are not selling extra referral requests right now. Referral requests already in your account still work.";
  let action = <GoalButton variant="primary" asChild className="mt-4"><Link href={back}>Back to my referral request</Link></GoalButton>;

  if (pending) {
    label = !auth.isLoaded
      ? "Checking sign-in…"
      : !auth.isSignedIn
        ? "Sign in to confirm your payment."
        : recovery.state === "credited"
          ? `${recovery.count} referral request${recovery.count === 1 ? " is" : "s are"} ready.`
          : recovery.state === "requires_review"
            ? "This payment needs a review."
            : recovery.state === "error"
              ? "We could not confirm this payment."
              : recovery.state === "missing"
                ? "This browser has no matching checkout to confirm."
                : "We’re confirming your payment.";
    reason = !auth.isSignedIn
      ? "Use the account that started checkout. Signing in does not start another purchase."
      : recovery.state === "credited"
        ? "Your verified payment is complete. Your available referral requests are updated."
        : recovery.state === "requires_review"
          ? "Support can check the provider record. Do not pay again for this purchase."
          : recovery.state === "error" || recovery.state === "missing"
            ? "Your payment is not confirmed here. Keep your receipt and contact Support; do not pay again."
            : "We will update your balance only after the server confirms the provider’s payment record. Do not pay again.";
    const needsHelp = recovery.state === "requires_review" || recovery.state === "error" || recovery.state === "missing";
    action = !auth.isLoaded
      ? <GoalButton variant="primary" className="mt-4" disabledReason="Checking sign-in…">Checking sign-in…</GoalButton>
      : !auth.isSignedIn
        ? role === "referrer"
          ? <GoalButton variant="primary" asChild className="mt-4"><Link href={referrerSignInHref(`/premium${search}`)}>Sign in to confirm payment</Link></GoalButton>
          : <GoalButton variant="primary" className="mt-4" onClick={() => auth.openSignIn({ returnTo: `/premium${search}` })}>Sign in to confirm payment</GoalButton>
        : <GoalButton variant="primary" asChild className="mt-4"><Link href={needsHelp ? "/support" : back}>{needsHelp ? "Get help with this payment" : recovery.state === "credited" ? "Use my referral requests" : "Continue"}</Link></GoalButton>;
  } else if (referrerOff) {
    label = REFERRERS_NEVER_PAY;
    reason = "Review referral requests and refer through your company’s process, with nothing to buy.";
    action = <GoalButton variant="primary" asChild className="mt-4"><Link href={back}>Back to referring</Link></GoalButton>;
  }

  return (
    <main data-skipwait-screen="premium" data-goal-page="premium" className="g-scope mx-auto w-full max-w-[760px] bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-8 gdesk:py-8">
      <Link href={back} className={LINK}>Back</Link>
      <h1 className="mt-5 text-g-display text-balance">{GOAL_PAGE.goalLine}</h1>
      <div className="mt-4" role="status"><GoalStatus status={pending && recovery.state !== "credited" ? "waiting" : "queue_new"} label={label} className="whitespace-normal" /></div>
      <div className="mt-6"><GoalNextStep reason={reason}>{action}</GoalNextStep></div>
      {auth.isLoaded && auth.isSignedIn && !referrerOff && !pending ? <section aria-label="Your referral request balance" className="mt-8 border-t border-g-hairline pt-5">
        <h2 className="text-g-heading">Your referral requests</h2>
        {balance.isPending ? <p className="mt-2 text-g-body text-g-ink-2">Checking your balance…</p> : balance.isError || !balance.data ? <div className="mt-2"><p className="text-g-body">Your balance did not load.</p><GoalButton onClick={() => { void balance.refetch(); }}>Retry balance</GoalButton></div> : <>
          <p className="mt-3 text-g-body"><GoalNum>{balance.data.totalAvailable}</GoalNum> referral requests left</p>
          {balance.data.ledger ? <p className="mt-2 text-g-meta text-g-ink-2"><GoalNum>{balance.data.ledger.buckets.purchased}</GoalNum> from purchases, included in your total.</p> : null}
          {balance.data.promoCreditsRemaining ? <p className="mt-2 text-g-meta text-g-ink-2"><GoalNum>{balance.data.promoCreditsRemaining}</GoalNum> additional referral requests already in your balance{balance.data.promoExpiresAt ? <> · ends <GoalNum>{new Date(balance.data.promoExpiresAt).toLocaleDateString("en-US")}</GoalNum></> : null}.</p> : null}
        </>}
      </section> : null}
      <footer className="mt-8 border-t border-g-hairline pt-4">
        <p className="text-g-meta leading-6 text-g-ink-2">{MONEY_SENTENCE_SHORT}</p>
        <div className="mt-3 flex flex-wrap gap-x-5"><Link href="/support" className={LINK}>Contact Support</Link><Link href="/refunds" className={LINK}>Refund policy</Link><Link href="/terms" className={LINK}>Terms</Link></div>
      </footer>
    </main>
  );
}
