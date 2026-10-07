import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

const ANSWERS = [
  ["Are referrals really free?", "Yes. No payments between job seekers and referrers, no commissions, and no paid priority. A referral is a voluntary introduction, not a purchase."],
  ["Who can see a referrer's name?", "Referrer names are not public. A name is revealed only to the seeker whose request that referrer has accepted."],
  ["Does a referral guarantee an interview?", "No. A referral, interview, offer, or job is never guaranteed. Employers make their own hiring decisions."],
  ["What does work-email verification mean?", "It confirms a one-time code reached an inbox on that company domain. It does not prove current employment, a role, or employer endorsement."],
  ["When is my resume shared?", "Only with a referrer who accepted your request — never before, never publicly."],
  ["What if someone asks me to pay?", "Do not pay for a referral or share financial details. Contact support and we will review it."],
];

export default function Safety() {
  return (
    <main data-skipwait-screen="safety" className="page-content">
      <div className="page-heading">
        <div><span className="eyebrow">Trust is the whole point</span><h1>Help &amp; safety<span className="brand-dot">.</span></h1><p>Clear boundaries. Real people. No fine-print surprises.</p></div>
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
        <div><h3>Your next move, on your terms.</h3><p>Explore freely. Share only when you&apos;re ready.</p></div>
        <Link href="/explore" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Explore <ArrowUpRight /></Link>
      </section>
      <div className="trust-row"><span><ShieldCheck />Free. Always.</span><span>Private by default</span></div>
    </main>
  );
}
