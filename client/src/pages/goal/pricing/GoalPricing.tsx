// The goal /pricing page (D-048 phase 3, row D-048-p3-pricing; packet
// docs/plans/D-048-money.md). Pricing.tsx switches here when
// goalSurfaceOn("pricing") is true.
//
// Rules this page keeps (packet §2, §4, §7):
// - Public, prerendered and fetch-free: GoalStaticFrame and plain markup only,
//   no auth, no query, no router state (D-048-F-static-frame). Every link is a
//   plain <a>, so the prerendered HTML and the SPA agree.
// - Every price claim is the kit page's, sourced and never retyped: plan names
//   and founding prices from shared/planFamily.ts, the referrer money sentence
//   from shared/moneyCopy.ts. Nothing here prices a pack, sells a pass or
//   enables a pricing flag (D-219, D-146, D-123); checkout stays off as the
//   kit page says.
// - Referral-only wording (D-173, D-180): no "credit"/"credits" and no noun
//   "ask" on screen; a bought balance is never a guaranteed referral.
// - One black commit, in "Your next step": "See plans and prices" -> /plans.
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { GoalStaticFrame } from "@/components/goal/GoalStaticFrame";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalBreadcrumbs } from "@/pages/goal/policy/GoalPolicyPage";
import { money } from "@/components/plans/format";
import { applySeo } from "@/lib/seo";
import { publicRoute } from "@shared/publicRoutes";
import { PLAN_FAMILY, planFeeMinor } from "@shared/planFamily";
import { ASK_COST_SENTENCE, CREDIT_RULE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";

export const GOAL_PAGE = { goalLine: "Know what a referral request costs." } as const;

const PATH = "/pricing";
const LINK = "font-medium text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink";

function Plans() {
  return (
    <section aria-labelledby="goal-pricing-plans" className="grid gap-3">
      <h2 id="goal-pricing-plans" className="text-g-heading text-g-ink">Plans</h2>
      <p className="text-g-meta text-g-ink-2">Founding prices, a month. Each plan includes monthly referrals inside its band.</p>
      <div className="grid gap-3 gdesk:grid-cols-3">
        {PLAN_FAMILY.map(plan => (
          <article key={plan.id} className="border border-g-hairline bg-g-surface p-5">
            <h3 className="text-g-label text-g-ink">{plan.label}</h3>
            <dl className="mt-3 grid gap-2">
              <div>
                <dt className="text-g-meta text-g-ink-3">India</dt>
                <dd className="font-g-mono text-g-heading text-g-ink">{money(planFeeMinor(plan.id, "INR"), "INR")}</dd>
              </div>
              <div>
                <dt className="text-g-meta text-g-ink-3">Everywhere else</dt>
                <dd className="font-g-mono text-g-heading text-g-ink">{money(planFeeMinor(plan.id, "USD"), "USD")}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <p className="text-g-meta text-g-ink-2">
        Extra referrals are priced per referrer level with volume discounts; the full list is on the plans page. Checkout is not switched on yet; the old referral packs are paused, and referral requests already bought still work.
      </p>
    </section>
  );
}

export default function GoalPricing() {
  const route = publicRoute(PATH);
  useEffect(() => {
    // The same title, description and canonical PolicyPageShell sets for /pricing.
    if (route) applySeo({ title: route.title, description: route.description, path: PATH });
  }, [route]);
  return (
    <div data-goal-page="pricing" data-skipwait-screen="pricing">
      <GoalStaticFrame>
        <div className="grid gap-6">
          <GoalBreadcrumbs path={PATH} />
          <section>
            <p className="text-g-meta text-g-ink-3">Pricing</p>
            <h1 className="mt-1 text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
            <p className="mt-2 max-w-xl text-g-meta text-g-ink-2">Prices are in Indian rupees (INR) for India and US dollars (USD) everywhere else. The price you pay is shown before checkout.</p>
          </section>
          <section aria-labelledby="goal-pricing-free" className="border border-g-hairline bg-g-surface p-5">
            <h2 id="goal-pricing-free" className="text-g-heading text-g-ink">Free</h2>
            <p className="mt-2 text-g-body text-g-ink">3 free referrals a month at any level with a verified card; no carry-forward.</p>
            <p className="mt-1 text-g-meta text-g-ink-2">{REFERRER_MONEY_SENTENCE}</p>
          </section>
          <GoalNextStep reason="Compare the plans, what each includes and the extra referral prices before you choose.">
            <GoalButton asChild variant="primary" touch="large" className="mt-4 w-full gdesk:w-auto">
              <a href="/plans">See plans and prices <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} /></a>
            </GoalButton>
          </GoalNextStep>
          <Plans />
          <section aria-labelledby="goal-pricing-balance" className="grid gap-2">
            <h2 id="goal-pricing-balance" className="text-g-heading text-g-ink">How referral requests use your balance</h2>
            <p className="text-g-meta text-g-ink-2">{ASK_COST_SENTENCE}</p>
            <p className="text-g-meta text-g-ink-2">{CREDIT_RULE}</p>
          </section>
          <section aria-labelledby="goal-pricing-payment" className="grid gap-2">
            <h2 id="goal-pricing-payment" className="text-g-heading text-g-ink">Payment</h2>
            <p className="text-g-meta text-g-ink-2">
              Payments are processed securely by our payment providers (Razorpay for INR, PayPal for USD) through Chargebee. Everything is delivered digitally: referral requests are added to your account once the payment provider confirms the payment; see <a href="/shipping" className={LINK}>Shipping &amp; delivery</a>.
            </p>
          </section>
          <section aria-labelledby="goal-pricing-employers" className="grid gap-2">
            <h2 id="goal-pricing-employers" className="text-g-heading text-g-ink">Employers</h2>
            <p className="text-g-meta text-g-ink-2">
              Everything above prices the job-seeker and employee side. Companies pay separately to sponsor roles and unlock anonymized opt-in talent; see <a href="/employer" className={LINK}>Hire on skipwait.me</a>.
            </p>
          </section>
        </div>
      </GoalStaticFrame>
    </div>
  );
}
