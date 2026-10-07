import { ArrowLeft, ArrowRight, ArrowUpRight, Briefcase, Building2, LockKeyhole, MapPin } from "lucide-react";
import { Link, useParams } from "wouter";
import { getLaunchCompany } from "@/lib/launchCompanies";

/**
 * Kit v4 `/explore/$slug` (screens/web/02_explore-skipwait__default.png,
 * app/src/routes/explore.$slug.tsx).
 *
 * Company hero, the "Before you ask" guidance, and the privacy preview.
 *
 * ONE DESIGNED STATE IS NOT DUPLICATED HERE, deliberately: the kit's
 * four-step request dialog (Role / Your fit / Privacy / Review). Its final
 * step is captioned "DESIGN PREVIEW · NOTHING WILL BE SENT" and its completion
 * state says "In the live product, you would sign in, confirm, and track it
 * from Requests" — it is a preview of the ask flow, not the ask flow. That
 * flow already exists and submits for real at `/request`, so the primary
 * action here hands off to it with the company attached rather than growing a
 * second composer that cannot send. A test asserts no "Nothing was sent" copy
 * can ship.
 *
 * The hero is `bg-secondary` (the kit's yellow) with a WHITE initials mark —
 * the inverse of the Explore card, which is a yellow mark on white.
 */

const QUALITY_STEPS = [
  ["Use the exact job link", "This keeps the request specific and current."],
  ["Make your fit easy to see", "Share the most relevant experience, not a generic pitch."],
  ["Respect the decision", "People choose what they can support. A pass stays private."],
] as const;

export default function CompanyDetail() {
  const params = useParams<{ slug?: string }>();
  const company = params?.slug ? getLaunchCompany(params.slug) : undefined;

  if (!company) {
    return (
      <main data-skipwait-screen="company-not-found" className="page-content mx-auto max-w-2xl">
        <Link href="/explore" className="text-link inline-flex min-h-11 items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" aria-hidden="true" />All companies
        </Link>
        <section className="mt-6 rounded-lg border border-dashed border-border p-10 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-semibold">This company is not on SkipWait.</h1>
          <p className="mt-1 text-sm text-muted-foreground">It may not be open yet, or the link may be out of date.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/explore" className="inline-flex min-h-11 items-center rounded-lg border border-foreground px-5 text-sm font-semibold">Browse companies</Link>
            <Link href="/invite" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Request a company <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="company" className="page-content mx-auto max-w-5xl">
      <Link href="/explore" className="text-link inline-flex min-h-11 items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" aria-hidden="true" />All companies
      </Link>

      <section className="mt-5 flex flex-wrap items-center gap-5 rounded-lg border-2 border-foreground bg-secondary p-6">
        <span className="grid size-16 shrink-0 place-items-center rounded-md border-2 border-foreground bg-background text-lg font-bold" aria-hidden="true">
          {company.initials}
        </span>
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[.1em]">
            <span className="size-1.5 rounded-full bg-[#15803d]" aria-hidden="true" />People open to referral requests
          </span>
          <h1 className="mt-1 text-4xl font-semibold">
            {company.name}<span className="text-primary">.</span>
          </h1>
          <p className="mt-1 text-sm">{company.blurb}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <span className="inline-flex items-center gap-1.5"><Briefcase className="size-3.5" aria-hidden="true" />{company.industry}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden="true" />{company.location}</span>
          </div>
        </div>
        <Link
          href={`/request?company=${encodeURIComponent(company.slug)}`}
          className="brand-button inline-flex items-center gap-2 bg-primary text-sm font-semibold text-primary-foreground"
        >
          Ask for a referral <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>

      <section className="mt-9 grid gap-8 border-b border-border pb-9 lg:grid-cols-2">
        <div>
          <p className="eyebrow text-muted-foreground">Before you ask</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight">Bring the role.<br />We'll guide the request.</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            Find a role on the company's own careers site, copy its link, and explain why your experience fits. A focused request is easier to review.
          </p>
        </div>
        <ol className="grid gap-5">
          {QUALITY_STEPS.map(([title, body], index) => (
            <li key={title} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden="true">{index + 1}</span>
              <span>
                <strong className="block text-sm font-semibold">{title}</strong>
                <span className="mt-0.5 block text-xs text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8 flex flex-wrap items-center gap-4 rounded-lg border-l-4 border-primary bg-muted p-5">
        <LockKeyhole className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <strong className="block text-sm font-semibold">What is shared, and when?</strong>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Your job link and note are shared with an available referrer. Personal contact details and documents remain private until a request is accepted.
          </p>
        </div>
        <Link href="/safety" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary">
          Read safety guide <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
