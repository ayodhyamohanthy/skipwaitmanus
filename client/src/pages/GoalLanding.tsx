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
import { GoalVerifiedMark } from "@/components/goal/GoalVerifiedMark";
import { BETA_NOTICE_LINE } from "@/lib/betaNotice";
import { askCostLanding } from "@shared/moneyCopy";
import { goalLandingFairRules, GOAL_FOOTER_COLS } from "@shared/landingContent";

// D-132 item 7: level-aware ask cost wording behind the same flag as the cost itself.
export const COST_COPY = askCostLanding(import.meta.env.VITE_ASK_LEVEL_COST === "true");

export const STEPS: Array<{ title: string; body: string }> = [
  { title: "Find your company", body: "See the companies with verified employees inside, and the roles you can ask about." },
  { title: "Send one thoughtful ask", body: COST_COPY.stepBody },
  { title: "They decide", body: "An accepted ask opens a private conversation. A referral is an introduction, never a promise of an interview or a job." },
];

export const TRUST: Array<{ title: string; body: string; blue: boolean }> = [
  { title: "Verified with a work email", body: "Every referrer proves their company email before they can see a single ask.", blue: true },
  { title: "Hidden until one accepts", body: "Your name stays private until a referrer chooses to open the conversation.", blue: false },
  { title: "Nothing spent while it waits", body: COST_COPY.waitBody, blue: false },
];

export const FAIR_RULES = goalLandingFairRules(COST_COPY);

export const FOOTER_COLS = GOAL_FOOTER_COLS;

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fade-up once, when scrolled into view. Reduced motion / no IO: render fully. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
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

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-g-mono text-[11px] font-medium uppercase tracking-[0.14em] text-g-ink-3">
      <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-g-ink" />{children}
    </p>
  );
}

/** Monochrome ask-card art for the referrer path (aria-hidden). */
export function AskCardArt() {
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

      {/* v7 warm hero band - the ONLY colour on the page (owner pick 16:43). */}
      <section className="g-hero-warm">
        <div className="mx-auto max-w-[760px] px-5 pt-16 text-center gdesk:pt-24">
          <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-2">Private job referrals</p>
          <h1 className="mt-5 text-[52px] font-semibold leading-[0.98] tracking-[-0.045em] gdesk:text-[88px]">Get referred.</h1>
          <p className="mx-auto mt-5 max-w-[480px] text-g-body leading-[1.6] text-g-ink-2">Ask a verified employee at the company you want to join. They choose every referral: no commissions, no outcome promises.</p>
          <div className="mt-8" data-testid="goal-next-step">
            <Link href="/explore" data-g-primary="true" className="inline-flex h-12 items-center gap-2 rounded-full bg-g-ink px-6 text-g-small font-semibold text-g-ink-inverse hover:bg-g-primary-hover">Find your company <span aria-hidden="true">&rarr;</span></Link>
          </div>
          <p className="mt-3 text-[13px] text-g-ink-3">Explore before signing in.</p>
          <div className="mt-3 flex justify-center"><BetaNoticeLine tone="goal" /></div>
        </div>
        <div className="mx-auto mt-8 max-w-[1120px] px-5 gdesk:mt-12" data-testid="goal-hero-banner">
          <GoalBrandBannerArt className="mx-auto block h-[220px] w-auto gdesk:h-[340px]" />
        </div>
      </section>

      <section id="how" className="border-b border-g-hairline">
        <div className="mx-auto max-w-[1120px] px-5 py-14 gdesk:px-8 gdesk:py-24">
          <Reveal>
            <Kicker>How it goes</Kicker>
            <h2 className="mt-4 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]">Three steps.{" "}<br />No noise.</h2>
          </Reveal>
          <ol className="mt-10">
            {STEPS.map((step, i) => (
              <li key={step.title} className={i > 0 ? "border-t border-g-hairline" : ""}>
              <Reveal>
                <div className="grid gap-2 py-7 gdesk:grid-cols-[140px_1fr] gdesk:gap-8 gdesk:py-8">
                  <span className="font-g-mono text-[44px] font-medium leading-none text-g-hairline gdesk:text-[56px]" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="text-[17px] font-semibold">{step.title}</h3>
                    <p className="mt-2 max-w-[520px] text-g-small leading-[1.6] text-g-ink-2">{step.body}</p>
                  </div>
                </div>
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
            <h2 className="mt-4 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]">Verified people.<br />Real rules.</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 gdesk:grid-cols-3">
            {TRUST.map((item) => (
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
            <h2 className="mt-4 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]">Work somewhere people ask about?</h2>
            <p className="mt-4 max-w-[440px] text-g-body leading-[1.6] text-g-ink-2">Review asks when it feels right. Referring is always free. Referrers are never paid - their help stays genuine, and seekers can trust it.</p>
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

      <footer>
        <div className="mx-auto grid max-w-[1120px] gap-10 px-5 py-12 gdesk:grid-cols-[1.4fr_1fr_1fr_1fr] gdesk:px-8 gdesk:py-16">
          <div>
            <GoalBrandMark iconClassName="h-5 w-auto" />
            <p className="mt-4 max-w-[260px] text-g-small leading-[1.6] text-g-ink-2">A warmer way in. Private job referrals from verified employees.</p>
          </div>
          {FOOTER_COLS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map(([href, label]) => (
                  <li key={label}><Link href={href} className="text-g-small text-g-ink-2 hover:text-g-ink">{label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-g-hairline">
          <div className="mx-auto flex max-w-[1120px] items-center justify-between px-5 py-5 text-[13px] text-g-ink-3 gdesk:px-8">
            <span>skipwait.me</span>
            <span>Made with care, in beta.</span>
          </div>
        </div>
      </footer>
      <CookieConsent />

    </div>
  );
}
