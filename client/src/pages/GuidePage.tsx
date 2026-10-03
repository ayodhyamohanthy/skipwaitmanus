import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { applySeo, faqJsonLd } from "@/lib/seo";
import { Breadcrumbs } from "@/components/PolicyPageShell";
import { publicRoute } from "@shared/publicRoutes";
import { guideFor, relatedGuides } from "@/content/guides";

/**
 * One component behind all three guide routes.
 *
 * The path comes from the router rather than a prop so the prerender step can
 * render the same component the app renders: @scripts/prerender-public-pages
 * mounts it inside <Router ssrPath={route}>, which is what makes the
 * crawler-visible HTML the page a visitor actually gets.
 *
 * Copy rules are in @/content/guides. Title, description, and canonical URL
 * come from @shared/publicRoutes so the head, the sitemap, and this page cannot
 * disagree.
 */
export default function GuidePage() {
  const [location] = useLocation();
  const guide = guideFor(location);
  const route = guide ? publicRoute(guide.route) : undefined;

  useEffect(() => {
    if (!guide || !route) return;
    applySeo({ title: route.title, description: route.description, path: route.route, jsonLd: faqJsonLd(guide.faq) });
  }, [guide, route]);

  if (!guide || !route) return null;

  return (
    <main data-skipwait-screen={guide.route} className="min-h-screen bg-white px-5 py-5 text-black sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs path={route.route} />
        <header className="mt-6">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-[-.02em] sm:text-5xl">{route.title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#505050] sm:text-lg">{guide.intro}</p>
        </header>
        {guide.sections.map(section => (
          <section key={section.heading} className="mt-8 border-t border-[#e5e5e5] pt-6">
            <h2 className="text-xl font-semibold tracking-[-.01em]">{section.heading}</h2>
            <div className="mt-3 space-y-3 text-[15px] leading-7 text-[#3d3d3d]">
              {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
              {section.points ? <ul className="list-disc space-y-2 pl-5">{section.points.map(point => <li key={point}>{point}</li>)}</ul> : null}
            </div>
          </section>
        ))}
        <section aria-labelledby={`${guide.route}-faq`} className="mt-10 border-t border-[#e5e5e5] pt-6">
          <h2 id={`${guide.route}-faq`} className="text-xl font-semibold tracking-[-.01em]">Questions people ask</h2>
          <dl className="mt-4 space-y-4">
            {guide.faq.map(entry => (
              <div key={entry.question}>
                <dt className="font-semibold">{entry.question}</dt>
                <dd className="mt-1 text-[15px] leading-7 text-[#3d3d3d]">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
        {/* Sibling guides. Also what keeps each guide above the inbound-link
            floor: without cross-links the three would only be reachable from
            the home page. */}
        <nav aria-label="Other guides" className="mt-10 border-t border-[#e5e5e5] pt-6">
          <h2 className="text-sm font-semibold text-[#505050]">Related reading</h2>
          <ul className="mt-3 grid gap-3">
            {relatedGuides(guide).map(sibling => (
              <li key={sibling.route}>
                <Link href={sibling.route} className="font-semibold text-black underline decoration-[#cfcfcf] underline-offset-4 hover:decoration-black">{publicRoute(sibling.route)?.title}</Link>
                <span className="block text-sm leading-6 text-[#505050]">{sibling.summary}</span>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
