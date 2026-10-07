import { ArrowRight, ArrowUpRight, Menu, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SignInButton, useAuth } from "@/_core/auth";
import { applySeo, faqJsonLd } from "@/lib/seo";
import { FREE_MONTHLY_ALLOWANCE } from "@shared/subscriptionPlans";
import {
  LANDING_COMMITMENTS,
  LANDING_EMPLOYEE_STEPS,
  LANDING_EMPLOYER_LINK,
  LANDING_EXPLORE,
  LANDING_FAQ,
  LANDING_FAQ_HEADING,
  LANDING_GUIDES,
  LANDING_H1,
  LANDING_SEEKER_STEPS,
  LANDING_SUMMARY,
  LANDING_TITLE,
} from "@shared/landingContent";

/**
 * The public landing page ("Scoreboard" world — see DESIGN.md).
 *
 * The referral is treated as live proof rather than a promise: an ink masthead
 * with a stamp mark, a wire strip of real counts, and a ledger that shows what
 * actually happens to one request. Every number on the page comes from the
 * product or from @shared/landingContent; nothing here states an outcome the
 * product does not produce.
 */
const PUBLIC_NAV = [
  { href: "/jobs", label: "Browse roles" },
  { href: "/wall", label: "Internal openings" },
  { href: "/support", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" },
];

const MONEY_LINE = `${FREE_MONTHLY_ALLOWANCE} referral requests are free every month · extra credits cost $1 each (₹99 in India) and never expire`;

/** The request ledger: what a visitor is actually buying into, state by state. */
const LEDGER_ROWS = [
  {
    index: "01",
    title: "Posted",
    stamp: "You",
    note: "One role link, your resume, and a short note about your fit. The employer is identified from the link before anyone is notified.",
  },
  {
    index: "02",
    title: "Reviewed in private",
    stamp: "Employees only",
    note: "Only people who verified a work email at that company can open the request. Your contact details stay hidden from every reviewer.",
  },
  {
    index: "03",
    title: "Decided",
    stamp: "One answer",
    note: "An employee makes the introduction, or passes it on so someone else can decide. You can withdraw an unclaimed request at any time.",
  },
];

function StampMark({ className = "border-ink text-ink" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center border-[1.5px] ${className}`}>
      <ArrowUpRight className="size-5" />
    </span>
  );
}

function StepRail({ label, steps, close }: { label: string; steps: readonly { title: string; body: string }[]; close: string }) {
  return (
    <div>
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[.2em] text-fog">{label}</h2>
      <ol className="mt-5 border-t border-ink/20">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-5 border-b border-ink/20 py-4">
            <span className="tnum mt-1 font-mono text-[11px] font-bold text-signal">{`0${index + 1}`}</span>
            <div>
              <p className="font-display text-xl uppercase leading-none text-ink">{step.title}</p>
              <p className="mt-2 text-sm leading-6 text-fog">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[.14em] text-fog">{close}</p>
    </div>
  );
}

export default function Home() {
  const [, go] = useLocation();
  const { isSignedIn } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [acceptedReferrals, setAcceptedReferrals] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/referral-impact").then(response => response.json()).then(payload => {
      if (active && typeof payload.acceptedReferrals === "number" && payload.acceptedReferrals > 0) setAcceptedReferrals(Math.floor(payload.acceptedReferrals));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    // Per-route metadata: the shell ships one <head>, so without this the home
    // route keeps whatever title the last visited screen set.
    applySeo({ title: LANDING_TITLE, description: LANDING_SUMMARY, path: "/", jsonLd: faqJsonLd(LANDING_FAQ) });
  }, []);
  // The crawler snapshot prints LANDING_H1 verbatim; the visible headline is the
  // same words set in the world's display face, with the signal period added.
  const headline = LANDING_H1.replace(/\.$/, "");
  return <div className="min-h-dvh bg-paper text-ink">
    <a href="#landing-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-ink focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:font-semibold">Skip to content</a>
    <header className="sticky top-0 z-40 bg-ink text-paper">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link href="/" className="flex min-h-11 items-center gap-2.5" aria-label="skipwait.me home">
          <StampMark className="border-paper/50 text-paper" />
          <span className="font-display text-2xl uppercase tracking-[.01em]">skipwait.me</span>
        </Link>
        <nav className="hidden items-center gap-7 font-mono text-[11px] uppercase tracking-[.16em] lg:flex" aria-label="Public navigation">
          {PUBLIC_NAV.map(link => <Link key={link.href} href={link.href} className="flex min-h-11 items-center text-paper/80 hover:text-paper">{link.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <SignInButton><button type="button" className="min-h-11 border border-paper/50 px-4 font-mono text-[11px] uppercase tracking-[.16em] text-paper transition-colors hover:bg-paper hover:text-ink">Sign in</button></SignInButton>
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open navigation menu" className="grid size-11 place-items-center border border-paper/50 text-paper transition-colors hover:bg-paper hover:text-ink lg:hidden"><Menu className="size-5" /></button>
        </div>
      </div>
      {/* Wire strip: the only counts on the page, all of them real. */}
      <div className="border-t border-paper/20">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-7 gap-y-1 px-5 py-2 font-mono text-[11px] uppercase tracking-[.14em] text-paper/70 sm:px-8">
          <span>Private referrals</span>
          <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" aria-hidden="true" />Identity hidden</span>
          {acceptedReferrals ? <span className="tnum wire-count text-paper">{`${acceptedReferrals.toLocaleString()} referral requests accepted on skipwait.me · participants stay private.`}</span> : null}
          <span className="tnum">{FREE_MONTHLY_ALLOWANCE} free every month</span>
        </div>
      </div>
    </header>
    {isSignedIn ? <nav className="border-b border-ink/20 bg-paper-dim" aria-label="Your workspace"><div className="mx-auto flex max-w-[1280px] flex-wrap gap-2 px-5 py-2 sm:px-8">
      {[{ path: "/requests", label: "My requests" }, { path: "/inbox", label: "My company inbox" }, { path: "/wall", label: "Internal openings" }].map(item => <button key={item.path} type="button" onClick={() => go(item.path)} className="min-h-11 border border-ink px-3 font-mono text-[11px] uppercase tracking-[.16em] text-ink transition-colors hover:bg-ink hover:text-paper">{item.label}</button>)}
    </div></nav> : null}
    <main id="landing-main">
      {/* First viewport: display headline, one line of proof, two role plates. */}
      <section className="border-b border-ink/20">
        <div className="mx-auto max-w-[1280px] px-5 pt-10 pb-10 sm:px-8 sm:pt-16 sm:pb-14">
          <p className="font-mono text-[11px] uppercase tracking-[.22em] text-signal">Private referrals from verified employees</p>
          <h1 className="display mt-5 text-[clamp(46px,10.4vw,124px)]">{headline}<span className="text-signal">.</span></h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-fog">{LANDING_SUMMARY}</p>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 sm:gap-4">
            <button type="button" onClick={() => go("/start")} className="group flex min-h-16 items-center justify-between gap-4 bg-ink px-5 text-left text-paper transition-colors hover:bg-ink-soft">
              <span className="font-display text-2xl uppercase leading-none">I need a referral</span>
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => go("/referrer")} className="group flex min-h-16 items-center justify-between gap-4 border-[1.5px] border-ink px-5 text-left text-ink transition-colors hover:bg-ink hover:text-paper">
              <span className="font-display text-2xl uppercase leading-none">I can refer someone</span>
              <ArrowUpRight className="size-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </button>
          </div>
          <p className="tnum mt-4 font-mono text-[11px] leading-5 text-fog">{MONEY_LINE}.</p>
        </div>
      </section>
      {/* Numbered sequences: the two roles, instruction-plate style. */}
      <section aria-label="Referral steps" className="border-b border-ink/20 bg-paper-dim">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-2 lg:gap-16">
          <StepRail label="For job seekers" steps={LANDING_SEEKER_STEPS} close="Three steps. One request. No public feed." />
          <StepRail label="For employees" steps={LANDING_EMPLOYEE_STEPS} close="Review on your phone, in minutes. Passing is always allowed." />
        </div>
      </section>
      {/* The ledger: the mechanism shown as an artifact, not a promise. */}
      <section className="border-b border-ink/20">
        <div className="mx-auto max-w-[1280px] px-5 py-14 sm:px-8 sm:py-20">
          <h2 className="display text-[clamp(34px,5.2vw,64px)]">One request.<br />Real people, in private.</h2>
          <p className="mt-5 max-w-xl text-sm leading-6 text-fog">Every request moves through the same states. Reviewers are verified employees of the company behind the link, the decision belongs to one of them, and nothing about it is ever public.</p>
          <div className="mt-10 border-[1.5px] border-ink">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-ink bg-ink px-4 py-2.5 text-paper">
              <span className="font-mono text-[11px] font-bold uppercase tracking-[.18em]">Request ledger</span>
              <span className="font-mono text-[11px] uppercase tracking-[.18em] text-paper/70">Sample sequence</span>
            </div>
            <ol>
              {LEDGER_ROWS.map(row => <li key={row.index} className="flex flex-wrap items-start gap-x-6 gap-y-2 border-b border-ink/20 px-4 py-5 last:border-b-0 sm:flex-nowrap">
                <span className="tnum font-mono text-[11px] font-bold text-signal">{row.index}</span>
                <span className="min-w-[9rem] font-display text-2xl uppercase leading-none">{row.title}</span>
                <span className="order-last w-full text-sm leading-6 text-fog sm:order-none sm:w-auto sm:flex-1">{row.note}</span>
                <span className="border border-ink px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-ink">{row.stamp}</span>
              </li>)}
            </ol>
          </div>
        </div>
      </section>
      {/* Commitments: ink block, one signal line. */}
      <section className="bg-ink text-paper">
        <div className="mx-auto grid max-w-[1280px] items-start gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <h2 className="display text-[clamp(40px,7.4vw,96px)]">A careful yes.<br />An easy no.<br /><span className="text-signal">Your choice.</span></h2>
          <div className="grid gap-6">
            {LANDING_COMMITMENTS.map(commitment => <div key={commitment.title} className="border-t border-paper/25 pt-4">
              <h3 className="font-display text-2xl uppercase leading-none">{commitment.title}</h3>
              <p className="mt-2 text-sm leading-6 text-paper/70">{commitment.body}</p>
            </div>)}
          </div>
        </div>
      </section>
      {/* Pre-signup questions, answered in visible copy and FAQ structured data. */}
      <section aria-labelledby="landing-faq-heading" className="border-b border-ink/20">
        <div className="mx-auto max-w-[1280px] px-5 py-14 sm:px-8 sm:py-20">
          <h2 id="landing-faq-heading" className="display text-[clamp(34px,5.2vw,64px)]">{LANDING_FAQ_HEADING}</h2>
          <dl className="mt-9 grid gap-x-12 gap-y-6 lg:grid-cols-2">
            {LANDING_FAQ.map(entry => <div key={entry.question} className="border-t border-ink/20 pt-4">
              <dt className="font-display text-xl uppercase leading-tight">{entry.question}</dt>
              <dd className="mt-2 text-sm leading-6 text-fog">{entry.answer}</dd>
            </div>)}
          </dl>
        </div>
      </section>
    </main>
    <footer className="bg-paper">
      <div className="mx-auto max-w-[1280px] px-5 py-12 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/20 pb-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="skipwait.me home">
            <StampMark />
            <span className="font-display text-2xl uppercase tracking-[.01em]">skipwait.me</span>
          </Link>
          <Link href={LANDING_EMPLOYER_LINK.href} className="flex min-h-11 items-center gap-2 border border-ink px-4 font-mono text-[11px] uppercase tracking-[.16em] text-ink transition-colors hover:bg-ink hover:text-paper">
            {LANDING_EMPLOYER_LINK.label}<ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <nav aria-label="skipwait.me pages" className="mt-8 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          {LANDING_EXPLORE.map(link => <Link key={link.href} href={link.href} className="flex min-h-11 items-center text-sm font-medium text-ink hover:text-signal">{link.label}</Link>)}
        </nav>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[.18em] text-fog">Guides</p>
        <nav aria-label="Guides" className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-3">
          {LANDING_GUIDES.map(link => <Link key={link.href} href={link.href} className="flex min-h-11 items-center text-sm text-ink hover:text-signal">{link.label}</Link>)}
        </nav>
        <p className="tnum mt-8 border-t border-ink/20 pt-4 font-mono text-[11px] leading-5 text-fog">skipwait.me · Better introductions, on your terms. {MONEY_LINE}. A referral never guarantees an interview, an offer, or a job.</p>
      </div>
    </footer>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
      <DialogContent aria-label="Menu" aria-describedby={undefined} showCloseButton={false} className="gap-0 border-ink bg-paper p-0 sm:max-w-sm">
        <div className="flex items-center justify-between border-b border-ink/20 bg-ink px-4 py-3 text-paper">
          <DialogTitle className="font-display text-xl uppercase tracking-[.02em]">Menu</DialogTitle>
          <DialogClose className="grid size-11 place-items-center border border-paper/50 text-paper transition-colors hover:bg-paper hover:text-ink" aria-label="Close navigation menu"><X className="size-5" /></DialogClose>
        </div>
        <nav aria-label="Mobile navigation" className="grid p-2">
          {PUBLIC_NAV.map(link => <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center border-b border-ink/15 px-2 font-display text-2xl uppercase text-ink last:border-b-0">{link.label}</Link>)}
          <SignInButton><button type="button" onClick={() => setMenuOpen(false)} className="mt-3 flex min-h-12 items-center justify-center bg-ink px-4 font-mono text-[11px] uppercase tracking-[.16em] text-paper">Sign in</button></SignInButton>
        </nav>
      </DialogContent>
    </Dialog>
  </div>;
}
