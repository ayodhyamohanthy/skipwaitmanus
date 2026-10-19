import { ArrowRight } from "lucide-react";
import { LoadingNote } from "@/components/app-states/SystemStates";
import { useEffect, useRef, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { Button } from "@/components/kit/button";
import { Heading, Panel } from "@/components/kit/preview-kit";
import { failureMessage, parsePaymentMethods, parseReceipts, parseSummary, type CreditSummary, type PaymentMethods, type Receipt } from "@/components/plans/billingApi";
import { CurrentPlanPanel, PaymentMethodNudge, PaymentMethodPanel, ReceiptsPanel } from "@/components/plans/BillingPanels";
import { CancelPlanDialog } from "@/components/plans/CancelPlanDialog";

const comparePlans = <Link href="/plans" className="text-link text-sm">Compare plans<ArrowRight className="size-4" /></Link>;

/** The prompt stays closed once dismissed; the panel below it keeps saying the same thing. */
const NUDGE_DISMISSED_KEY = "skipwait.billing.payment-method-nudge.dismissed";

function nudgeDismissed(): boolean {
  try { return window.localStorage.getItem(NUDGE_DISMISSED_KEY) === "1"; } catch { return false; }
}

export default function Billing() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [methods, setMethods] = useState<PaymentMethods | null>(null);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [methodsError, setMethodsError] = useState("");
  const [managing, setManaging] = useState(false);
  const [dismissed, setDismissed] = useState(nudgeDismissed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [cancelStep, setCancelStep] = useState<"closed" | "confirm" | "done">("closed");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  // Reading the methods is what confirms the card, and the two loads run in
  // parallel, so the summary can land still saying "no card" right after the
  // member saved one. When that happens, re-read the credits exactly once.
  const summaryRef = useRef<CreditSummary | null>(null);
  const refetchedForCard = useRef(false);
  useEffect(() => { summaryRef.current = summary; }, [summary]);

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

  // Saved methods come from the provider, so this load is kept separate: a
  // provider outage must not blank the plan and receipts the server already gave
  // us. Reading it is also what confirms the "payment method on file" fact.
  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setMethodsLoading(true); setMethodsError("");
    void (async () => {
      try {
        const token = await fetchToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetch("/api/billing/payment-methods?role=job_seeker", { credentials: "include", headers });
        const payload = await readApiJson<Record<string, unknown>>(response, "We could not load your payment methods");
        if (!active) return;
        const parsed = parsePaymentMethods(payload);
        if (!response.ok || !parsed) throw new Error(typeof payload.error === "string" ? payload.error : "We could not load your payment methods");
        setMethods(parsed);
        // The provider just told us there is a card, but the summary we already
        // rendered may predate that fact: re-read it so the credits it unlocks
        // appear without a manual refresh. Once only, so this cannot loop; a
        // summary that has not landed yet counts as stale, and its in-flight
        // response is discarded by the effect cleanup when reloadKey moves.
        if (!refetchedForCard.current && parsed.methods.length > 0 && !summaryRef.current?.paymentMethodOnFile) {
          refetchedForCard.current = true;
          setReloadKey(key => key + 1);
        }
      } catch (reason) { if (active) setMethodsError(failureMessage(reason, "We could not load your payment methods")); }
      finally { if (active) setMethodsLoading(false); }
    })();
    return () => { active = false; };
  }, [fetchToken, isSignedIn, reloadKey]);

  const startPaymentMethodSession = async () => {
    setManaging(true); setMethodsError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/billing/payment-methods/session?role=job_seeker", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ returnTo: "methods" }) });
      const payload = await readApiJson<{ url?: string; error?: string }>(response, "We could not open the secure card page");
      if (!response.ok || !payload.url) throw new Error(payload.error || "We could not open the secure card page");
      // Leaving the app: the hosted page returns to /billing, which reloads and
      // re-reads both the methods and the credits this card unlocks.
      window.location.assign(payload.url);
    } catch (reason) {
      setMethodsError(failureMessage(reason, "We could not open the secure card page"));
      setManaging(false);
    }
  };

  const dismissNudge = () => {
    setDismissed(true);
    try { window.localStorage.setItem(NUDGE_DISMISSED_KEY, "1"); } catch { /* private mode: the panel still shows it */ }
  };

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
        <Heading eyebrow="PLANS & CREDITS" title="Manage plan" aside={comparePlans} />
        <Panel>
          <p className="text-sm text-muted-foreground">Sign in to see your plan, payment history, and cancellation options.</p>
          <SignInButton><button type="button" className="brand-button mt-4 inline-flex items-center justify-center bg-primary text-sm text-primary-foreground">Sign in</button></SignInButton>
        </Panel>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="billing" className="page-content mx-auto max-w-3xl">
      <Heading eyebrow="PLANS & CREDITS" title="Manage plan" aside={comparePlans} />

      {loading ? <Panel><LoadingNote>Loading billing…</LoadingNote></Panel> : null}
      {!loading && error ? <Panel tone="muted" className="border border-destructive/40"><div role="alert"><strong className="text-destructive">{error}</strong><p className="mt-1 text-sm">Your plan and payments are unchanged. Try again in a moment.</p></div><Button size="sm" className="mt-3" onClick={() => setReloadKey(key => key + 1)}>Try again</Button></Panel> : null}

      {!loading && !error && summary ? (
        <>
          {!summary.paymentMethodOnFile && !dismissed ? <PaymentMethodNudge onAdd={() => { void startPaymentMethodSession(); }} onDismiss={dismissNudge} adding={managing} /> : null}
          <CurrentPlanPanel summary={summary} onCancel={() => { setCancelError(""); setCancelStep("confirm"); }} />
          <PaymentMethodPanel methods={methods} loading={methodsLoading} error={methodsError} adding={managing} onManage={() => { void startPaymentMethodSession(); }} />
          <ReceiptsPanel receipts={receipts} />
        </>
      ) : null}

      {cancelStep !== "closed" && summary ? <CancelPlanDialog plan={summary.plan} termEnd={summary.subscriptionCurrentTermEnd} step={cancelStep} cancelling={cancelling} error={cancelError} onConfirm={() => { void cancelPlan(); }} onClose={() => setCancelStep("closed")} /> : null}
    </main>
  );
}
