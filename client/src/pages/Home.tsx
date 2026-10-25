import { ArrowRight, ArrowUpRight, Check, HeartHandshake, LockKeyhole, Menu, Minus, Plus, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { Button } from "@/components/kit/button";
import { applySeo, faqJsonLd } from "@/lib/seo";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import { VisualJourney } from "@/components/VisualJourney";
import { LANDING_H1_LINES, LANDING_HERO_LEAD_PARTS } from "@shared/landingContent";
import { FREE_ASKS_CHIP, MONEY_SENTENCE, REFERRERS_NEVER_PAID } from "@shared/moneyCopy";
import GoalLandingV9 from "./GoalLandingV9";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
import CookieConsent from "@/components/CookieConsent";

const QUESTIONS = [
  ["What does asking for a referral cost?", `${MONEY_SENTENCE} There is no referral commission and no paid priority: a referral is a voluntary introduction, not a purchase.`],
  ["Do I need to know someone at the company?", "No existing connection is required. Explore companies with available referrers, find a relevant role, and send a thoughtful request. Each referrer chooses which requests to accept."],
  ["What does verification mean?", "Work-email verification confirms ownership of an address on an approved company domain. It does not prove current employment or imply an employer’s endorsement."],
  ["Does a referral guarantee an interview?", "No. A referral is an introduction, not a promise. Employers independently decide who to interview and hire."],
];

export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const [menu, setMenu] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);
  // D-120 migration: signed-out visitors get the goal-first landing behind the
  // flag (off in production until QA verifies). Signed-in visitors keep the
  // existing page until the Home surface migrates.
  const goalLanding = goalSurfaceOn("home") && isLoaded && !isSignedIn;
  useEffect(() => {
    if (goalLanding) return;
    applySeo({ title: `${LANDING_H1_LINES[0]} ${LANDING_H1_LINES[1]}`, description: `skipwait.me connects job seekers with people inside the companies they want to join. ${MONEY_SENTENCE}`, path: "/", jsonLd: faqJsonLd(QUESTIONS.map(([question, answer]) => ({ question, answer }))) });
  }, [goalLanding]);
  if (goalLanding) return <GoalLandingV9 />;

  return (
    <div className="launch-page">
      <header className="launch-header">
        <Link className="wordmark" href="/" aria-label="skipwait.me home"><img src="/brand/lockup.svg" alt="skipwait.me" className="wordmark-logo" /></Link>
        <nav aria-label="Website navigation" className={menu ? "launch-nav open" : "launch-nav"}>
          <Link href="/explore" onClick={() => setMenu(false)}>Explore companies</Link>
          <Link href="/referrer" onClick={() => setMenu(false)}>For referrers</Link>
          <Link href="/safety" onClick={() => setMenu(false)}>Help &amp; safety</Link>
          {isSignedIn ? <Link className="launch-mobile-signin" href="/requests" onClick={() => setMenu(false)}>Open app <ArrowRight size={14} /></Link> : <Link className="launch-mobile-signin" href="/sign-in" onClick={() => setMenu(false)}>Sign in <ArrowRight size={14} /></Link>}
        </nav>
        <div className="launch-header-actions">
          {isSignedIn ? <Button asChild variant="ghost" className="launch-signin"><Link href="/requests">Open app</Link></Button> : <Button asChild variant="ghost" className="launch-signin"><Link href="/sign-in">Sign in</Link></Button>}
          <Button asChild variant="outline"><Link href="/explore">Explore <ArrowUpRight /></Link></Button>
          <Button className="launch-menu" variant="ghost" size="icon" aria-label={menu ? "Close navigation" : "Open navigation"} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</Button>
        </div>
      </header>
      <main>
        <section className="launch-hero">
          <img className="launch-hero-image" src="/launch-door.jpg" alt="An open blue door with a yellow path leading through it" width={1600} height={1008} fetchPriority="high" />
          <div className="launch-hero-copy">
            <span className="launch-kicker"><span />INTRODUCING SKIPWAIT.ME</span>
            <h1>{LANDING_H1_LINES[0]}<br />{LANDING_H1_LINES[1]}<span className="brand-dot">.</span></h1>
            <p>{LANDING_HERO_LEAD_PARTS[0]}<br className="desktop-break" /> {LANDING_HERO_LEAD_PARTS[1]}</p>
            <Button asChild><Link href="/explore">Explore companies <ArrowUpRight /></Link></Button>
            <Link className="hero-secondary" href="/referrer">Already on the inside? Become a referrer <ArrowRight size={14} /></Link>
            <div className="hero-assurances"><span><Check size={13} />{FREE_ASKS_CHIP}</span><span><Check size={13} />Explore before signing in</span></div>
          </div>
          <span className="hero-side-note">YOUR NEXT CHAPTER STARTS WITH A CONNECTION.</span>
        </section>
        <section className="launch-trust-strip" aria-label="Our commitments"><span><HeartHandshake />{REFERRERS_NEVER_PAID}</span><span><LockKeyhole />Private by default.</span><span><ShieldCheck />No job guarantees.</span></section>
        <section className="launch-section launch-companies">
          <div className="section-intro"><span className="eyebrow">OPEN DOORS AT LAUNCH</span><h2>Start somewhere real.</h2><p>People at these companies have told skipwait.me they are open to referral requests. Availability can change, and every person chooses each ask.</p></div>
          <div className="launch-company-row">
            {LAUNCH_COMPANY_SEED.map(company => <Link key={company.slug} href={`/explore/${company.slug}`}><span className="company-mark">{company.initials}</span><strong>{company.name}</strong><ArrowUpRight /></Link>)}
          </div>
          <Link className="text-link" href="/explore">Explore all open doors <ArrowRight /></Link>
        </section>
        <section className="launch-section launch-steps">
          <div className="section-intro"><span className="eyebrow">THREE STEPS. ONE OPEN DOOR.</span><h2>Your way in,<br />made simple.</h2><p>Find a company. Make an ask. Meet someone inside.</p></div>
          <VisualJourney />
          <Link className="text-link" href="/explore">Find your way in <ArrowRight size={16} /></Link>
        </section>
        <section className="launch-referrer-band">
          <div className="launch-section referrer-band-inner">
            <span className="eyebrow">FOR THE PEOPLE ON THE INSIDE</span>
            <div className="referrer-band-grid">
              <div>
                <h2>You could be someone’s<br />first open door.</h2>
                <p>A few minutes of your time could help someone take their next step. Choose who you help. Set your own capacity. Keep your identity private until you accept.</p>
                <Button variant="outline" asChild><Link href="/referrer">Become a referrer <ArrowUpRight /></Link></Button>
              </div>
              <div className="referrer-commitments">
                <span><Check />Your name is never public.</span>
                <span><Check />You choose every connection.</span>
                <span><Check />No money changes hands.</span>
                <span><Check />Always on your terms.</span>
              </div>
            </div>
          </div>
        </section>
        <section className="launch-section launch-privacy">
          <div><span className="eyebrow">TRUST, WITHOUT THE FINE PRINT</span><h2>Your career is personal.<br />Your connections should be too.</h2></div>
          <div><p>Referrer names are shared only after they accept your request. Resumes stay private until acceptance. And a referral is an introduction—not a promise of an interview or a job.</p><Link className="text-link" href="/safety">Our approach to help &amp; safety <ArrowUpRight size={16} /></Link></div>
        </section>
        <section className="launch-section launch-faq">
          {/* The space before <br /> keeps "you take" apart where the phone layout hides the break. */}
          <div><span className="eyebrow">A FEW GOOD QUESTIONS</span><h2>Before you <br />take the next step.</h2></div>
          <div className="launch-faq-list">
            {QUESTIONS.map(([question, answer], index) => (
              <div className="launch-faq-item" key={question}>
                <Button variant="ghost" aria-expanded={faq === index} aria-controls={`faq-${index}`} onClick={() => setFaq(faq === index ? null : index)}>{question}{faq === index ? <Minus /> : <Plus />}</Button>
                {faq === index ? <p id={`faq-${index}`}>{answer}</p> : null}
              </div>
            ))}
          </div>
        </section>
        <section className="launch-final">
          <span className="eyebrow">SMALL CONNECTION. BIG NEXT STEP.</span>
          <h2>What’s on the other side?</h2>
          <Button asChild><Link href="/explore">Explore companies <ArrowUpRight /></Link></Button>
          <p>{MONEY_SENTENCE}</p>
        </section>
      </main>
      <footer className="launch-footer">
        <Link className="wordmark" href="/" aria-label="skipwait.me home"><img src="/brand/lockup.svg" alt="skipwait.me" className="wordmark-logo" /></Link>
        <span>A warmer way in. · skipwait.me</span>
        {/* Kit phone CSS puts every footer span on row 2; the links take row 3 so they never overlap the tagline. */}
        <span className="flex flex-wrap gap-4 max-[769px]:row-start-3!">
          <Link href="/help">Help</Link>
          <Link href="/guidelines">Guidelines</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refunds">Refunds</Link>
          <Link href="/cancellations">Cancellation</Link>
          <Link href="/shipping">Shipping</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/for-companies">For companies <ArrowUpRight size={14} /></Link>
        </span>
      </footer>
      <CookieConsent />
    </div>
  );
}
