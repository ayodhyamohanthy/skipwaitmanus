import { useEffect } from "react";
import { useLocation } from "wouter";
import { applySeo, faqJsonLd } from "@/lib/seo";
import { publicRoute } from "@shared/publicRoutes";
import { guideFor } from "@/content/guides";
import { GoalGuidePage } from "@/pages/goal/policy/GoalGuidePage";

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
  return <GoalGuidePage guide={guide} route={route} />;
}
