// V9 "Uber style" landing, M3 hybrid (owner pick 17:51:26 "M3", verified
// author=user phonemsg-01M5F6HGTM5DCRVFW73SKFSKKV; direction 17:32:58
// phonemsg-01M5F5FQC3B8YB2HAP1B403RNX "Do uber style" + 17:37:45
// phonemsg-01M5F5RFTJPQ5Y9MG95ASK4JZY real banner, not the enlarged logo).
// Per designer m3-sheet: pure white Uber hero with the company search bar,
// then a BLACK band carrying the warm walking-in photo (Pexels 7651982,
// self-hosted /brand/banner-take-e.jpg). Behind GOAL_UI_LANDING_V9, OFF
// everywhere; live landing untouched until main relays the owner's "ship".
import { useState } from "react";
import CookieConsent from "@/components/CookieConsent";
import type { FormEvent, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { GoalVerifiedMark } from "@/components/goal/GoalVerifiedMark";
import { BetaBadge, BetaNoticeLine } from "@/components/BetaNotice";
import { COST_COPY, FAIR_RULES, FOOTER_COLS, Kicker, Reveal, AskCardArt } from "./GoalLanding";
import { GOAL_LANDING_H1, GOAL_LANDING_HERO_LEAD } from "@shared/landingContent";

// Benefit-led copy (owner 17:59:41 phonemsg-01M5F70MEJM3WQEYVW9JZJKP6N
// "Have outcome benfit oriented wording" + 18:00:59
// phonemsg-01M5F730N3AZPJ5P2JZ3FMH9VH; designer m3do sheets relayed by
// main 18:02). V7 keeps its own wording - these arrays are V9-only.
const V9_STEPS: Array<{ title: string; body: string }> = [
  { title: "Pick where you want in", body: "See the companies with verified employees inside, and the roles you can ask about." },
  { title: "Ask with the cost up front", body: COST_COPY.stepBody },
  { title: "A yes opens a conversation", body: "An accepted ask opens a private conversation. A referral is an introduction, never a promise of an interview or a job." },
];
const V9_TRUST: Array<{ title: string; body: string; blue: boolean }> = [
  { title: "A real insider reads you", body: "Every referrer proves their company email before they can see a single ask.", blue: true },
  { title: "Private until it counts", body: "Your name stays private until a referrer chooses to open the conversation.", blue: false },
  { title: "Nothing spent while it waits", body: COST_COPY.waitBody, blue: false },
];

// Single swappable band photo: "d" (handshake, default per main 17:54) or
// "e" (walking-in). Final owner pick pending; swap = this one constant.
const V9_BAND_PHOTO = "d";
const BAND_ALT: Record<string, string> = {
  d: "A new joiner shaking hands across a table",
  e: "Two colleagues walking into a bright office together",
};

function SearchCTA() {
  const [, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const term = q.trim();
    setLocation(term ? `/explore?q=${encodeURIComponent(term)}` : "/explore");
  };
  return (
    <form onSubmit={submit} className="mt-8 flex max-w-[560px] flex-col gap-2 rounded-[14px] border border-g-hairline p-1.5 gdesk:flex-row gdesk:items-center" data-testid="goal-next-step">
      <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-g-surface-hover px-4">
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-g-ink-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="9" r="6" /><path d="m14 14 3.5 3.5" strokeLinecap="round" /></svg>
        <span className="sr-only">Search companies</span>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search companies" className="w-full min-w-0 bg-transparent text-g-small text-g-ink outline-none placeholder:text-g-ink-3" />
      </label>
      <button type="submit" className="h-12 w-full shrink-0 rounded-[10px] bg-g-ink px-5 text-g-small font-semibold text-g-ink-inverse hover:bg-g-primary-hover gdesk:h-11 gdesk:w-auto">Find your company <span aria-hidden="true">&rarr;</span></button>
    </form>
  );
}

export default function GoalLandingV9() {
  return (
    <div className="min-h-screen bg-white font-g-sans text-g-ink">
      <header className="border-b border-g-hairline">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 gdesk:px-8">
          <div className="flex items-center gap-2.5">
            <Link href="/" aria-label="skipwait.me home" className="inline-flex items-center"><GoalBrandMark /></Link>
            <BetaBadge tone="goal" />
          </div>
          <nav className="hidden items-center gap-7 gdesk:flex" aria-label="Landing">
            <a href="#how" className="text-g-small font-medium text-g-ink-2 hover:text-g-ink">How it goes</a>
            <a href="#rules" className="text-g-small font-medium text-g-ink-2 hover:text-g-ink">Fair rules</a>
            <Link href="/sign-in?intent=referrer" className="text-g-small font-medium text-g-ink-2 hover:text-g-ink">Join as a referrer</Link>
            <Link href="/sign-in" className="text-g-small font-medium text-g-ink hover:underline underline-offset-4">Sign in</Link>
          </nav>
          <Link href="/sign-in" className="text-g-small font-medium gdesk:hidden">Sign in</Link>
        </div>
      </header>

      {/* Stark white hero, left-aligned (Uber style). No colour here. */}
      <section className="border-b border-g-hairline">
        <div className="mx-auto max-w-[1120px] px-5 pb-16 pt-14 gdesk:px-8 gdesk:pb-24 gdesk:pt-24">
          <Kicker>Private job referrals</Kicker>
          <h1 className="mt-5 text-[56px] font-semibold leading-[0.98] tracking-[-0.045em] gdesk:text-[96px]">{GOAL_LANDING_H1}</h1>
          <p className="mt-5 max-w-[520px] text-g-body leading-[1.6] text-g-ink-2">{GOAL_LANDING_HERO_LEAD}</p>
          <SearchCTA />
          <p className="mt-3 text-[13px] text-g-ink-3">Explore before signing in.</p>
          <div className="mt-3"><BetaNoticeLine tone="goal" /></div>
        </div>
      </section>

      {/* M3: BLACK idea band carrying the warm walking-in photo (only photo
          on the page; no warm gradient anywhere). */}
      <section className="bg-g-ink text-g-ink-inverse">
        <div className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 py-14 gdesk:grid-cols-2 gdesk:px-8 gdesk:py-20">
          <Reveal>
            <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] opacity-60">What you gain</p>
            <h2 className="mt-4 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]">Past the pile, into a conversation.</h2>
            <p className="mt-4 max-w-[440px] text-g-body leading-[1.6] opacity-70">A verified employee inside the company picks your ask and opens a private conversation - so you arrive as a person, not one more application in the pile.</p>
          </Reveal>
          <Reveal className="justify-self-center">
            <img src={`/brand/banner-take-${V9_BAND_PHOTO}.jpg`} alt={BAND_ALT[V9_BAND_PHOTO]} className="w-full max-w-[520px] rounded-[16px] object-cover" data-testid="goal-v9-banner" />
          </Reveal>
        </div>
      </section>

      {/* Mass applying vs a referral - designer final copy list (main
          18:24, owner shipped C1 phonemsg-01M5F815M7QD4MZRPGH858XGPG).
          Figures from the linked Jobvite page (verified verbatim there). */}
      <section className="border-b border-g-hairline">
        <div className="mx-auto max-w-[1120px] px-5 py-14 gdesk:px-8 gdesk:py-24">
          <Reveal>
            <Kicker>Why not just apply?</Kicker>
            <h2 className="mt-4 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]">Mass applying vs a referral.</h2>
          </Reveal>
          <div className="mt-10">
            <div className="hidden grid-cols-[140px_1fr_1fr] gap-6 pb-3 gdesk:grid" aria-hidden="true">
              <span />
              <span className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">Mass applying</span>
              <span className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">One referral on skipwait.me</span>
            </div>
            {[
              ["Where you land", "One more application in a pile, screened by software before any person.", "One ask, read by a verified employee inside the company."],
              ["Your effort", "The same form, re-filled for every posting, hearing nothing back.", "One thoughtful ask with your resume and a short note - not another form."],
              ["Your wait", "39-55 days average hiring time for job-board and career-site candidates.", "About 29 days average hiring time for referred candidates."],
              ["Your odds", "One of every applicant in the pile.", "Referrals are about 7% of candidates and convert at nearly 40%."],
            ].map(([label, mass, referral]) => (
              <Reveal key={label} className="border-t border-g-hairline py-5">
                <div className="grid gap-3 gdesk:grid-cols-[140px_1fr_1fr] gdesk:gap-6">
                  <span className="font-g-mono text-[13px] text-g-ink-3">{label}</span>
                  <p className="text-g-small leading-[1.6] text-g-ink-2"><span className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3 gdesk:hidden">Mass applying: </span>{mass}</p>
                  <p className="text-g-small font-semibold leading-[1.6]"><span className="font-g-mono text-[11px] font-medium uppercase tracking-[0.14em] text-g-ink-3 gdesk:hidden">Referral: </span>{referral}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-10">
            <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">The wait, to scale</p>
            <div className="mt-4 space-y-3">
              <div>
                <div className="h-3 rounded-full bg-g-hairline" style={{ width: "100%" }} />
                <p className="mt-1.5 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">39-55 days - job boards &amp; career sites</p>
              </div>
              <div>
                <div className="h-3 rounded-full bg-g-ink" style={{ width: "52.7%" }} />
                <p className="mt-1.5 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink">About 29 days - referred candidates</p>
              </div>
            </div>
          </Reveal>
          <Reveal>
            <p className="mt-8 text-g-small leading-[1.6] text-g-ink-3">Figures: Jobvite, &ldquo;4 Reasons to Invest in Employee Referrals&rdquo; - <a href="https://www.jobvite.com/blog/4-reasons-to-invest-in-employee-referrals/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">jobvite.com</a> - Employer-side averages, not a promise for any one person.</p>
            <p className="mt-4 text-g-body font-semibold">A referral is an introduction, never a promise of an interview or a job.</p>
          </Reveal>
        </div>
      </section>

      <section id="how" className="border-b border-g-hairline">
        <div className="mx-auto max-w-[1120px] px-5 py-14 gdesk:px-8 gdesk:py-24">
          <Reveal>
            <Kicker>How it goes</Kicker>
            <h2 className="mt-4 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]">Three steps. No noise.</h2>
          </Reveal>
          <ol className="mt-10 grid gap-8 gdesk:grid-cols-3 gdesk:gap-10">
            {V9_STEPS.map((step, i) => (
              <li key={step.title}>
                <Reveal className="border-t-2 border-g-ink pt-6">
                  <span className="font-g-mono text-[13px] text-g-ink-3" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-3 text-[17px] font-semibold">{step.title}</h3>
                  <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">{step.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-g-hairline">
        <div className="mx-auto max-w-[760px] px-5 py-16 text-center gdesk:py-28">
          <Reveal>
            <blockquote className="text-[26px] font-semibold leading-[1.25] tracking-[-0.02em] gdesk:text-[36px]">
              &ldquo;A referral is an introduction, <span className="text-g-ink-3">never a promise of an interview or a job.&rdquo;</span>
            </blockquote>
            <p className="mt-6 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">The honest deal &mdash; on every page, in every flow</p>
          </Reveal>
        </div>
      </section>

      <section className="border-b border-g-hairline">
        <div className="mx-auto max-w-[1120px] px-5 py-14 gdesk:px-8 gdesk:py-24">
          <Reveal>
            <Kicker>Why you can trust it</Kicker>
            <h2 className="mt-4 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]">Real insiders.<br />Real rules.</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 gdesk:grid-cols-3">
            {V9_TRUST.map((item) => (
              <Reveal key={item.title} className="rounded-[12px] border border-g-hairline p-5">
                {item.blue
                  ? <GoalVerifiedMark as="span" className="text-g-small font-semibold">{item.title}</GoalVerifiedMark>
                  : <><span className="mt-1 block h-1.5 w-1.5 rounded-full bg-g-ink" aria-hidden="true" /><h3 className="mt-3 text-[15px] font-semibold">{item.title}</h3></>}
                <p className="mt-1.5 text-g-small leading-[1.6] text-g-ink-2">{item.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-g-hairline">
        <div className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 py-14 gdesk:grid-cols-2 gdesk:px-8 gdesk:py-24">
          <Reveal>
            <Kicker>For employees</Kicker>
            <h2 className="mt-4 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]">Be the way in for someone good.</h2>
            <p className="mt-4 max-w-[440px] text-g-body leading-[1.6] text-g-ink-2">Review asks when it feels right and open a door you believe in. Referring is always free - and referrers are never paid, so every yes stays genuine.</p>
            <Link href="/referrer" className="mt-6 inline-flex h-11 items-center gap-2 rounded-full border border-g-ink px-5 text-g-small font-semibold hover:bg-g-surface-hover">Join as a referrer <span aria-hidden="true">&rarr;</span></Link>
          </Reveal>
          <Reveal className="justify-self-center"><AskCardArt /></Reveal>
        </div>
      </section>

      <section id="rules" className="border-b border-g-hairline">
        <div className="mx-auto max-w-[1120px] px-5 py-14 gdesk:px-8 gdesk:py-24">
          <Reveal>
            <Kicker>Fair rules</Kicker>
            <h2 className="mt-4 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]">What never changes</h2>
          </Reveal>
          <div className="mt-10">
            {FAIR_RULES.map((rule, i) => (
              <Reveal key={rule} className="flex items-baseline gap-6 border-t border-g-hairline py-5">
                <span className="font-g-mono text-[13px] text-g-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-g-body leading-[1.6] text-g-ink-2">{rule}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Black footer (Uber style); light lockup asset. */}
      <footer className="bg-g-ink text-g-ink-inverse">
        <div className="mx-auto grid max-w-[1120px] gap-10 px-5 py-12 gdesk:grid-cols-[1.4fr_1fr_1fr_1fr] gdesk:px-8 gdesk:py-16">
          <div>
            <img src="/brand/lockup-dark.svg" alt="SkipWait.me" className="h-[22px] w-auto" />
            <p className="mt-4 max-w-[260px] text-g-small leading-[1.6] opacity-70">A warmer way in. Private job referrals from verified employees. skipwait.me is in beta.</p>
          </div>
          {FOOTER_COLS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="font-g-mono text-[11px] uppercase tracking-[0.14em] opacity-60">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map(([href, label]) => (
                  <li key={label}><Link href={href} className="text-g-small opacity-70 hover:opacity-100">{label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-g-ink-3/30">
          <div className="mx-auto flex max-w-[1120px] items-center justify-between px-5 py-5 text-[13px] opacity-60 gdesk:px-8">
            <span>skipwait.me</span>
            <span>Made with care, in beta.</span>
          </div>
        </div>
      </footer>
      <CookieConsent />

    </div>
  );
}