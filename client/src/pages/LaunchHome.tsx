import { useState } from "react";
import { ArrowRight, ArrowUpRight, Check, HeartHandshake, LockKeyhole, Menu, Minus, Plus, ShieldCheck, X } from "lucide-react";
import { Link } from "wouter";
import { LAUNCH_COMPANIES } from "@/lib/launchCompanies";

/**
 * Kit v4 launch homepage (app/src/components/launch-page.tsx,
 * app/src/routes/index.tsx).
 *
 * NOTE ON THE REFERENCE: this is the ONE designed screen with no capture in
 * `screens/`. The set starts at 00_x (the 404) and 01_explore; the homepage is
 * absent from both `screens/web` and `screens/mobile`. So this screen is built
 * from the kit's source, which is the only reference that exists — and the
 * coverage ratchet has been taught about it explicitly for the same reason.
 *
 * TWO KIT PIECES ARE NOT PORTED, both for the same reason — they have nothing
 * to attach to in this product yet:
 *
 * 1. `ConsentBanner`. It exists to gate analytics SDKs, and there is no
 *    analytics SDK in this app (`.env.example` has no PostHog/Mixpanel key and
 *    no consent component exists anywhere in the client). A banner that
 *    collects a choice nothing reads is worse than no banner.
 * 2. `VisualJourney` as a shared component. The kit ships it as a component
 *    with its own bespoke CSS, which is not part of this repository's token
 *    layer. The three steps are inlined here in kit tokens so the homepage
 *    carries the design without importing a stylesheet we are converging away
 *    from.
 *
 * The door image is the same asset ported for /sign-in.
 */

const QUESTIONS = [
  ["Are job referrals really free?", "Yes. No payments between seekers and referrers, no referral commission, and no paid priority. A referral is a voluntary introduction, not a purchase."],
  ["Do I need to know someone at the company?", "No existing connection is required. Explore companies with available referrers, find a relevant role, and send a thoughtful request. Each referrer chooses which requests to accept."],
  ["What does verification mean?", "Work-email verification confirms ownership of an address on an approved company domain. It does not prove current employment or imply an employer's endorsement."],
  ["Does a referral guarantee an interview?", "No. A referral is an introduction, not a promise. Employers independently decide who to interview and hire."],
] as const;

const STEPS = [
  ["Find a company", "Explore companies where people are open to referral requests."],
  ["Make an ask", "Link one real role and explain, briefly, why you fit."],
  ["Meet someone inside", "A verified employee reviews it and chooses whether to help."],
] as const;

const COMMITMENTS = ["Your name is never public.", "You choose every connection.", "No money changes hands.", "Always on your terms."];

const primary = "brand-button inline-flex items-center gap-2 bg-primary text-sm font-semibold text-primary-foreground";

export default function LaunchHome() {
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div data-skipwait-screen="home" className="bg-background">
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-5">
        <Link href="/" className="text-3xl font-bold">SkipWait<span className="text-primary">.</span></Link>
        <nav aria-label="Website navigation" className="hidden items-center gap-8 text-sm font-medium md:flex">
          <Link href="/explore">Explore companies</Link>
          <Link href="/referrer">For referrers</Link>
          <Link href="/safety">Help &amp; safety</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/sign-in" className="hidden min-h-11 items-center px-3 text-sm font-semibold md:inline-flex">Sign in</Link>
          <Link href="/explore" className="hidden min-h-11 items-center gap-1.5 rounded-lg border-2 border-foreground px-4 text-sm font-semibold sm:inline-flex">
            Explore <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            aria-expanded={menu}
            aria-label={menu ? "Close navigation" : "Open navigation"}
            onClick={() => setMenu(current => !current)}
            className="grid size-11 place-items-center rounded-lg border border-border md:hidden"
          >
            {menu ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {menu && (
        <nav aria-label="Website navigation" className="mx-5 grid gap-1 rounded-lg border border-border bg-background p-3 md:hidden">
          {[["/explore", "Explore companies"], ["/referrer", "For referrers"], ["/safety", "Help & safety"], ["/sign-in", "Sign in"]].map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setMenu(false)} className="flex min-h-11 items-center px-2 text-sm font-semibold">{label}</Link>
          ))}
        </nav>
      )}

      <main>
        <section className="relative isolate min-h-[640px] overflow-hidden">
          <img src="/launch-door.jpg" alt="An open blue door with a yellow path leading through it" className="absolute inset-0 size-full object-cover object-bottom" />
          <div className="relative z-10 mx-auto max-w-3xl px-5 pt-14 text-center">
            <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em]">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />Introducing SkipWait
            </span>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.05] sm:text-6xl">
              Free job referrals.<br />A warmer way in<span className="text-primary">.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              Connect with people inside the companies you want to join. A real introduction. Not another application into the unknown.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/explore" className={primary}>Explore companies <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
            </div>
            <Link href="/referrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
              Already on the inside? Become a referrer <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
            <div className="mt-5 flex flex-wrap justify-center gap-5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Check className="size-3.5" aria-hidden="true" />Referrals are free</span>
              <span className="inline-flex items-center gap-1.5"><Check className="size-3.5" aria-hidden="true" />Explore before signing in</span>
            </div>
          </div>
        </section>

        <section aria-label="Our commitments" className="flex flex-wrap justify-center gap-x-12 gap-y-3 border-y border-border px-5 py-6 text-sm">
          <span className="inline-flex items-center gap-2.5"><HeartHandshake className="size-4" aria-hidden="true" />No referral fees.</span>
          <span className="inline-flex items-center gap-2.5"><LockKeyhole className="size-4" aria-hidden="true" />Private by default.</span>
          <span className="inline-flex items-center gap-2.5"><ShieldCheck className="size-4" aria-hidden="true" />No job guarantees.</span>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <p className="eyebrow text-muted-foreground">Open doors at launch</p>
          <h2 className="mt-3 text-3xl font-semibold">Start somewhere real.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            People at these companies have told SkipWait they are open to referral requests. Availability can change, and every person chooses each ask.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {LAUNCH_COMPANIES.map(company => (
              <Link key={company.slug} href={`/explore/${company.slug}`} className="flex min-h-28 flex-col items-start justify-between gap-2 rounded-lg border border-border p-4">
                <span className="grid size-9 place-items-center rounded-md bg-secondary text-xs font-bold" aria-hidden="true">{company.initials}</span>
                <strong className="text-sm">{company.name}</strong>
                <ArrowUpRight className="size-4 text-primary" aria-hidden="true" />
              </Link>
            ))}
          </div>
          <Link href="/explore" className="text-link mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold">
            Explore all open doors <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <p className="eyebrow text-muted-foreground">Three steps. One open door.</p>
          <h2 className="mt-3 text-3xl font-semibold">Your way in,<br />made simple.</h2>
          <p className="mt-3 text-sm text-muted-foreground">Find a company. Make an ask. Meet someone inside.</p>
          <ol className="mt-10 grid gap-7 md:grid-cols-3">
            {STEPS.map(([title, body], index) => (
              <li key={title} className="border-t-2 border-border pt-4">
                <span className="font-mono text-[11px] text-primary">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 text-lg font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
          <Link href="/explore" className="text-link mt-8 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold">
            Find your way in <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>

        <section className="bg-secondary">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <p className="eyebrow">For the people on the inside</p>
            <div className="mt-3 grid gap-8 lg:grid-cols-2">
              <div>
                <h2 className="text-3xl font-semibold leading-tight">You could be someone's<br />first open door.</h2>
                <p className="mt-4 max-w-lg text-sm leading-6">
                  A few minutes of your time could help someone take their next step. Choose who you help. Set your own capacity. Keep your identity private until you accept.
                </p>
                <Link href="/referrer" className="brand-button mt-6 inline-flex items-center gap-2 border-2 border-foreground bg-background text-sm font-semibold">
                  Become a referrer <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
              <ul className="grid gap-3 self-center text-sm font-medium">
                {COMMITMENTS.map(item => (
                  <li key={item} className="flex items-center gap-2.5"><Check className="size-4 shrink-0" aria-hidden="true" />{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-2">
          <div>
            <p className="eyebrow text-muted-foreground">Trust, without the fine print</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight">Your career is personal.<br />Your connections should be too.</h2>
          </div>
          <div>
            <p className="text-sm leading-6 text-muted-foreground">
              Referrer names are shared only after they accept your request. Resumes stay private until acceptance. And a referral is an introduction—not a promise of an interview or a job.
            </p>
            <Link href="/safety" className="text-link mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold">
              Our approach to help &amp; safety <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <p className="eyebrow text-muted-foreground">A few good questions</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight">Before you<br />take the next step.</h2>
          </div>
          <div>
            {QUESTIONS.map(([question, answer], index) => (
              <div key={question} className="border-b border-border">
                <button
                  type="button"
                  aria-expanded={open === index}
                  onClick={() => setOpen(current => (current === index ? null : index))}
                  className="flex min-h-14 w-full items-center justify-between gap-4 text-left text-sm font-semibold"
                >
                  {question}
                  {open === index ? <Minus className="size-4 shrink-0" aria-hidden="true" /> : <Plus className="size-4 shrink-0" aria-hidden="true" />}
                </button>
                {open === index && <p className="pb-4 text-sm leading-6 text-muted-foreground">{answer}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border px-5 py-16 text-center">
          <p className="eyebrow text-muted-foreground">Small connection. Big next step.</p>
          <h2 className="mt-3 text-3xl font-semibold">What's on the other side?</h2>
          <div className="mt-6 flex justify-center">
            <Link href="/explore" className={primary}>Explore companies <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Referrals are free. Always.</p>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-xs text-muted-foreground">
        <Link href="/" className="text-xl font-bold text-foreground">SkipWait<span className="text-primary">.</span></Link>
        <span>A warmer way in. · skipwait.me</span>
        <span className="flex flex-wrap gap-4">
          <Link href="/help">Help</Link>
          <Link href="/guidelines">Guidelines</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/for-companies" className="inline-flex items-center gap-1">For companies <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
        </span>
      </footer>
    </div>
  );
}
