import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { applySeo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { breadcrumbsFor, publicRoute } from "@shared/publicRoutes";

/**
 * Kit v4 legal/reading layout (app/src/components/legal-page.tsx) shared by
 * /terms, /privacy, /guidelines, /refunds, /cancellations, /shipping, /about,
 * /contact, /pricing and /support.
 *
 * Wordmark header with the legal nav, eyebrow + title, "Last updated", an
 * optional "The short version" card, then numbered sections with an
 * "On this page" rail on desktop. Reading pages scroll normally. The kit's
 * design-only draft banner is never rendered; a page that is genuinely
 * awaiting review passes `status="draft"` and shows an inline status instead.
 */
/** Founder approved publishing Terms and Refunds on Sep 23, 2026 (removes the Draft badge). */
export const POLICIES_PUBLISHED = true;

export const SUPPORT_EMAIL = "support@skipwait.me";
export const policyLinks = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/guidelines", label: "Community guidelines" },
  { href: "/privacy", label: "Privacy & trust" },
  { href: "/refunds", label: "Refunds & cancellation" },
  { href: "/cancellations", label: "Cancellation policy" },
  { href: "/shipping", label: "Shipping & delivery" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact us" },
  { href: "/support", label: "Support" },
] as const;

/** Kit legal header nav. Help collapses on phones exactly as the kit does. */
const LEGAL_NAV = [
  { href: "/terms", label: "Terms", phone: true },
  { href: "/privacy", label: "Privacy", phone: true },
  { href: "/guidelines", label: "Guidelines", phone: true },
  { href: "/help", label: "Help", phone: false },
] as const;

/**
 * Canonical public route for each reading screen. A screen that is missing here
 * keeps the shell metadata rather than declaring a wrong canonical URL.
 */
const POLICY_SCREEN_PATHS: Record<string, string> = {
  terms: "/terms",
  guidelines: "/guidelines",
  "refund-policy": "/refunds",
  "cancellation-policy": "/cancellations",
  "shipping-policy": "/shipping",
  about: "/about",
  contact: "/contact",
  pricing: "/pricing",
  support: "/support",
  privacy: "/privacy",
};

/**
 * `Home > Page` trail for a canonical public route. Rendered here so the React
 * page and the no-JavaScript HTML the build writes agree; the structured data
 * for it comes from `applySeo`.
 */
export function Breadcrumbs({ path, className = "mb-4" }: { path: string; className?: string }) {
  const route = publicRoute(path);
  const trail = route ? breadcrumbsFor(route) : [];
  if (trail.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-xs font-semibold text-muted-foreground">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1" aria-current={isLast ? "page" : undefined}>
              {index > 0 ? <ChevronRight aria-hidden className="size-3" /> : null}
              {isLast ? <span className="text-foreground">{crumb.label}</span> : <Link href={crumb.path} className="hover:text-foreground hover:underline">{crumb.label}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** "01" renders as the kit's "1." while non-numeric labels pass through. */
function sectionNumber(number: string): string {
  const parsed = Number.parseInt(number, 10);
  return Number.isNaN(parsed) ? number : String(parsed);
}

export function PolicySection({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return <section aria-labelledby={`policy-${number}`}>
    <h2 id={`policy-${number}`} className="scroll-mt-6 text-xl font-semibold">{sectionNumber(number)}. {title}</h2>
    <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground [&_strong]:text-foreground [&_ul]:space-y-3">{children}</div>
  </section>;
}

export function PolicyPageShell({ screen, eyebrow, title, intro, updated, status = POLICIES_PUBLISHED ? "published" : "draft", summary, sections, children, footnote }: {
  screen: string;
  /** Accepted for existing callers; the kit legal layout has no icon tile. */
  icon?: LucideIcon;
  eyebrow: string;
  title: string;
  intro: string;
  updated: string;
  status?: "draft" | "published";
  /** Bullets for the kit "The short version" card. */
  summary?: readonly string[];
  /** Anchor-nav entries for the numbered sections. Rendered as a left rail on desktop only; mobile keeps the stacked flow. */
  sections?: ReadonlyArray<{ id: string; label: string }>;
  children: ReactNode;
  footnote?: string;
}) {
  const canonicalPath = POLICY_SCREEN_PATHS[screen];
  const route = canonicalPath ? publicRoute(canonicalPath) : undefined;
  // The title and description a search engine shows are the ones declared for
  // this route, so the <head> a crawler reads and the page it lands on agree.
  const seoTitle = route?.title ?? title;
  const seoDescription = route?.description ?? intro;
  useEffect(() => {
    // Keeps title, canonical, and share copy correct when a visitor navigates
    // between policy screens inside the single-page app.
    if (canonicalPath) applySeo({ title: seoTitle, description: seoDescription, path: canonicalPath });
  }, [canonicalPath, seoDescription, seoTitle]);
  // The kit sets the closing full stop as the blue brand dot.
  const heading = title.endsWith(".") ? title.slice(0, -1) : title;
  // The live intro (including any acceptance clause) leads the reading column,
  // so the kit header stays eyebrow, title and date.
  const body = <>
    <p className="leading-relaxed text-muted-foreground">{intro}</p>
    {children}
    {footnote ? <p className="text-sm text-muted-foreground">{footnote}</p> : null}
    {sections ? <p className="text-sm text-muted-foreground">Questions? Write to <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-foreground">{SUPPORT_EMAIL}</a>.</p> : null}
  </>;
  return <div data-skipwait-screen={screen} className="min-h-screen bg-background">
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
      <Link href="/" className="wordmark" aria-label="SkipWait home">SkipWait<span className="brand-dot">.</span></Link>
      <nav aria-label="Legal" className="flex gap-4 text-sm">
        {LEGAL_NAV.map(item => {
          const active = item.href === canonicalPath;
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn(active && "font-semibold", !item.phone && "hidden sm:inline")}>{item.label}</Link>;
        })}
      </nav>
    </header>
    <main className="mx-auto max-w-5xl px-5 pb-20">
      {/* The breadcrumb trail sits where the kit's design-only draft banner sat. */}
      <div className="mb-6 flex min-h-7 items-center">{canonicalPath ? <Breadcrumbs path={canonicalPath} className="" /> : null}</div>
      <span className="eyebrow">{eyebrow}</span>
      <h1 className="mt-2 max-w-3xl text-4xl font-semibold sm:text-5xl">{heading}<span className="brand-dot">.</span></h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>Last updated {updated}</span>
        {status === "draft" ? <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">Draft · pending legal review</span> : null}
      </p>
      {summary ? <section aria-labelledby="policy-summary" className="mt-8 rounded-3xl bg-accent p-6 text-accent-foreground">
        <h2 id="policy-summary" className="font-semibold">The short version</h2>
        <ul className="mt-3 space-y-2">{summary.map(item => <li key={item} className="flex gap-2"><span aria-hidden>•</span>{item}</li>)}</ul>
      </section> : null}
      {sections ? <div className="mt-10 grid gap-10 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="hidden md:block" aria-label="On this page">
          <ul className="sticky top-6 space-y-2 text-sm">
            {sections.map(section => <li key={section.id}><a href={`#policy-${section.id}`} className="text-muted-foreground hover:text-foreground">{section.label}</a></li>)}
          </ul>
        </nav>
        <article className="min-w-0 space-y-10">{body}</article>
      </div> : <article className="mt-10 min-w-0 max-w-3xl space-y-10">{body}</article>}
      <nav aria-label="Policies" className="mt-16 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-6 text-xs text-muted-foreground">
        {policyLinks.map(link => <Link key={link.href} href={link.href} className="hover:text-foreground">{link.label}</Link>)}
      </nav>
    </main>
  </div>;
}
