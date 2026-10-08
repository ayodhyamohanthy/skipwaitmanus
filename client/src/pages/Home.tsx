import { ArrowRight, ArrowUpRight, Check, HeartHandshake, LockKeyhole, Menu, Minus, Plus, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { applySeo, faqJsonLd } from "@/lib/seo";
import { LAUNCH_COMPANIES } from "@/lib/companies";
import { VisualJourney } from "@/components/VisualJourney";
import CookieConsent from "@/components/CookieConsent";

const QUESTIONS = [
  ["Are job referrals really free?", "Yes. No payments between seekers and referrers, no referral commission, and no paid priority. A referral is a voluntary introduction, not a purchase."],
  ["Do I need to know someone at the company?", "No existing connection is required. Explore companies with available referrers, find a relevant role, and send a thoughtful request. Each referrer chooses which requests to accept."],
  ["What does verification mean?", "Work-email verification confirms ownership of an address on an approved company domain. It does not prove current employment or imply an employer's endorsement."],
  ["Does a referral guarantee an interview?", "No. A referral is an introduction, not a promise. Employers independently decide who to interview and hire."],
];

export default function Home() {
  const [, go] = useLocation();
  const { isSignedIn } = useAuth();
  const [menu, setMenu] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);
  const [acceptedReferrals, setAcceptedReferrals] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/referral-impact").then(response => response.json()).then(payload => {
      if (active && typeof payload.acceptedReferrals === "number" && payload.acceptedReferrals > 0) setAcceptedReferrals(Math.floor(payload.acceptedReferrals));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    applySeo({ title: "Free job referrals. A warmer way in", description: "SkipWait connects job seekers with people inside the companies they want to join. Free referrals, private connections, and honest expectations.", path: "/", jsonLd: faqJsonLd(QUESTIONS.map(([question, answer]) => ({ question, answer }))) });
  }, []);

  return (
    <div className="launch-page">
      <header className="launch-header">
        <Link href="/" className="wordmark" aria-label="SkipWait home">SkipWait<span className="brand-dot">.</span></Link>
        <nav aria-label="Website navigation" className={menu ? "launch-nav open" : "launch-nav"}>
          <Link href="/explore" onClick={() => setMenu(false)}>Explore companies</Link>
          <Link href="/referrer" onClick={() => setMenu(false)}>For referrers</Link>
          <Link href="/safety" onClick={() => setMenu(false)}>Help &amp; safety</Link>
          <Link href="/sign-in" className="launch-mobile-signin" onClick={() => setMenu(false)}>Sign in <ArrowRight size={14} /></Link>
        </nav>
        <div className="launch-header-actions">
          <SignInButton><span className="launch-signin brand-button">Sign in</span></SignInButton>
          <Link href="/explore" className="brand-button">Explore <ArrowUpRight /></Link>
          <button type="button" className="launch-menu brand-button" aria-label={menu ? "Close navigation" : "Open navigation"} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
        </div>
      </header>
      {isSignedIn ? <nav aria-label="Your workspace" className="mx-auto flex max-w-6xl flex-wrap gap-2 px-5 py-3"><button type="button" className="brand-button" onClick={() => go("/requests")}>My requests</button><button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={() => go("/inbox")}>My company inbox</button><button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={() => go("/wall")}>Internal openings</button></nav> : null}
      <main>
        <section className="launch-hero">
          <img className="launch-hero-image" src="/launch-door.jpg" alt="An open blue door with a yellow path leading through it" width={1600} height={1008} />
          <div className="launch-hero-copy">
            <span className="launch-kicker"><span />INTRODUCING SKIPWAIT</span>
            <h1>Free job referrals.<br />A warmer way in<span className="brand-dot">.</span></h1>
            <p>Connect with people inside the companies you want to join.<br className="desktop-break" /> A real introduction. Not another application into the unknown.</p>
            <Link href="/explore" className="brand-button">Explore companies <ArrowUpRight /></Link>
            <Link href="/referrer" className="hero-secondary">Already on the inside? Become a referrer <ArrowRight size={14} /></Link>
            <div className="hero-assurances"><span><Check size={13} />Referrals are free</span><span><Check size={13} />Explore before signing in</span></div>
          </div>
          <span className="hero-side-note">YOUR NEXT CHAPTER STARTS WITH A CONNECTION.</span>
        </section>
        <section className="launch-trust-strip" aria-label="Our commitments">
          <span><HeartHandshake />No referral fees.</span>
          <span><LockKeyhole />Private by default.</span>
          <span><ShieldCheck />No job guarantees.</span>
        </section>
        <section className="launch-section launch-companies">
          <div className="section-intro"><span className="eyebrow">Open doors at launch</span><h2>Start somewhere real.</h2><p>People at these companies have told SkipWait they are open to referral requests. Availability can change, and every person chooses each ask.</p></div>
          <div className="launch-company-row">
            {LAUNCH_COMPANIES.map(company => <Link key={company.slug} href={`/explore/${company.slug}`}><span className="company-mark">{company.initials}</span><strong>{company.name}</strong><ArrowUpRight /></Link>)}
          </div>
          <Link href="/explore" className="text-link">Explore all open doors <ArrowRight /></Link>
        </section>
        <section className="launch-section launch-steps">
          <div className="section-intro"><span className="eyebrow">Three steps. One open door.</span><h2>Your way in,<br />made simple.</h2><p>Find a company. Make an ask. Meet someone inside.</p></div>
          <VisualJourney />
          <Link href="/explore" className="text-link">Find your way in <ArrowRight size={16} /></Link>
        </section>
        <section className="launch-referrer-band">
          <div className="launch-section referrer-band-inner">
            <span className="eyebrow">For the people on the inside</span>
            <div className="referrer-band-grid">
              <div>
                <h2>You could be someone&apos;s<br />first open door.</h2>
                <p>A few minutes of your time could help someone take their next step. Choose who you help. Set your own capacity. Keep your identity private until you accept.</p>
                <Link href="/referrer" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Become a referrer <ArrowUpRight /></Link>
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
          <div><span className="eyebrow">Trust, without the fine print</span><h2>Your career is personal.<br />Your connections should be too.</h2></div>
          <div><p>Referrer names are shared only after they accept your request. Resumes stay private until acceptance. And a referral is an introduction—not a promise of an interview or a job.</p><Link href="/safety" className="text-link">Our approach to help &amp; safety <ArrowUpRight size={16} /></Link></div>
        </section>
        <section className="launch-section launch-faq">
          <div><span className="eyebrow">A few good questions</span><h2>Before you<br />take the next step.</h2></div>
          <div className="launch-faq-list">
            {QUESTIONS.map(([question, answer], index) => (
              <div className="launch-faq-item" key={question}>
                <button type="button" aria-expanded={faq === index} aria-controls={`faq-${index}`} onClick={() => setFaq(faq === index ? null : index)}>{question}{faq === index ? <Minus /> : <Plus />}</button>
                {faq === index ? <p id={`faq-${index}`}>{answer}</p> : null}
              </div>
            ))}
          </div>
        </section>
        <section className="launch-final">
          <span className="eyebrow">Small connection. Big next step.</span>
          <h2>What&apos;s on the other side?</h2>
          <Link href="/explore" className="brand-button">Explore companies <ArrowUpRight /></Link>
          <p>Referrals are free. Always.</p>
        </section>
        {acceptedReferrals ? <p className="py-6 text-center text-sm">{acceptedReferrals} referral requests accepted on skipwait.me · participants stay private.</p> : null}
      </main>
      <footer className="launch-footer">
        <Link href="/" className="wordmark" aria-label="SkipWait home">SkipWait<span className="brand-dot">.</span></Link>
        <span>A warmer way in. · skipwait.me</span>
        <span className="flex flex-wrap gap-4">
          <Link href="/help">Help</Link>
          <Link href="/guidelines">Guidelines</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/safety">Safety</Link>
          <Link href="/for-companies">For companies <ArrowUpRight size={14} /></Link>
        </span>
      </footer>
      <CookieConsent />
    </div>
  );
}
