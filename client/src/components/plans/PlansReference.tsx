// Kit v4 lower /plans sections: fairness band, side-by-side compare, referrers-free
// band and straight answers — all stated against the live Free / Pro / Max catalog.
import { ArrowRight, Check, ShieldCheck, Sparkles, X } from "lucide-react";
import { Link } from "wouter";
import type { SubscriptionCurrency } from "@shared/subscriptionPlans";
import { Button } from "@/components/kit/button";
import { compareRows, fairnessRules, planFaqs, type CompareValue } from "./planCatalog";

function Cell({ v }: { v: CompareValue }) {
  return typeof v === "string" ? <span>{v}</span> : v ? <Check className="ok" aria-label="Included" /> : <X className="no" aria-label="Not included" />;
}

export function FairBand() {
  return <section className="fair-band" aria-label="Fairness promise"><ShieldCheck /><ul>{fairnessRules.map(rule => <li key={rule}><Check />{rule}</li>)}</ul></section>;
}

export function PlansReference({ currency }: { currency: SubscriptionCurrency }) {
  return <>
    <section className="plans-section" id="compare"><span className="eyebrow">SIDE BY SIDE</span><h2>Compare every individual plan</h2>
      <div className="compare-wrap wide"><table className="compare-table plan-compare"><thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Pro</th><th scope="col">Max</th></tr></thead>
        <tbody>{compareRows(currency).map(([feature, ...values]) => <tr key={feature}><th scope="row">{feature}</th>{values.map((value, index) => <td key={`${feature}-${index}`}><Cell v={value} /></td>)}</tr>)}</tbody>
      </table></div>
    </section>

    <section className="plans-section referrer-free"><Sparkles /><div><h2>Referrers: always free.</h2><p>Open your door, keep your capacity and build a verified impact record. Referrers never pay to review requests.</p></div><Button asChild variant="outline" className="brand-button"><Link href="/referrer">Referrer workspace <ArrowRight /></Link></Button></section>

    <section className="plans-section"><span className="eyebrow">QUESTIONS</span><h2>Straight answers</h2><div className="safety-list">{planFaqs().map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

    <p className="design-note flex flex-wrap gap-x-4"><Link href="/refunds">Refund &amp; cancellation policy</Link><Link href="/for-companies">Hiring? See SkipWait for companies</Link></p>
  </>;
}
