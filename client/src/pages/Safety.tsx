import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

/**
 * Kit v4 `/safety` (screens/web/27_safety__default.png,
 * app/src/routes/safety.tsx).
 *
 * Built on kit tokens rather than the kit's bespoke `.safety-list` /
 * `.employee-band` classes, which are not part of this repository's token
 * layer. The kit's "DESIGN PREVIEW" footnote is not shipped.
 *
 * The last answer is rewritten for production. The kit says "Reporting and
 * support channels must be connected before the platform launches" — that was
 * true when the kit was authored and is no longer: /report, blocking and the
 * 4h/48h review SLA shipped in d7506a7a, so the page now points at them
 * instead of disclaiming their absence. Shipping the preview sentence would
 * tell users a working safety channel does not exist.
 */

const ANSWERS = [
  ["Are referrals really free?", "Yes. No payments between job seekers and referrers, no commissions, and no paid priority. A referral is a voluntary introduction, not a purchase."],
  ["Who can see a referrer's name?", "Referrer names are not public. A name is revealed only to the seeker whose request that referrer has accepted."],
  ["Does a referral guarantee an interview?", "No. A referral, interview, offer, or job is never guaranteed. Employers make their own hiring decisions."],
  ["What does work-email verification mean?", "It confirms ownership of an email address on an approved company domain. It does not prove current employment or employer endorsement."],
  ["When is my resume shared?", "Your resume stays private until a referrer accepts your request. Nothing is sent to a company until you choose to share it."],
  ["What if someone asks me to pay?", "Do not pay for a referral or share sensitive financial information. Report it — reports are confidential, you can block the person at the same time, and a person reviews it."],
] as const;

export default function Safety() {
  return (
    <main data-skipwait-screen="safety" className="page-content mx-auto max-w-2xl">
      <p className="eyebrow text-muted-foreground">Trust is the whole point</p>
      <h1 className="mt-3 text-4xl font-semibold">
        Help &amp; safety<span className="text-primary">.</span>
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Clear boundaries. Real people. No fine-print surprises.</p>

      <div className="mt-8 grid gap-2">
        {ANSWERS.map(([question, answer], index) => (
          <details key={question} open={index === 0} className="rounded-lg border border-border bg-background p-4">
            <summary className="cursor-pointer text-sm font-semibold">{question}</summary>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{answer}</p>
          </details>
        ))}
      </div>

      <section className="mt-8 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted p-5">
        <ShieldCheck className="size-7 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Your next move, on your terms.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Explore freely. Share only when you're ready.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/report" className="inline-flex min-h-11 items-center rounded-lg border border-foreground bg-background px-5 text-sm font-semibold">Report something</Link>
          <Link href="/jobs" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Explore <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
