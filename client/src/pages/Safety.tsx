import { lazy, Suspense, type ReactNode } from "react";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
const GoalSafety = lazy(() => import("./goal/support/GoalSafety"));
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { MONEY_SENTENCE } from "@shared/moneyCopy";

// Kit v4 /safety (app/src/routes/safety.tsx), answers verbatim from the kit.
// Two kit answers end in a design-preview sentence; those keep the kit's first
// sentence and drop the preview one (the pay answer points at the live Report flow).
// The cost answer is the D-063 money sentence: asking is free only for a monthly allowance.
const ANSWERS: ReadonlyArray<readonly [string, ReactNode]> = [
  ["What does asking for a referral cost?", `${MONEY_SENTENCE} There are no commissions and no paid priority: a referral is a voluntary introduction, not a purchase.`],
  ["Who can see a referrer’s name?", "Referrer names are not public. A name is revealed only to the seeker whose request that referrer has accepted."],
  ["Does a referral guarantee an interview?", "No. A referral, interview, offer, or job is never guaranteed. Employers make their own hiring decisions."],
  ["What does work-email verification mean?", "It confirms ownership of an email address on an approved company domain. It does not prove current employment or employer endorsement."],
  ["When is my resume shared?", "Resumes stay private until a referrer accepts a request."],
  ["What if someone asks me to pay?", <>Do not pay for a referral or share sensitive financial information. Use <Link href="/report" className="text-link">Report</Link> on the conversation — it&rsquo;s confidential.</>],
];

export default function Safety() {
  return goalSurfaceOn("support") ? <Suspense fallback={null}><GoalSafety /></Suspense> : <KitSafety />;
}

function KitSafety() {
  return (
    <main data-skipwait-screen="safety" className="page-content">
      <div className="page-heading">
        <div><span className="eyebrow">TRUST IS THE WHOLE POINT</span><h1>Help &amp; safety<span className="brand-dot">.</span></h1><p>Clear boundaries. Real people. No fine-print surprises.</p></div>
      </div>
      <section className="safety-list" aria-label="Safety questions">
        {ANSWERS.map(([title, answer], index) => (
          <details key={title} open={index === 0}>
            <summary>{title}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
      <section className="employee-band mt-8">
        <span className="band-icon"><ShieldCheck /></span>
        <div><h3>Your next move, on your terms.</h3><p>Explore freely. Share only when you’re ready.</p></div>
        <Button asChild variant="outline"><Link href="/explore">Explore <ArrowUpRight /></Link></Button>
      </section>
    </main>
  );
}
