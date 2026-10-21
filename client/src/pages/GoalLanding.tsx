// Goal-first landing v2 (signed out): richer visual pass per
// docs GOAL_LANDING_V2_SPEC (designer Oct 21) - owner ask verified
// phonemsg-01M5F1C6J24DSP30ZHQQJZ7B8M. Doctrine D-120 unchanged: ink on
// white, hairlines, mono numerals/kickers, ONE black commit ("Find your
// company"), one blue (#1D4ED8, the trust-strip verified check), no kit
// yellow/blue, no pills, no invented numbers. Every claim traces to a
// moneyCopy constant or doctrine line. Beta badge/line from betaNotice.ts
// (owner, verified). Logo slot = ONE asset (/brand/lockup-horizontal-mono.svg)
// pending the owner's final model pick - swap = one file.
// Motion: one-time arc draw + section fade-up; prefers-reduced-motion renders
// everything fully with no animation.
import { ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "wouter";
import { GoalButton } from "@/components/goal/GoalButton";
import CookieConsent from "@/components/CookieConsent";
import { applySeo } from "@/lib/seo";
import { BetaBadge, BetaNoticeLine } from "@/components/BetaNotice";
import { GoalBrandBannerArt, GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { BETA_NOTICE_LINE } from "@/lib/betaNotice";
import { ASK_COST_SENTENCE, REFERRING_FREE_LINE } from "@shared/moneyCopy";

const STEPS: Array<{ title: string; body: string }> = [
  { title: "Find your company", body: "See the companies with verified employees inside, and the roles you can ask about." },
  { title: "Send one thoughtful ask", body: `You see the cost before you ask: ${ASK_COST_SENTENCE} Every ask costs the same.` },
  { title: "They decide", body: "An accepted ask opens a private conversation. A referral is an introduction, never a promise of an interview or a job." },
];

const TRUST: Array<{ title: string; body: string; blue: boolean }> = [
  { title: "Verified with a work email", body: "Every referrer proves their company email before they can see a single ask.", blue: true },
  { title: "Hidden until one accepts", body: "Your name stays private until a referrer chooses to open the conversation.", blue: false },
  { title: "Nothing spent while it waits", body: "1 credit only when a verified employee can see your ask - back if you withdraw first.", blue: false },
];

const FAIR_RULES = [
  REFERRING_FREE_LINE,
  "Every ask costs the same: 1 credit when a verified employee can see it, nothing while it waits.",
  "No outcome promises: a referral is an introduction, not an interview or a job.",
  "Private by default: your name stays hidden until a referrer accepts.",
];

const FOOTER_COLS: Array<{ title: string; links: Array<[string, string]> }> = [
  { title: "Product", links: [["/explore", "Explore companies"], ["/jobs", "Browse roles"], ["/pricing", "Pricing"], ["/plans", "Plans"]] },
  { title: "People", links: [["/referrer", "Join as a referrer"], ["/help", "Help"], ["/contact", "Contact"]] },
  { title: "Legal", links: [["/terms", "Terms"], ["/privacy", "Privacy"], ["/refunds", "Refunds"], ["/cancellations", "Cancellation"]] },
];

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fade-up once, when scrolled into view. Reduced motion / no IO: render fully. */
function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion() || !("IntersectionObserver" in window)) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(12px)";
    el.style.transition = "opacity 200ms ease-out, transform 200ms ease-out";
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        el.style.opacity = "1";
        el.style.transform = "none";
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-g-mono text-[11px] font-medium uppercase tracking-[0.14em] text-g-ink-3">
      <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-g-ink" />{children}
    </p>
  );
}

/** Monochrome ask-card art for the referrer path (aria-hidden). */
function AskCardArt() {
  return (
    <div aria-hidden="true" className="rounded-g-sheet border border-g-control-edge p-5">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 24 24" className="size-6" focusable="false"><circle cx="12" cy="8" r="4" fill="#0A0A0A" /><path d="M4 21 a8 6 0 0 1 16 0 Z" fill="#0A0A0A" /></svg>
        <div className="flex-1">
          <div className="h-2 w-3/4 rounded-full bg-g-ink" />
          <div className="mt-2 h-2 w-1/2 rounded-full bg-g-ink-3" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className="rounded-[3px] bg-g-ink px-3 py-1 font-g-mono text-[11px] font-medium text-g-on-primary">Accept</span>
        <span className="rounded-[3px] border border-g-control-edge px-3 py-1 font-g-mono text-[11px] font-medium text-g-ink-2">Pass</span>
      </div>
      <p className="mt-3 text-center font-g-mono text-[10px] uppercase tracking-[0.14em] text-g-ink-3">Always free for referrers</p>
    </div>
  );
}

export default function GoalLanding() {
  useEffect(() => {
    applySeo({ title: "Get referred.", description: "Ask a verified employee at the company you want to join. They choose every referral. No commissions, no outcome promises.", path: "/" });
  }, []);

  return (
    <div className="min-h-screen bg-g-canvas font-g-sans text-g-ink">
      <header className="flex items-center justify-between border-b border-g-hairline px-5 gdesk:px-10" style={{ height: "var(--g-topbar-h)" }}>
        <span className="inline-flex items-center gap-2">
          <Link href="/" aria-label="skipwait.me home" className="inline-flex items-center"><GoalBrandMark /></Link>
          <BetaBadge tone="goal" />
        </span>
        <nav aria-label="Website navigation" className="flex items-center gap-5">
          <a href="#how-it-goes" className="hidden text-g-meta text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink gdesk:inline">How it goes</a>
          <a href="#fair-rules" className="hidden text-g-meta text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink gdesk:inline">Fair rules</a>
          <Link href="/referrer" className="hidden text-g-meta text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink gdesk:inline">Join as a referrer</Link>
          <Link href="/sign-in" className="text-g-meta text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink">Sign in</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-[1120px] px-5 gdesk:px-10">
        <section className="py-14 gdesk:py-24">
          <div className="max-w-[640px]">
            <Kicker>Private job referrals</Kicker>
            <h1 className="mt-4 text-[52px] font-semibold leading-[1.02] tracking-[-0.045em] gdesk:text-[88px]">Get referred.</h1>
            <p className="mt-4 max-w-xl text-g-body text-g-ink-2">Ask a verified employee at the company you want to join. They choose every referral: no commissions, no outcome promises.</p>
            <div className="mt-8 rounded-g-sheet border border-g-control-edge p-5" data-testid="goal-next-step">
              <span className="font-g-mono text-[11px] font-medium uppercase tracking-[0.14em] text-g-ink-3">Your next step</span>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <GoalButton asChild variant="primary" size="md"><Link href="/explore">Find your company <ArrowRight aria-hidden="true" /></Link></GoalButton>
                <span className="text-g-meta text-g-ink-3">Explore before signing in.</span>
              </div>
            </div>
            <BetaNoticeLine tone="goal" />
          </div>
          <div className="mt-10 rounded-[16px] border border-g-hairline px-5 py-4 gdesk:px-9 gdesk:py-8" data-testid="goal-hero-banner">
            <GoalBrandBannerArt className="mx-auto h-[240px] w-auto gdesk:h-[380px]" />
          </div>
        </section>

        <section aria-label="Why you can trust it" className="grid gap-6 border-y border-g-hairline py-8 gdesk:grid-cols-3">
          {TRUST.map(cell => (
            <div key={cell.title}>
              <p className="flex items-center gap-2 text-g-label">
                {cell.blue
                  ? <Check aria-hidden="true" className="size-4 text-[#1D4ED8]" />
                  : <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-g-ink" />}
                {cell.title}
              </p>
              <p className="mt-1 text-g-meta text-g-ink-2">{cell.body}</p>
            </div>
          ))}
        </section>

        <Reveal>
          <section id="how-it-goes" aria-labelledby="how-it-goes-h" className="py-14 gdesk:py-24">
            <Kicker>How it goes</Kicker>
            <h2 id="how-it-goes-h" className="mt-3 text-g-display text-[32px] tracking-[-0.03em] gdesk:text-[40px]">Three steps. No noise.</h2>
            <ol className="mt-8 grid gap-8 gdesk:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="border-t border-g-ink pt-4">
                  <span className="font-g-mono text-g-mono text-g-ink-3">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="mt-2 text-g-label">{step.title}</h3>
                  <p className="mt-1 text-g-meta text-g-ink-2">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>
        </Reveal>

        <Reveal>
          <section aria-label="The honest deal" className="border-t border-g-hairline py-16 gdesk:py-24">
            <div className="mx-auto max-w-[720px] text-center">
              <blockquote className="text-[28px] font-semibold leading-[1.2] tracking-[-0.03em] gdesk:text-[40px]">
                &ldquo;A referral is an introduction, <span className="text-g-ink-3">never a promise of an interview or a job.</span>&rdquo;
              </blockquote>
              <p className="mt-4 font-g-mono text-[11px] font-medium uppercase tracking-[0.14em] text-g-ink-3">The honest deal - on every page, in every flow</p>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section aria-labelledby="for-employees-h" className="grid items-center gap-10 border-t border-g-hairline py-14 gdesk:grid-cols-2 gdesk:py-24">
            <div>
              <Kicker>For employees</Kicker>
              <h2 id="for-employees-h" className="mt-3 text-g-display text-[32px] tracking-[-0.03em] gdesk:text-[40px]">Work somewhere people ask about?</h2>
              <p className="mt-4 max-w-xl text-g-body text-g-ink-2">{`Review asks when it feels right. ${REFERRING_FREE_LINE} Seekers can trust it.`}</p>
              <div className="mt-6">
                <GoalButton asChild variant="outline" size="md"><Link href="/referrer">Join as a referrer <ArrowRight aria-hidden="true" /></Link></GoalButton>
              </div>
            </div>
            <Reveal className="max-w-md"><AskCardArt /></Reveal>
          </section>
        </Reveal>

        <Reveal>
          <section id="fair-rules" aria-labelledby="fair-rules-h" className="border-t border-g-hairline py-14 gdesk:py-24">
            <div className="max-w-[720px]">
              <Kicker>Fair rules</Kicker>
              <h2 id="fair-rules-h" className="mt-3 text-g-display text-[32px] tracking-[-0.03em] gdesk:text-[40px]">What never changes</h2>
              <ul className="mt-6 divide-y divide-g-hairline">
                {FAIR_RULES.map((rule, index) => (
                  <li key={rule} className="flex gap-6 py-4">
                    <span className="font-g-mono text-g-mono text-g-ink-3">{String(index + 1).padStart(2, "0")}</span>
                    <span className="text-g-meta text-g-ink-2">{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </Reveal>
      </main>

      <footer className="border-t border-g-hairline px-5 py-10 gdesk:px-10">
        <div className="mx-auto grid max-w-[1120px] gap-8 gdesk:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <GoalBrandMark iconClassName="h-5 w-auto" />
            <p className="mt-3 text-g-meta text-g-ink-2">A warmer way in. Private job referrals from verified employees.</p>
            <p className="mt-2 text-g-meta text-g-ink-3">{BETA_NOTICE_LINE}</p>
          </div>
          {FOOTER_COLS.map(col => (
            <nav key={col.title} aria-label={col.title}>
              <p className="font-g-mono text-[11px] font-medium uppercase tracking-[0.14em] text-g-ink-3">{col.title}</p>
              <ul className="mt-3 grid gap-2">
                {col.links.map(([href, label]) => (
                  <li key={href}><Link href={href} className="text-g-meta text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink">{label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mx-auto mt-8 flex max-w-[1120px] items-center justify-between border-t border-g-hairline pt-4">
          <span className="text-g-badge text-g-ink-3">skipwait.me</span>
          <span className="text-g-badge text-g-ink-3">Made with care, in beta.</span>
        </div>
      </footer>
      <CookieConsent />
    </div>
  );
}
