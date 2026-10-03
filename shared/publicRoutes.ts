/**
 * Canonical registry for every public, indexable skipwait.me URL.
 *
 * One table is the source of truth for the sitemap
 * (@functions/sitemap.xml.ts), the no-JavaScript HTML the build writes
 * (@scripts/prerender-public-pages.tsx), and the client <head>
 * (@client/src/lib/seo.ts). A path that is not listed here is not a page we ask
 * a crawler to index, which is what stops the site from advertising an infinite
 * soft-404 surface to Google.
 *
 * Descriptions are the copy a search engine shows under the title, so they are
 * written to be read on their own. They must stay true to what the page
 * renders: no count, price, or outcome the product does not itself produce.
 */
import { LANDING_SUMMARY, LANDING_TITLE } from "./landingContent";

export type ChangeFreq = "hourly" | "daily" | "weekly" | "monthly";

export type PublicRoute = {
  /** Canonical path, no trailing slash. `/` is the home page. */
  readonly route: string;
  /** `<title>` text, without the ` — skipwait.me` suffix. */
  readonly title: string;
  /** SERP description. Keep at or under 160 characters. */
  readonly description: string;
  readonly changefreq: ChangeFreq;
  readonly priority: string;
};

export const SITE_ORIGIN = "https://skipwait.me";

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { route: "/", title: LANDING_TITLE, description: LANDING_SUMMARY, changefreq: "daily", priority: "1.0" },
  { route: "/jobs", title: "Browse roles worth a referral", description: "Search published roles, save the ones you like, and request a private referral from a verified employee at the company.", changefreq: "daily", priority: "0.9" },
  { route: "/wall", title: "Internal openings shared by verified employees", description: "Hiring-now roles and walk-in events published privately by verified employees, with the company domain and the role details.", changefreq: "hourly", priority: "0.9" },
  { route: "/referrer", title: "Verify a work email to review private referrals", description: "Employees verify a company email once, then review private referral requests for their own company and choose whether to help.", changefreq: "weekly", priority: "0.6" },
  { route: "/premium", title: "Buy referral credits for $1 each", description: "Every account gets free referral requests each month. Extra credits cost $1 each (₹99 in India), never expire, and are used only when an employee accepts.", changefreq: "weekly", priority: "0.7" },
  { route: "/plans", title: "Monthly referral plans", description: "Pro and Max monthly plans add referral credits each month on top of the free allowance. Cancel any time.", changefreq: "weekly", priority: "0.6" },
  { route: "/pricing", title: "Pricing", description: "Prices are in Indian rupees (INR) for India and US dollars (USD) everywhere else. The price you pay is shown before checkout.", changefreq: "weekly", priority: "0.6" },
  { route: "/employer", title: "Hire on skipwait.me", description: "Sponsor roles to opt-in job seekers, unlock anonymized opt-in talent, and manage a self-serve promotion budget.", changefreq: "monthly", priority: "0.4" },
  { route: "/job-referral-platforms", title: "Job referral platforms", description: "What a job referral platform is: the three models behind it, who each one suits, how they charge, and what a referral does and does not change.", changefreq: "monthly", priority: "0.6" },
  { route: "/choosing-a-job-referral-platform", title: "Choosing a job referral platform", description: "Four checks that separate a real referral service from a job board with extra steps, plus five red flags and a shortlist template.", changefreq: "monthly", priority: "0.6" },
  { route: "/how-employees-refer-candidates", title: "How employees refer candidates", description: "What happens between an employee deciding to help and the candidate hearing back: what the reviewer reads, how they choose, and what you get.", changefreq: "monthly", priority: "0.6" },
  { route: "/about", title: "About skipwait.me", description: "skipwait.me connects job seekers with verified employees who can refer them for a specific role at their company. What we do, what we sell, and who runs it.", changefreq: "monthly", priority: "0.4" },
  { route: "/contact", title: "Contact skipwait.me", description: "Questions about a payment, a referral request, or your account? Email us and a person will reply.", changefreq: "monthly", priority: "0.4" },
  { route: "/support", title: "Support", description: "Most questions are answered by a screen you already have access to. Money, verification, or data questions reach an administrator.", changefreq: "monthly", priority: "0.3" },
  { route: "/privacy", title: "Privacy & trust", description: "How skipwait.me keeps a referral private: company-matched visibility, documents that stay private, and the controls your account gives you.", changefreq: "monthly", priority: "0.3" },
  { route: "/terms", title: "Terms of Service", description: "What skipwait.me does, what you agree to when you use it, and what we will never promise.", changefreq: "monthly", priority: "0.3" },
  { route: "/refunds", title: "Refunds & Cancellation", description: "Credits are reserved, not spent, until a Referrer acts. Subscriptions stop at the end of the cycle you already paid for.", changefreq: "monthly", priority: "0.3" },
  { route: "/cancellations", title: "Cancellation Policy", description: "How to cancel a referral request, a Pro or Max subscription, or a credit purchase, and when any money comes back.", changefreq: "monthly", priority: "0.3" },
  { route: "/shipping", title: "Shipping & Delivery", description: "skipwait.me sells referral credits and plan subscriptions. They are delivered to your account online, usually within seconds of payment.", changefreq: "monthly", priority: "0.3" },
];

export const PUBLIC_ROUTE_BY_PATH: ReadonlyMap<string, PublicRoute> = new Map(PUBLIC_ROUTES.map(route => [route.route, route]));

export function publicRoute(path: string): PublicRoute | undefined {
  return PUBLIC_ROUTE_BY_PATH.get(path);
}

/** The home page keeps its trailing slash: `https://skipwait.me/`, not the bare origin. */
export function canonicalUrl(path: string): string {
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}

export type Breadcrumb = { label: string; path: string };

/**
 * `Home > Page` for every public route. The public tree is flat, so the trail
 * never invents a section that does not exist as a page of its own.
 */
export function breadcrumbsFor(route: PublicRoute): readonly Breadcrumb[] {
  if (route.route === "/") return [];
  return [
    { label: "Home", path: "/" },
    { label: route.title, path: route.route },
  ];
}

/**
 * BreadcrumbList structured data for one route, or undefined for the home page
 * (a single-item trail is not worth marking up).
 */
export function breadcrumbJsonLd(path: string): Record<string, unknown> | undefined {
  const route = publicRoute(path);
  if (!route) return undefined;
  const trail = breadcrumbsFor(route);
  if (trail.length < 2) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      item: canonicalUrl(crumb.path),
    })),
  };
}