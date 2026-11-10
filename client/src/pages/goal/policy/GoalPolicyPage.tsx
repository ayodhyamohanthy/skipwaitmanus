// The policy group on the goal system (D-048 phase 3, row D-048-p3-policy;
// packet docs/plans/D-048-public.md). PolicyPageShell switches here, keyed by
// route, only for the routes GOAL_SURFACES.policy owns: never /pricing (its
// own money row) and never /support (the support row).
//
// Legal text is never edited, retyped or re-keyed: the page's own children,
// intro, "The short version" bullets and footnote render here exactly as the
// kit renders them; this frame only changes the presentation around them. The
// page opens with the reader's goal and keeps the page's own title as its
// label, its date, and its breadcrumb (the prerender pins one).
//
// Prerendered and fetch-free: GoalStaticFrame and plain markup only, no auth,
// no query, no router state (D-048-F-static-frame).
import type { ReactNode } from "react";
import { GoalStaticFrame } from "@/components/goal/GoalStaticFrame";
import { breadcrumbsFor, publicRoute } from "@shared/publicRoutes";

/** The reader's goal for each policy route (packet §3 design note). */
const GOAL_LINES: Record<string, string> = {
  "/terms": "Know your rights.",
  "/privacy": "Know your rights.",
  "/refunds": "Know your rights.",
  "/cancellations": "Know your rights.",
  "/shipping": "Know your rights.",
  "/guidelines": "Know your rights.",
  "/about": "Know who runs skipwait.me.",
  "/contact": "Talk to a human.",
};

export function goalPolicyLine(path: string): string | undefined {
  return GOAL_LINES[path];
}

/** `Home > Page` trail, the same trail PolicyPageShell's Breadcrumbs renders, on goal tokens. */
export function GoalBreadcrumbs({ path }: { path: string }) {
  const route = publicRoute(path);
  const trail = route ? breadcrumbsFor(route) : [];
  if (trail.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-g-meta text-g-ink-3">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1" aria-current={isLast ? "page" : undefined}>
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {isLast ? <span className="text-g-ink-2">{crumb.label}</span> : <a href={crumb.path} className="underline-offset-2 hover:text-g-ink hover:underline">{crumb.label}</a>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// The page files style their numbered sections with kit utility classes; the
// goal frame re-tones them from the outside (descendant variants outrank the
// single utility class) so no legal page file is touched.
const BODY_TONE = "min-w-0 space-y-8 text-g-body text-g-ink-2 [&_a]:text-g-ink [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-g-heading [&_h2]:text-g-ink [&_h3]:text-g-label [&_h3]:text-g-ink [&_section_div]:text-g-ink-2 [&_strong]:text-g-ink";

export type GoalPolicyPageProps = {
  path: string;
  screen: string;
  title: string;
  updated: string;
  draft: boolean;
  intro?: string;
  summary?: readonly string[];
  sections?: ReadonlyArray<{ id: string; label: string }>;
  footnote?: string;
  supportEmail: string;
  children: ReactNode;
};

export function GoalPolicyPage({ path, screen, title, updated, draft, intro, summary, sections, footnote, supportEmail, children }: GoalPolicyPageProps) {
  const label = title.endsWith(".") ? title.slice(0, -1) : title;
  return (
    <GoalStaticFrame>
      <div data-testid="goal-policy" data-skipwait-screen={screen}>
        <GoalBreadcrumbs path={path} />
        <p className="mt-6 text-g-meta text-g-ink-3">{label}</p>
        <h1 className="mt-1 text-g-display text-g-ink">{GOAL_LINES[path] ?? title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 text-g-meta text-g-ink-2">
          <span>Last updated {updated}</span>
          {draft ? <span className="text-g-ink">Draft · pending legal review</span> : null}
        </p>
        {summary ? (
          <section aria-labelledby="policy-summary" className="mt-6 border border-g-hairline p-4 gdesk:p-5">
            <h2 id="policy-summary" className="text-g-heading text-g-ink">The short version</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-g-meta text-g-ink-2">{summary.map(item => <li key={item}>{item}</li>)}</ul>
          </section>
        ) : null}
        {sections ? (
          <nav aria-label="On this page" className="mt-6 max-gdesk:hidden">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-g-meta text-g-ink-2">
              {sections.map(section => <li key={section.id}><a href={`#policy-${section.id}`} className="hover:text-g-ink">{section.label}</a></li>)}
            </ul>
          </nav>
        ) : null}
        <article className={`mt-8 ${BODY_TONE}`}>
          {intro ? <p>{intro}</p> : null}
          {children}
          {footnote ? <p className="text-g-meta">{footnote}</p> : null}
          {sections ? <p className="text-g-meta">Questions? Write to <a href={`mailto:${supportEmail}`} className="font-semibold">{supportEmail}</a>.</p> : null}
        </article>
      </div>
    </GoalStaticFrame>
  );
}
