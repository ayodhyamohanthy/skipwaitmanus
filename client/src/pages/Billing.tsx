import { ArrowRight } from "lucide-react";
import { LoadingNote } from "@/components/app-states/SystemStates";
import { lazy, Suspense, useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
import { Button } from "@/components/kit/button";
import { Heading, Panel } from "@/components/kit/preview-kit";
import { failureMessage, parseReceipts, parseSummary, type CreditSummary, type Receipt } from "@/components/plans/billingApi";
import { CurrentPlanPanel, PaymentMethodPanel, ReceiptsPanel } from "@/components/plans/BillingPanels";
import { CancelPlanDialog } from "@/components/plans/CancelPlanDialog";

// D-048-p3-plans: the goal surface for /billing (goalSurfaceOn("plans"), dark
// until its release edit). The kit body below stays unchanged for the flag-off
// path, so one page module serves both versions and the money code path is one.
const GoalBilling = lazy(() => import("./goal/plans/GoalBilling"));

const plansAndCredits = <Link href="/plans" className="text-link text-sm">Plans &amp; credits<ArrowRight className="size-4" /></Link>;

export default function Billing() {
  if (goalSurfaceOn("plans")) return <Suspense fallback={null}><GoalBilling /></Suspense>;
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [cancelStep, setCancelStep] = useState<"closed" | "confirm" | "done">("closed");
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

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="billing-sign-in" className="page-content mx-auto max-w-3xl">
        <Heading eyebrow="PLANS & CREDITS" title="Manage plan" aside={plansAndCredits} />
        <Panel>
          <p className="text-sm text-muted-foreground">Sign in to see your plan, payment history, and cancellation options.</p>
          <SignInButton><button type="button" className="brand-button mt-4 inline-flex items-center justify-center bg-primary text-sm text-primary-foreground">Sign in</button></SignInButton>
        </Panel>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="billing" className="page-content mx-auto max-w-3xl">
      <Heading eyebrow="PLANS & CREDITS" title="Manage plan" aside={plansAndCredits} />

      {loading ? <Panel><LoadingNote>Loading billing…</LoadingNote></Panel> : null}
      {!loading && error ? <Panel tone="muted" className="border border-destructive/40"><div role="alert"><strong className="text-destructive">{error}</strong><p className="mt-1 text-sm">Your plan and payments are unchanged. Try again in a moment.</p></div><Button size="sm" className="mt-3" onClick={() => setReloadKey(key => key + 1)}>Try again</Button></Panel> : null}

      {!loading && !error && summary ? (
        <>
          <CurrentPlanPanel summary={summary} onCancel={() => { setCancelError(""); setCancelStep("confirm"); }} />
          <PaymentMethodPanel />
          <ReceiptsPanel receipts={receipts} />
        </>
      ) : null}

      {cancelStep !== "closed" && summary ? <CancelPlanDialog plan={summary.plan} termEnd={summary.subscriptionCurrentTermEnd} step={cancelStep} cancelling={cancelling} error={cancelError} onConfirm={() => { void cancelPlan(); }} onClose={() => setCancelStep("closed")} /> : null}
    </main>
  );
}
