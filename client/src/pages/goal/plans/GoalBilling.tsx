// Goal /billing (D-048-p3-plans, D-048-money.md §4): the seeker's plan, their
// referral-request balance, honest payment facts and settled receipts, around
// one next step. `goalSurfaceOn("plans")` switches Billing.tsx here; /plans
// stays on its own frozen path and nothing here enables a price or a purchase
// path (D-042, D-123, D-146). The summary and receipts contracts are the live
// ones in components/plans/billingApi.ts, imported read-only.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalNextStep, GoalSkeletonRows, useOnlineStatus } from "@/components/goal";
import { failureMessage, parseReceipts, parseSummary, type CreditSummary, type Receipt } from "@/components/plans/billingApi";
import { kitDate } from "@/components/plans/format";
import { activePaidPlan } from "@/components/plans/planCatalog";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { billingPlanLabel } from "@shared/billingCatalog";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import { GoalCancelDialog } from "./GoalCancelDialog";
import { BalanceSection, PaymentMethodSection, PlanSection, ReceiptsSection } from "./GoalBillingPanels";

export const GOAL_PAGE = { goalLine: "Manage your plan and referral requests." } as const;

type CancelStep = "closed" | "confirm" | "done";

const SEE_PLANS = "See plans and prices";
const FRAME = "g-scope mx-auto w-full max-w-[920px] bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-8 gdesk:py-8";

function Frame({ status, children }: { status?: string; children: ReactNode }) {
  return (
    <main data-skipwait-screen="billing" data-goal-page="plans" className={FRAME}>
      <header>
        <h1 className="text-balance text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
        {status ? (
          <p className="mt-2 flex items-center gap-2 text-g-meta text-g-ink-2">
            <span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-g-ink" />
            <span>{status}</span>
          </p>
        ) : null}
      </header>
      {children}
    </main>
  );
}

export default function GoalBilling() {
  const { isLoaded, isSignedIn, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [cancelStep, setCancelStep] = useState<CancelStep>("closed");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setLoading(true); setError("");
    void (async () => {
      try {
        const token = await fetchToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const [summaryResponse, receiptsResponse] = await Promise.all([
          fetch("/api/credits/summary?role=job_seeker", { credentials: "include", headers }),
          fetch("/api/billing/receipts?role=job_seeker", { credentials: "include", headers }),
        ]);
        const summaryPayload = await readApiJson<Record<string, unknown>>(summaryResponse, "We could not load your plan");
        const receiptsPayload = await readApiJson<Record<string, unknown>>(receiptsResponse, "We could not load your receipts");
        if (!active) return;
        const parsedSummary = parseSummary(summaryPayload);
        const parsedReceipts = parseReceipts(receiptsPayload);
        if (!summaryResponse.ok || !parsedSummary) throw new Error("We could not load your plan");
        if (!receiptsResponse.ok || !parsedReceipts) throw new Error("We could not load your receipts");
        setSummary(parsedSummary);
        setReceipts(parsedReceipts);
      } catch (reason) { if (active) setError(failureMessage(reason, "We could not load billing")); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [fetchToken, isSignedIn, reloadKey]);

  const reload = () => setReloadKey(key => key + 1);

  const cancelPlan = async () => {
    setCancelling(true); setCancelError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/chargebee/subscription-cancel", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ role: "job_seeker" }) });
      const payload = await readApiJson<{ currentTermEnd?: string; error?: string }>(response, "We could not schedule your cancellation");
      if (!response.ok) throw new Error(payload.error || "We could not schedule your cancellation");
      setSummary(current => current ? { ...current, subscriptionStatus: "non_renewing", subscriptionCurrentTermEnd: payload.currentTermEnd ?? current.subscriptionCurrentTermEnd } : current);
      setCancelStep("done");
    } catch (reason) { setCancelError(failureMessage(reason, "We could not schedule your cancellation")); }
    finally { setCancelling(false); }
  };

  if (!isLoaded) {
    return <Frame><div className="mt-6"><GoalSkeletonRows density="queue" count={3} className="px-0" /></div></Frame>;
  }

  if (!isSignedIn) {
    return (
      <Frame>
        <div className="mt-6">
          <GoalNextStep reason="Sign in to see your plan, payment history and cancellation options.">
            <GoalButton variant="primary" touch="large" onClick={() => openSignIn()}>Sign in</GoalButton>
          </GoalNextStep>
        </div>
      </Frame>
    );
  }

  const paidPlan = activePaidPlan(summary);
  const renewing = paidPlan !== null && summary?.subscriptionStatus === "active";
  const planLabel = paidPlan && summary ? billingPlanLabel(summary.plan) : "Free plan";
  const termEnd = summary?.subscriptionCurrentTermEnd ? kitDate(summary.subscriptionCurrentTermEnd) : null;
  const status = !paidPlan
    ? "Free plan"
    : `${planLabel} · ${renewing ? "Renews" : "Ends"} ${termEnd ?? (renewing ? "with the plan cycle" : "at the end of this paid cycle")}`;
  const outOfRequests = (summary?.totalAvailable ?? 0) <= 0;
  const nextHref = outOfRequests && CREDIT_PACKS_ON_SALE ? "/premium?role=job_seeker" : "/plans";
  const nextLabel = outOfRequests && CREDIT_PACKS_ON_SALE ? "Get more referral requests" : SEE_PLANS;
  const reason = error
    ? "Nothing changed on your plan or payments. Try again in a moment."
    : outOfRequests
      ? "You have no referral requests left. Add more before you send another request."
      : renewing
        ? `Your plan renews ${termEnd ? `on ${termEnd}` : "at the end of this cycle"}. Compare plans before then.`
        : paidPlan
          ? `Your plan ends ${termEnd ? `on ${termEnd}` : "at the end of this paid cycle"}. Nothing else is charged.`
          : "Your plan is Free. Compare plans before you change anything.";
  const dialogOpen = cancelStep !== "closed";

  return (
    <Frame status={summary ? status : undefined}>
      {!online ? <p className="mt-3 text-g-meta text-g-ink-2">You are offline. This page will not update until you are back online.</p> : null}

      <div className="mt-6">
        <GoalNextStep reason={reason}>
          {error ? (
            <GoalButton variant="primary" touch="large" onClick={reload}>Try again</GoalButton>
          ) : (
            <GoalButton variant={dialogOpen ? "ghost" : "primary"} touch="large" asChild><Link href={nextHref}>{nextLabel}</Link></GoalButton>
          )}
        </GoalNextStep>
      </div>

      {loading ? <div className="mt-6"><GoalSkeletonRows density="queue" count={3} className="px-0" /></div> : null}

      {error ? (
        <div role="alert" className="mt-6 border border-g-hairline p-4 gdesk:p-5">
          <p className="text-g-label text-g-ink">{error}</p>
          <p className="mt-1 text-g-meta text-g-ink-2">Your plan and payments are unchanged.</p>
        </div>
      ) : null}

      {summary ? (
        <>
          <BalanceSection summary={summary} />
          <PlanSection summary={summary} onCancelRenewal={renewing ? () => { setCancelError(""); setCancelStep("confirm"); } : null} />
          <PaymentMethodSection />
          <ReceiptsSection receipts={receipts} />
        </>
      ) : null}

      {summary && dialogOpen ? (
        <GoalCancelDialog
          planLabel={planLabel}
          termEnd={summary.subscriptionCurrentTermEnd}
          step={cancelStep === "done" ? "done" : "confirm"}
          cancelling={cancelling}
          error={cancelError}
          onConfirm={() => { void cancelPlan(); }}
          onClose={() => setCancelStep("closed")}
        />
      ) : null}
    </Frame>
  );
}
