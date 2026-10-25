import { ArrowRight, BarChart3, Building2, Check, ShieldCheck, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { EMPLOYER_PLANS, employerPlanPriceLabel } from "@/components/employer/employerPlans";
import { useCompanyDirectory } from "@/lib/companyDirectory";
import { FREE_ASKS_CHIP } from "@shared/moneyCopy";

// Cards 2-4 keep claims the product backs today; the kit's insight, ATS and
// campaign cards land with the employer-insights wave.
const VALUE = [
  { icon: Users, title: "Referrals from people who know the work", text: "Employees choose who to refer. You get context, not cold applications." },
  { icon: BarChart3, title: "Private by default", text: "Candidate names and resumes stay hidden until a verified employee accepts." },
  { icon: ShieldCheck, title: "Your team stays in control", text: "Passing is private and always okay. Nobody is ranked or pressured." },
  // D-063: candidates do pay for asks past the monthly allowance; what never happens is paying a referrer.
  { icon: Check, title: "Referrers are never paid", text: `Candidates get ${FREE_ASKS_CHIP} and use credits for more. No commissions, no paid ranking of candidates — the only paid placement is a labeled featured listing, enforced in the product.` },
];

const FAIR = ["Referrers are never paid and never ask candidates for money", "No paid ranking of candidates", "Employees can decline without pressure", "Privacy-first: names shared only on acceptance"];
const TEAM_SIZES = ["1–200", "201–2,000", "2,000+"];

/** Demo requests have no backend yet, so the form opens a prefilled email to the team. */
export function demoRequestMailto({ email, company, teamSize }: { email: string; company: string; teamSize: string }) {
  const name = company.trim();
  const subject = `Demo request${name ? ` — ${name}` : ""}`;
  const body = `Hi skipwait.me team,\n\nWe'd like a 20-minute demo for ${name || "our company"} (team size ${teamSize}).\n\nContact: ${email.trim()}\n\nThanks!`;
  return `mailto:hello@skipwait.me?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function ForCompanies() {
  const directory = useCompanyDirectory();
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [teamSize, setTeamSize] = useState(TEAM_SIZES[0]);
  const requestDemo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.open(demoRequestMailto({ email, company, teamSize }), "_self");
  };

  return (
    <div data-skipwait-screen="for-companies" className="companies-site">
      <header className="launch-header">
        <Link className="wordmark" href="/" aria-label="skipwait.me home"><img src="/brand/lockup.svg" alt="skipwait.me" className="wordmark-logo" /></Link>
        <nav aria-label="Company navigation" className="launch-nav">
          {import.meta.env.VITE_COMPANY_CLAIM === "true" ? <Link href="/company/claim">Claim your company</Link> : null}
          <Link href="/explore">Explore</Link>
          <Link href="/plans">Plans</Link>
          <Button asChild className="brand-button"><a href="#demo">Book a demo</a></Button>
        </nav>
      </header>
      <main>
        <section className="launch-section co-hero">
          <span className="eyebrow">FOR EMPLOYERS</span>
          <h1>Your best hires already<br />know someone inside<span className="brand-dot">.</span></h1>
          <p>skipwait.me turns employee referrals into a trusted, measurable channel. Referrers are never paid. Your team stays in control.</p>
          <div className="done-actions">
            <Button asChild className="brand-button"><a href="#demo">Book a demo <ArrowRight /></a></Button>
            <Button asChild variant="outline" className="brand-button"><a href="#pricing">See pricing</a></Button>
          </div>
        </section>
        <section className="launch-section" aria-label="Launch companies">
          <span className="eyebrow">PEOPLE OPEN TO REFERRALS AT LAUNCH</span>
          {directory.data
            ? <div className="co-logos">{directory.data.companies.map(item => <span key={item.slug}><Building2 />{item.name}</span>)}</div>
            : directory.isError
              ? <p role="alert" className="mt-3.5 text-sm text-muted-foreground">We couldn’t load the launch companies. <button type="button" className="text-link" onClick={() => { void directory.refetch(); }}>Try again</button></p>
              : <div className="co-logos" aria-busy="true" aria-label="Loading launch companies">{[0, 1, 2, 3, 4].map(index => <span key={index} className="h-[50px] w-28 animate-pulse bg-muted motion-reduce:animate-none" />)}</div>}
        </section>
        <section className="launch-section">
          <h2>What you get</h2>
          <div className="moment-grid">{VALUE.map(item => <article key={item.title} className="moment-card"><item.icon /><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
        </section>
        <section className="launch-section fair-band co-fair" aria-label="Fair hiring commitments">
          <ShieldCheck />
          <ul>{FAIR.map(text => <li key={text}><Check />{text}</li>)}</ul>
        </section>
        <section id="pricing" className="launch-section">
          <span className="eyebrow">EMPLOYER PLANS</span>
          <h2>Start free. Grow when it works.</h2>
          <div className="plan-grid co-plans">{EMPLOYER_PLANS.map(plan => (
            <article key={plan.id} className={plan.featured ? "plan-card featured" : "plan-card"}>
              <h3>{plan.name}</h3>
              <div className="plan-price"><strong>{employerPlanPriceLabel(plan.price)}</strong></div>
              <p className="plan-tag">{plan.detail}</p>
              <Button asChild className="brand-button" variant={plan.featured ? "default" : "outline"}><a href="#demo" aria-label={`Get started with ${plan.name}`}>Get started</a></Button>
            </article>
          ))}</div>
        </section>
        <section id="demo" className="launch-section co-demo">
          <form onSubmit={requestDemo} aria-label="Book a demo">
            <h2>Book a 20-minute demo</h2>
            <p className="text-[13px] text-muted-foreground">Opens your email app addressed to our team — nothing is submitted silently.</p>
            <label>Work email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" /></label>
            <label>Company<input required value={company} onChange={event => setCompany(event.target.value)} placeholder="Company name" /></label>
            <label>Team size<select value={teamSize} onChange={event => setTeamSize(event.target.value)}>{TEAM_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
            <Button type="submit" className="brand-button">Request demo <ArrowRight /></Button>
          </form>
        </section>
      </main>
      <footer className="launch-footer">
        <Link className="wordmark" href="/" aria-label="skipwait.me home"><img src="/brand/lockup.svg" alt="skipwait.me" className="wordmark-logo" /></Link>
        <span>A warmer way in. · skipwait.me</span>
        <Link href="/employer">Employer workspace</Link>
        <Link href="/safety">Help &amp; safety</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/refunds">Refunds</Link>
        <Link href="/contact">Contact</Link>
      </footer>
    </div>
  );
}
