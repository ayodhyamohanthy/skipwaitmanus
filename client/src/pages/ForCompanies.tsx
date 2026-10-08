import { ArrowRight, BarChart3, Building2, Check, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { LAUNCH_COMPANIES } from "@/lib/companies";

const VALUE = [
  { icon: Users, title: "Referrals from people who know the work", text: "Employees choose who to refer. You get context, not cold applications." },
  { icon: BarChart3, title: "Private by default", text: "Candidate names and resumes stay hidden until a verified employee accepts." },
  { icon: ShieldCheck, title: "Your team stays in control", text: "Passing is private and always okay. Nobody is ranked or pressured." },
  { icon: Check, title: "Candidates never pay", text: "No commissions, no paid priority, no pay-to-win — enforced in the product." },
];

export default function ForCompanies() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");

  return (
    <div data-skipwait-screen="for-companies">
      <header className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-3 px-5">
        <Link href="/" className="text-2xl font-semibold tracking-[-.03em]" aria-label="SkipWait home">SkipWait<span className="brand-dot">.</span></Link>
        <nav aria-label="Company navigation" className="flex items-center gap-5 text-sm font-medium">
          <Link href="/explore" className="hidden sm:inline">Explore</Link>
          <Link href="/pricing" className="hidden sm:inline">Pricing</Link>
          <Link href="/employer" className="brand-button min-h-11 text-sm">Employer workspace</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16">
        <section className="pb-10 pt-12 text-left md:pt-[70px]">
          <span className="eyebrow">For employers</span>
          <h1 className="mt-4 text-[clamp(36px,6vw,68px)] font-semibold leading-[1.05]">Your best hires already<br />know someone inside<span className="brand-dot">.</span></h1>
          <p className="mt-4 max-w-[620px] text-[17px] leading-relaxed text-[var(--muted-foreground)]">SkipWait turns employee referrals into a trusted, measurable channel. Candidates never pay. Your team stays in control.</p>
          <div className="mt-8 flex flex-wrap justify-start gap-3">
            <a href="#demo" className="brand-button">Book a demo <ArrowRight /></a>
            <Link href="/pricing" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">See pricing</Link>
          </div>
        </section>

        <section aria-label="Launch companies" className="py-8">
          <span className="eyebrow">REFERRAL DOORS OPEN AT LAUNCH</span>
          <div className="mt-3.5 flex flex-wrap gap-3">
            {LAUNCH_COMPANIES.map(item => <span key={item.slug} className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--border)] px-4 py-3 font-semibold"><Building2 className="size-4 text-[var(--primary)]" />{item.name}</span>)}
          </div>
        </section>

        <section className="py-14">
          <h2 className="text-3xl font-semibold">What you get</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VALUE.map(item => (
              <article key={item.title} className="rounded-3xl border border-[var(--border)] p-6">
                <item.icon className="size-6 text-[var(--primary)]" />
                <h3 className="mt-3 font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="flex items-start gap-4 rounded-3xl border-2 border-[var(--foreground)] bg-[var(--secondary)] p-6 shadow-[var(--shadow-offset)]">
          <ShieldCheck className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
          <ul className="grid flex-1 gap-3 sm:grid-cols-2">
            {["Candidates never pay to be referred", "No paid ranking of candidates", "Employees can decline without pressure", "Names shared only on acceptance"].map(text => (
              <li key={text} className="flex items-start gap-2 text-sm font-semibold"><Check className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />{text}</li>
            ))}
          </ul>
        </section>

        <section id="demo" aria-label="Book a demo" className="mt-14 max-w-[520px] rounded-3xl border-2 border-[var(--foreground)] p-6 shadow-[var(--shadow-offset)] sm:p-7">
          <h2 className="text-2xl font-semibold">Book a 20-minute demo</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Opens your email app addressed to our team — nothing is submitted silently.</p>
          <label className="mt-5 block text-sm font-semibold">Work email
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
          </label>
          <label className="mt-4 block text-sm font-semibold">Company
            <input value={company} onChange={event => setCompany(event.target.value)} placeholder="Company name" className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
          </label>
          <a
            href={`mailto:hello@skipwait.me?subject=${encodeURIComponent(`Demo request${company.trim() ? ` — ${company.trim()}` : ""}`)}&body=${encodeURIComponent(`Hi SkipWait team,\n\nWe'd like a 20-minute demo for ${company.trim() || "our company"}.\n\nContact: ${email.trim()}\n\nThanks!`)}`}
            className="brand-button mt-6 w-full"
          >
            Request demo <ArrowRight />
          </a>
        </section>

        <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-6 text-xs text-[var(--muted-foreground)]">
          <span className="text-xl font-semibold text-[var(--foreground)]">SkipWait<span className="brand-dot">.</span></span>
          <span className="flex gap-4"><Link href="/employer" className="underline">Employer workspace</Link><Link href="/safety" className="underline">Help &amp; safety</Link></span>
        </footer>
      </main>
    </div>
  );
}
