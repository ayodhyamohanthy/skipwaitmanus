import { useEffect } from "react";
import { useLocation } from "wouter";
import { publicRoute } from "@shared/publicRoutes";
import { applySeo, seoClaimedByPage } from "@/lib/seo";

/**
 * Writes the document head on every route change.
 *
 * WHY THIS EXISTS: `applySeo` was called by 10 of 83 page components. In a
 * single-page app that means every other route kept whatever title the previous
 * page left behind -- navigate from /plans to /settings and the tab still reads
 * "Referral plans and credits". A crawler following an in-app link sees the same
 * thing. The registry in @shared/publicRoutes already knows the right answer for
 * every public URL; nothing was reading it at runtime.
 *
 * ONE handler, not 73 edits. Adding an `applySeo` call to every page would
 * duplicate the registry into the components and let the two drift, which is
 * exactly what the registry's own docstring says it exists to prevent.
 *
 * TWO RULES IT ENFORCES:
 *
 * 1. A path in PUBLIC_ROUTES gets its registry title and description, and
 *    `index,follow`.
 * 2. A path NOT in PUBLIC_ROUTES gets `noindex,nofollow`. The registry's
 *    contract is that an unlisted path "is not a page we ask a crawler to
 *    index"; without the tag that is a statement of intent rather than a fact,
 *    and /admin, /settings and /thread end up indexable through any link to
 *    them. This is the mechanism that makes the contract true.
 *
 * PAGES STILL WIN. A page that owns dynamic metadata -- ExploreCompany naming a
 * company, JobExplorer emitting JobPosting data -- calls applySeo itself. React
 * runs child effects before parent effects, so this handler runs AFTER the page
 * and would overwrite it; `seoClaimedByPage` is how it knows to stand down.
 */

/** Paths whose real URL is dynamic; the registry entry is a template, not a page. */
function isDynamicPath(path: string): boolean {
  return /^\/[^/]+\/[^/]+/.test(path) || /\/(?:p|refer|share-card|email-review|fast)\//.test(path);
}

export default function RouteSeo() {
  const [location] = useLocation();

  useEffect(() => {
    // A query string is not part of the canonical path.
    const path = location.split("?")[0]?.split("#")[0] || "/";
    if (seoClaimedByPage(path)) return;

    const route = publicRoute(path);
    if (route) {
      applySeo({ title: route.title, description: route.description, path, noindex: false, claim: false });
      return;
    }

    // Unlisted. Detail pages (/p/:handle, /explore/:slug) are private or
    // per-record and are noindexed the same way -- they are reachable by link
    // but are not pages we ask a crawler to keep.
    applySeo({
      title: isDynamicPath(path) ? "skipwait.me" : "skipwait.me",
      path,
      noindex: true,
      claim: false,
    });
  }, [location]);

  return null;
}
