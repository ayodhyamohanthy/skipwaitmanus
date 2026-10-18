import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { ArrowRight, Check } from "lucide-react";
import { ASK_COST_SENTENCE, CREDIT_RULE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { Button } from "@/components/kit/button";
import { alternatePaymentRoute, browserPaymentRoute, paymentRouteDetails, type PaymentRoute } from "@/lib/paymentRoute";
import { readApiJson } from "@/lib/apiResponse";
import { applySeo } from "@/lib/seo";
import { parseSummary, failureMessage, type CreditSummary } from "@/components/plans/billingApi";
import { CreditCta, CreditsSection, UsagePanel } from "@/components/plans/PlansCredits";
import { FairBand, PlansReference } from "@/components/plans/PlansReference";
import { UpgradeMoments, upgradeMoments } from "@/components/plans/UpgradeMoments";
import { freePlanCard, openRequestsLabel, planLimits } from "@/components/plans/planCatalog";

// D-067 (owner, Oct 18 2026): Pro/Max are removed. Free is the only plan and a
// credit is the only purchase, so this page sells credits and explains the free
// allowance. There is no subscription checkout, no gift checkout and no plan
// comparison to render; a pass catalog comes back here only when D-046 sells it.

const authHeaders = (token: string | null | undefined): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export default function Plans() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const role = params.get("role") === "referrer" ? "referrer" : "job_seeker";
  const { isSignedIn, getToken } = useAuth();
  const [route, setRoute] = useState<PaymentRoute>(() => params.get("currency") === "INR" ? "INR" : params.get("currency") === "USD" ? "USD" : browserPaymentRoute());
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const routeDetails = paymentRouteDetails(route);
  const creditsHref = `/premium?role=${role}`;
  const free = freePlanCard(route);
  const freeLimits = planLimits("free");

  useEffect(() => {
    applySeo({ title: "Plans and credits", description: `${ASK_COST_SENTENCE} ${REFERRER_MONEY_SENTENCE}`, path: "/plans" });
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/credits/summary?role=${role}`, { credentials: "include", headers: authHeaders(await getToken()) });
        const payload = await readApiJson<Record<string, unknown>>(response, "We could not refresh your plan details");
        const parsed = parseSummary(payload);
        if (active && response.ok && parsed) setSummary(parsed);
      } catch {
        // Keep the free allowance and the credit price visible if the account summary retries.
      }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn, role]);

  return <main data-skipwait-screen="plans" className="page-content plans-page">
    <div className="page-heading"><div><span className="eyebrow">PLANS &amp; CREDITS · <Link href="/billing" className="underline">Manage plan</Link></span><h1>Everything starts free<span className="brand-dot">.</span></h1><p>{ASK_COST_SENTENCE} {REFERRER_MONEY_SENTENCE} Credits add asks; queue position never changes.</p></div><CreditCta summary={summary} currency={route} href={creditsHref} /></div>

    <section className="plan-grid individual-plan-grid" aria-label="Your plan">
      <article className="plan-card featured">
        <h2>{free.name}</h2><p className="plan-tag">{free.tagline}</p>
        <div className="plan-price"><strong>{route === "INR" ? "₹0" : "$0"}</strong><span>per month</span></div>
        <ul>{free.features.map(feature => <li key={feature}><Check />{feature}</li>)}</ul>
        <Button asChild className="brand-button"><Link href="/ask">{free.cta}<ArrowRight /></Link></Button>
      </article>
    </section>
    <p className="plan-grid-note">{CREDIT_RULE}</p>
    <p className="plan-grid-note">A credit is charged in {routeDetails.countryLabel === "India" ? "rupees" : "US dollars"}. <button type="button" onClick={() => setRoute(current => alternatePaymentRoute(current))} className="font-semibold text-foreground underline underline-offset-4">Billing from {routeDetails.countryLabel === "India" ? "outside India" : "India"}? {routeDetails.alternateLabel}</button></p>

    <CreditsSection summary={summary} currency={route} creditsHref={creditsHref} />
    {summary ? <UsagePanel summary={summary} /> : null}
    {summary ? <UpgradeMoments moments={upgradeMoments(summary, creditsHref)} /> : null}
    {summary ? <p className="plan-grid-note">{openRequestsLabel(freeLimits.openRequests)} referral requests open at once · {summary.totalAvailable} credit{summary.totalAvailable === 1 ? "" : "s"} available now. <Link href="/billing" className="font-semibold underline underline-offset-4">See your receipts</Link>.</p> : null}
    <FairBand />
    <PlansReference />
  </main>;
}
