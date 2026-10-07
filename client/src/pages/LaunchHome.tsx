import { useState } from "react";
import { ArrowRight, ArrowUpRight, Check, HeartHandshake, LockKeyhole, Menu, Minus, Plus, ShieldCheck, X } from "lucide-react";
import { Link } from "wouter";
import { VisualJourney } from "@/components/VisualJourney";
import { LAUNCH_COMPANIES } from "@/lib/launchCompanies";

/**
 * Kit v4 launch homepage, ported AS IS from app/src/components/launch-page.tsx.
 *
 * The reference here is the kit SOURCE, not a capture: the homepage is the one
 * designed screen with no image in screens/web or screens/mobile. An earlier
 * pass approximated this design with Tailwind utilities; that was the wrong
 * call, because the design IS the `.launch-*` CSS in app/src/styles.css. That
 * CSS is now ported verbatim into client/src/index.css and this file uses its
 * class names, so the markup matches the kit one-to-one.
 *
 * ONE KIT PIECE IS OMITTED: `ConsentBanner`. It exists to gate analytics SDKs,
 * and this app has none -- `.env.example` declares no PostHog/Mixpanel key and
 * no consent component exists anywhere in the client. A banner collecting a
 * choice nothing reads is worse than no banner. It returns with the analytics
 * provider, not before.
 */

const QUESTIONS = [
  ["Are job referrals really free?", "Yes. No payments between seekers and referrers, no referral commission, and no paid priority. A referral is a voluntary introduction, not a purchase."],
  ["Do I need to know someone at the company?", "No existing connection is required. Explore companies with available referrers, find a relevant role, and send a thoughtful request. Each referrer chooses which requests to accept."],
  ["What does verification mean?", "Work-email verification confirms ownership of an address on an approved company domain. It does not prove current employment or imply an employer's endorsement."],
  ["Does a referral guarantee an interview?", "No. A referral is an introduction, not a promise. Employers independently decide who to interview and hire."],
] as const;

const COMMITMENTS = ["Your name is never public.", "You choose every connection.", "No money changes hands.", "Always on your terms."];

export default function LaunchHome() {
  const [menu, setMenu] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);

  return (
    <div className="launch-page">
      <header className="launch-header">
        <Link className="wordmark" href="/">SkipWait<span className="brand-dot">.</span></Link>
        <nav aria-label="Website navigation" className={menu ? "launch-nav open" : "launch-nav"}>
          <Link href="/explore" onClick={() => setMenu(false)}>Explore companies</Link>
          <Link href="/referrer" onClick={() => setMenu(false)}>For referrers</Link>
          <Link href="/safety" onClick={() => setMenu(false)}>Help &amp; safety</Link>
          <Link className="launch-mobile-signin" href="/sign-in" onClick={() => setMenu(false)}>Sign in <ArrowRight size={14} aria-hidden="true" /></Link>
        </nav>
        <div className="launch-header-actions">
          <Link className="brand-button launch-signin" href="/sign-in">Sign in</Link>
          <Link className="brand-button" href="/explore">Explore <ArrowUpRight aria-hidden="true" /></Link>
          <button
            type="button"
            className="launch-menu brand-button"
            aria-expanded={menu}
            aria-label={menu ? "Close navigation" : "Open navigation"}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main>
        <section className="launch-hero">
          <img className="launch-hero-image" src="/launch-door.jpg" alt="An open blue door with a yellow path leading through it" width={1600} height={1008} fetchPriority="high" />
          <div className="launch-hero-copy">
            <span className="launch-kicker"><span />Introducing SkipWait</span>
            <h1>Free job referrals.<br />A warmer way in<span className="brand-dot">.</span></h1>
            <p>Connect with people inside the companies you want to join.<br className="desktop-break" /> A real introduction. Not another application into the unknown.</p>
            <Link className="brand-button" href="/explore">Explore companies <ArrowUpRight aria-hidden="true" /></Link>
            <Link className="hero-secondary" href="/referrer">Already on the inside? Become a referrer <ArrowRight size={14} aria-hidden="true" /></Link>
            <div className="hero-assurances">
              <span><Check size={13} aria-hidden="true" />Referrals are free</span>
              <span><Check size={13} aria-hidden="true" />Explore before signing in</span>
            </div>
          </div>
          <span className="hero-side-note">Your next chapter starts with a connection.</span>
        </section>

        <section className="launch-trust-strip" aria-label="Our commitments">
          <span><HeartHandshake aria-hidden="true" />No referral fees.</span>
          <span><LockKeyhole aria-hidden="true" />Private by default.</span>
          <span><ShieldCheck aria-hidden="true" />No job guarantees.</span>
        </section>

        <section className="launch-section launch-companies">
          <div className="section-intro">
            <span className="eyebrow">Open doors at launch</span>
            <h2>Start somewhere real.</h2>
            <p>People at these companies have told SkipWait they are open to referral requests. Availability can change, and every person chooses each ask.</p>
          </div>
          <div className="launch-company-row">
            {LAUNCH_COMPANIES.map(company => (
              <Link key={company.slug} href={`/explore/${company.slug}`}>
                <span className="company-mark">{company.initials}</span>
                <strong>{company.name}</strong>
                <ArrowUpRight aria-hidden="true" />
              </Link>
            ))}
          </div>
          <Link className="text-link" href="/explore">Explore all open doors <ArrowRight aria-hidden="true" /></Link>
        </section>

        <section className="launch-section launch-steps">
          <div className="section-intro">
            <span className="eyebrow">Three steps. One open door.</span>
            <h2>Your way in,<br />made simple.</h2>
            <p>Find a company. Make an ask. Meet someone inside.</p>
          </div>
          <VisualJourney />
          <Link className="text-link" href="/explore">Find your way in <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>

        <section className="launch-referrer-band">
          <div className="launch-section referrer-band-inner">
            <span className="eyebrow">For the people on the inside</span>
            <div className="referrer-band-grid">
              <div>
                <h2>You could be someone's<br />first open door.</h2>
                <p>A few minutes of your time could help someone take their next step. Choose who you help. Set your own capacity. Keep your identity private until you accept.</p>
                <Link className="brand-button" href="/referrer">Become a referrer <ArrowUpRight aria-hidden="true" /></Link>
              </div>
              <div className="referrer-commitments">
                {COMMITMENTS.map(item => <span key={item}><Check aria-hidden="true" />{item}</span>)}
              </div>
            </div>
          </div>
        </section>

        <section className="launch-section launch-privacy">
          <div>
            <span className="eyebrow">Trust, without the fine print</span>
            <h2>Your career is personal.<br />Your connections should be too.</h2>
          </div>
          <div>
            <p>Referrer names are shared only after they accept your request. Resumes stay private until acceptance. And a referral is an introduction—not a promise of an interview or a job.</p>
            <Link className="text-link" href="/safety">Our approach to help &amp; safety <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
        </section>

        <section className="launch-section launch-faq">
          <div>
            <span className="eyebrow">A few good questions</span>
            <h2>Before you<br />take the next step.</h2>
          </div>
          <div className="launch-faq-list">
            {QUESTIONS.map(([question, answer], index) => (
              <div className="launch-faq-item" key={question}>
                <button
                  type="button"
                  aria-expanded={faq === index}
                  aria-controls={`faq-${index}`}
                  onClick={() => setFaq(faq === index ? null : index)}
                >
                  {question}
                  {faq === index ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}
                </button>
                {faq === index && <p id={`faq-${index}`}>{answer}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="launch-final">
          <span className="eyebrow">Small connection. Big next step.</span>
          <h2>What's on the other side?</h2>
          <Link className="brand-button" href="/explore">Explore companies <ArrowUpRight aria-hidden="true" /></Link>
          <p>Referrals are free. Always.</p>
        </section>
      </main>

      <footer className="launch-footer">
        <Link className="wordmark" href="/">SkipWait<span className="brand-dot">.</span></Link>
        <span>A warmer way in. · skipwait.me</span>
        <span className="flex flex-wrap gap-4">
          <Link href="/help">Help</Link>
          <Link href="/guidelines">Guidelines</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/for-companies">For companies <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </span>
      </footer>
    </div>
  );
}
