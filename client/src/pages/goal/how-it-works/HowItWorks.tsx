// MOBILE-landing-choice (D-414, packet docs/plans/MOBILE-app-flow.md rule 5):
// the landing's proof - mass applying vs a referral with the Jobvite figures
// and their source, the three steps, trust, fair rules - on one indexable page,
// linked from the one-screen phone landing. It renders the same components as
// the desktop landing (GoalLandingV9), so the figures cannot drift. The route
// always resolves; the sitemap, the prerender and the landing link list it only
// while MOBILE_LANDING_V2 is on.
import { useEffect } from "react";
import { Link } from "wouter";
import CookieConsent from "@/components/CookieConsent";
import { BetaBadge } from "@/components/BetaNotice";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { applySeo } from "@/lib/seo";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { HOW_IT_WORKS_H1, HOW_IT_WORKS_LEAD, MOBILE_LANDING } from "@shared/landingContent";
import { publicRoute } from "@shared/publicRoutes";
import { V9Footer, V9ProofSections } from "../../GoalLandingV9";

export default function HowItWorks() {
  useEffect(() => {
    applySeo({ title: HOW_IT_WORKS_H1, description: publicRoute("/how-it-works")?.description ?? HOW_IT_WORKS_LEAD, path: "/how-it-works" });
  }, []);
  return (
    <div className="min-h-screen bg-white font-g-sans text-g-ink">
      <header className="border-b border-g-hairline">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 gdesk:h-16 gdesk:px-8">
          <div className="flex items-center gap-2">
            <Link href="/" aria-label="skipwait.me home" className="inline-flex items-center"><GoalBrandMark /></Link>
            <BetaBadge tone="goal" />
          </div>
          <Link href="/sign-in" className="inline-flex h-11 items-center px-1 text-g-small font-medium">Sign in</Link>
        </div>
      </header>

      <section className="border-b border-g-hairline">
        <div className="mx-auto max-w-[1120px] px-5 pb-12 pt-10 gdesk:px-8 gdesk:pb-16 gdesk:pt-16">
          <h1 className="text-[36px] font-semibold leading-[1.02] tracking-[-0.035em] gdesk:text-[56px]">{HOW_IT_WORKS_H1}</h1>
          <p className="mt-4 max-w-[560px] text-g-body leading-[1.6] text-g-ink-2">{HOW_IT_WORKS_LEAD}</p>
          <div className="mt-6 flex flex-col gap-2 gdesk:flex-row">
            <Link href="/explore" className="inline-flex h-12 items-center justify-center rounded-[10px] bg-g-ink px-5 text-g-small font-semibold text-g-ink-inverse hover:bg-g-primary-hover" data-testid="goal-next-step">{MOBILE_LANDING.seekerTitle} <span aria-hidden="true" className="ml-2">&rarr;</span></Link>
            <Link href={referrerSignInHref()} className="inline-flex h-12 items-center justify-center rounded-[10px] border border-g-ink px-5 text-g-small font-semibold hover:bg-g-surface-hover">{MOBILE_LANDING.referrerTitle} <span aria-hidden="true" className="ml-2">&rarr;</span></Link>
          </div>
        </div>
      </section>

      <V9ProofSections />
      <V9Footer />
      <CookieConsent />
    </div>
  );
}
