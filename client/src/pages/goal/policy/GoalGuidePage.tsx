// The three guides on the goal system (D-048-p3-policy; the guide routes are in
// GOAL_SURFACES.policy). GuidePage switches here; the words come from
// @/content/guides exactly as the kit page renders them, and the H1 stays the
// route's declared title so the head, the sitemap and the page agree.
// Prerendered and fetch-free (GoalStaticFrame only).
import { GoalStaticFrame } from "@/components/goal/GoalStaticFrame";
import { relatedGuides, type Guide } from "@/content/guides";
import { publicRoute, type PublicRoute } from "@shared/publicRoutes";
import { GoalBreadcrumbs } from "./GoalPolicyPage";

export function GoalGuidePage({ guide, route }: { guide: Guide; route: PublicRoute }) {
  return (
    <GoalStaticFrame>
      <div data-testid="goal-policy" data-skipwait-screen={guide.route}>
        <GoalBreadcrumbs path={route.route} />
        <header className="mt-6">
          <h1 className="text-g-display text-g-ink">{route.title}</h1>
          <p className="mt-3 text-g-body text-g-ink-2">{guide.intro}</p>
        </header>
        {guide.sections.map(section => (
          <section key={section.heading} className="mt-8 border-t border-g-hairline pt-6">
            <h2 className="text-g-heading text-g-ink">{section.heading}</h2>
            <div className="mt-3 space-y-3 text-g-body text-g-ink-2">
              {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
              {section.points ? <ul className="list-disc space-y-2 pl-5">{section.points.map(point => <li key={point}>{point}</li>)}</ul> : null}
            </div>
          </section>
        ))}
        <section aria-labelledby={`${guide.route}-faq`} className="mt-10 border-t border-g-hairline pt-6">
          <h2 id={`${guide.route}-faq`} className="text-g-heading text-g-ink">Questions people ask</h2>
          <dl className="mt-4 space-y-4">
            {guide.faq.map(entry => (
              <div key={entry.question}>
                <dt className="text-g-label text-g-ink">{entry.question}</dt>
                <dd className="mt-1 text-g-body text-g-ink-2">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
        <nav aria-label="Other guides" className="mt-10 border-t border-g-hairline pt-6">
          <h2 className="text-g-label text-g-ink-2">Related reading</h2>
          <ul className="mt-3 grid gap-3">
            {relatedGuides(guide).map(sibling => (
              <li key={sibling.route}>
                <a href={sibling.route} className="text-g-label text-g-ink underline decoration-g-control-edge underline-offset-4 hover:decoration-g-ink">{publicRoute(sibling.route)?.title}</a>
                <span className="block text-g-meta text-g-ink-2">{sibling.summary}</span>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </GoalStaticFrame>
  );
}
