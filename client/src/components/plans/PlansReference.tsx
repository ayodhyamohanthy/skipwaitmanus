// Kit v4 lower /plans sections: the fairness band, the referrers-free band and
// straight answers. D-067 removed the Pro/Max compare table with the plans.
import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { fairnessRules, planFaqs } from "./planCatalog";

export function FairBand() {
  return <section className="fair-band" aria-label="Fairness promise"><ShieldCheck /><ul>{fairnessRules.map(rule => <li key={rule}><Check />{rule}</li>)}</ul></section>;
}

export function PlansReference() {
  return <>
    <section className="plans-section referrer-free"><Sparkles /><div><h2>Referrers: never charged, never paid.</h2><p>Open your door, keep your capacity and build a verified impact record. Referrers never pay to review requests.</p></div><Button asChild variant="outline" className="brand-button"><Link href="/referrer">Referrer workspace <ArrowRight /></Link></Button></section>

    <section className="plans-section"><span className="eyebrow">QUESTIONS</span><h2>Straight answers</h2><div className="safety-list">{planFaqs().map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

    <p className="design-note flex flex-wrap gap-x-4"><Link href="/refunds">Refund &amp; cancellation policy</Link><Link href="/for-companies">Hiring? See skipwait.me for companies</Link></p>
  </>;
}
