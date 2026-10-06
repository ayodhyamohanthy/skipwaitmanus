import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, BarChart3, Building2, Check, GitMerge, Megaphone, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { companyPlans } from "@/lib/monetization-data";
import { launchCompanies } from "@/lib/marketplace-data";

export const Route = createFileRoute("/for-companies")({ head: () => pageMeta("SkipWait for companies", "Turn your employees' referrals into a trusted hiring channel — without charging candidates."), component: ForCompanies });

const value = [
  { icon: Users, h: "Referrals from people who know the work", p: "Employees choose who to refer. You get context, not cold applications." },
  { icon: BarChart3, h: "See real demand", p: "Which roles and functions people ask about at your company — aggregated and private." },
  { icon: GitMerge, h: "Route straight to hiring", p: "Accepted referrals flow into your ATS with the job link and the employee’s note." },
  { icon: Megaphone, h: "Run referral campaigns", p: "Rally teams around hard-to-fill roles, with fair rules built in." },
];

function ForCompanies() {
  const [sent, setSent] = useState(false);
  return <div className="companies-site">
    <header className="launch-header"><Link className="wordmark" to="/">SkipWait<span className="brand-dot">.</span></Link><nav aria-label="Company navigation" className="launch-nav"><Link to="/explore">Explore</Link><Link to="/plans">Plans</Link><Button asChild className="brand-button"><a href="#demo">Book a demo</a></Button></nav></header>
    <main>
      <section className="launch-section co-hero"><span className="eyebrow">FOR EMPLOYERS</span><h1>Your best hires already<br />know someone inside<span className="brand-dot">.</span></h1><p>SkipWait turns employee referrals into a trusted, measurable channel. Candidates never pay. Your team stays in control.</p><div className="done-actions"><Button asChild className="brand-button"><a href="#demo">Book a demo <ArrowRight /></a></Button><Button asChild variant="outline" className="brand-button"><a href="#pricing">See pricing</a></Button></div></section>
      <section className="launch-section"><span className="eyebrow">PEOPLE OPEN TO REFERRALS AT LAUNCH</span><div className="co-logos">{launchCompanies.map(c => <span key={c.slug}><Building2 />{c.name}</span>)}</div></section>
      <section className="launch-section"><h2>What you get</h2><div className="moment-grid">{value.map(v => <article key={v.h} className="moment-card"><v.icon /><h3>{v.h}</h3><p>{v.p}</p></article>)}</div></section>
      <section className="launch-section fair-band co-fair"><ShieldCheck /><ul>{["Candidates never pay to be referred", "No paid ranking of candidates", "Employees can decline without pressure", "Privacy-first: names shared only on acceptance"].map(t => <li key={t}><Check />{t}</li>)}</ul></section>
      <section id="pricing" className="launch-section"><span className="eyebrow">EXAMPLE PRICING</span><h2>Start free. Grow when it works.</h2><div className="plan-grid co-plans">{companyPlans.map(p => <article key={p.name} className={`plan-card ${"featured" in p && p.featured ? "featured" : ""}`}><h3>{p.name}</h3><div className="plan-price"><strong>{p.price}</strong></div><p className="plan-tag">{p.detail}</p><Button asChild className="brand-button" variant={"featured" in p && p.featured ? "default" : "outline"}><a href="#demo">Get started</a></Button></article>)}</div></section>
      <section id="demo" className="launch-section co-demo">{sent ? <div className="request-complete"><span className="preview-check"><Check /></span><h2>Thanks — that’s the flow.</h2><p>Nothing was sent in this preview.</p></div> : <form onSubmit={e => { e.preventDefault(); setSent(true); }}><h2>Book a 20-minute demo</h2><label>Work email<input type="email" required placeholder="you@company.com" /></label><label>Company<input required placeholder="Company name" /></label><label>Team size<select><option>1–200</option><option>201–2,000</option><option>2,000+</option></select></label><Button type="submit" className="brand-button">Request demo <ArrowRight /></Button></form>}</section>
    </main>
    <footer className="launch-footer"><Link className="wordmark" to="/">SkipWait<span className="brand-dot">.</span></Link><span>DESIGN PREVIEW · EXAMPLE PRICING</span><Link to="/employer">Employer workspace preview</Link><Link to="/safety">Help & safety</Link></footer>
  </div>;
}
