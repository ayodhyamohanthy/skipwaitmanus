// Goal-first landing (signed out), migration spec docs/plans/GOAL_UI_MIGRATION.md
// + doctrine design/goal-ui/DOCTRINE.md (D-120). Contract row: goal line
// "Get referred."; one black commit "Find your company"; 3-step how-it-goes;
// fair rules; "Join as a referrer" link. No yellow/blue kit language: ink on
// white, hairlines, mono numerals, dot+text status (no statuses here).
// Honesty: every claim is an existing moneyCopy constant or a doctrine rule;
// no invented numbers. FAQ json-ld dropped (no visible FAQ on this pattern).
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { Link } from "wouter";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNum } from "@/components/goal/GoalNum";
import CookieConsent from "@/components/CookieConsent";
import { applySeo } from "@/lib/seo";
import { ASK_COST_SENTENCE, REFERRING_FREE_LINE } from "@shared/moneyCopy";

const STEPS: Array<{ title: string; body: string }> = [
  { title: "Find your company", body: "See the companies with verified employees inside, and the roles you can ask about." },
  { title: "Send one thoughtful ask", body: `You see the cost before you ask: ${ASK_COST_SENTENCE} Every ask costs the same.` },
  { title: "They decide", body: "An accepted ask opens a private conversation. A referral is an introduction, never a promise of an interview or a job." },
];

const FAIR_RULES = [
  REFERRING_FREE_LINE,
  "Every ask costs the same: 1 credit when a verified employee can see it, nothing while it waits.",
  "No outcome promises: a referral is an introduction, not an interview or a job.",
  "Private by default: your name stays hidden until a referrer accepts.",
];

const FOOTER_LINKS: Array<[string, string]> = [
  ["/help", "Help"], ["/guidelines", "Guidelines"], ["/terms", "Terms"], ["/privacy", "Privacy"], ["/refunds", "Refunds"], ["/cancellations", "Cancellation"], ["/shipping", "Shipping"], ["/contact", "Contact"],
];

export default function GoalLanding() {
  useEffect(() => {
    applySeo({ title: "Get referred.", description: "Ask a verified employee at the company you want to join. They choose every referral. No commissions, no outcome promises.", path: "/" });
  }, []);

  return (
    <div className="min-h-screen bg-g-canvas font-g-sans text-g-ink">
      <header className="flex items-center justify-between border-b border-g-hairline px-5 gdesk:px-10" style={{ height: "var(--g-topbar-h)" }}>
        <Link href="/" aria-label="skipwait.me home" className="text-g-label tracking-tight">skipwait.me</Link>
        <nav aria-label="Website navigation" className="flex items-center gap-5">
          <Link href="/referrer" className="hidden text-g-meta text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink gdesk:inline">Join as a referrer</Link>
          <Link href="/sign-in" className="text-g-meta text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink">Sign in</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-5 gdesk:px-10">
        <section className="py-14 gdesk:py-20">
          <h1 className="text-g-display gdesk:text-[40px] gdesk:leading-[48px]">Get referred.</h1>
          <p className="mt-4 max-w-xl text-g-body text-g-ink-2">Ask a verified employee at the company you want to join. They choose every referral: no commissions, no outcome promises.</p>
          <div className="mt-8 rounded-g-sheet border border-g-control-edge p-5" data-testid="goal-next-step">
            <span className="text-g-badge uppercase tracking-[0.08em] text-g-ink-3">Your next step</span>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <GoalButton asChild variant="primary" size="md"><Link href="/explore">Find your company <ArrowRight aria-hidden="true" /></Link></GoalButton>
              <span className="text-g-meta text-g-ink-3">Explore before signing in.</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="how-it-goes" className="border-t border-g-hairline py-10">
          <h2 id="how-it-goes" className="text-g-heading">How it goes</h2>
          <ol className="mt-6 grid gap-6 gdesk:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <GoalNum className="text-g-ink-3">{index + 1}</GoalNum>
                <h3 className="mt-2 text-g-label">{step.title}</h3>
                <p className="mt-1 text-g-meta text-g-ink-2">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="fair-rules" className="border-t border-g-hairline py-10">
          <h2 id="fair-rules" className="text-g-heading">Fair rules</h2>
          <ul className="mt-4 divide-y divide-g-hairline">
            {FAIR_RULES.map(rule => <li key={rule} className="py-3 text-g-meta text-g-ink-2">{rule}</li>)}
          </ul>
          <Link href="/referrer" className="mt-6 inline-flex items-center gap-1.5 text-g-meta text-g-ink underline decoration-g-control-edge underline-offset-[3px] transition-colors duration-(--g-dur-hover) ease-g-out hover:decoration-g-ink">Join as a referrer <ArrowRight aria-hidden="true" className="size-3.5" /></Link>
        </section>
      </main>

      <footer className="border-t border-g-hairline px-5 py-8 gdesk:px-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <span className="text-g-meta text-g-ink-3">skipwait.me · A warmer way in.</span>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
            {FOOTER_LINKS.map(([href, label]) => <Link key={href} href={href} className="text-g-badge text-g-ink-3 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink">{label}</Link>)}
          </nav>
        </div>
      </footer>
      <CookieConsent />
    </div>
  );
}
