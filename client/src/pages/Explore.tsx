import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Briefcase, Building2, Check, Globe2, HeartHandshake, LockKeyhole, MapPin, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { Link } from "wouter";
import { COMPANY_FUNCTIONS, COMPANY_LOCATIONS, LAUNCH_COMPANIES } from "@/lib/launchCompanies";

/**
 * Kit v4 `/explore` (screens/web/01_explore__default.png,
 * app/src/routes/explore.index.tsx).
 *
 * Company-first discovery over the kit's five declared launch companies. The
 * search and both filters are real and filter the rendered list; the count in
 * the heading is the filtered length, never a decorative number.
 *
 * Availability copy is the kit's own: the per-card "People open to referrals"
 * badge and the standing note "Availability can change. No referral is
 * guaranteed." The badge reflects the kit's declared launch claim, not a live
 * query — there is no `companies` table yet (see lib/launchCompanies.ts).
 *
 * The kit's "GLOBAL BY DESIGN" pill, employee band and trust row are ported as
 * designed; the employee band is `bg-secondary`, which is the kit's yellow.
 */

export default function Explore() {
  const [search, setSearch] = useState("");
  const [fn, setFn] = useState("");
  const [location, setLocation] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return LAUNCH_COMPANIES.filter(company =>
      (!query || `${company.name} ${company.industry} ${company.functions.join(" ")}`.toLowerCase().includes(query))
      && (!fn || company.functions.includes(fn))
      && (!location || company.location.includes(location)));
  }, [search, fn, location]);

  const clear = () => { setSearch(""); setFn(""); setLocation(""); };
  const hasFilters = Boolean(search || fn || location);

  return (
    <main data-skipwait-screen="explore" className="page-content mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Five open doors · more to come</p>
          <h1 className="mt-3 text-4xl font-semibold">
            Where do you<br />want to go<span className="text-primary">?</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">Start with a company. We'll help you make a thoughtful ask.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
          <Globe2 className="size-3.5" aria-hidden="true" />Global by design
        </span>
      </div>

      <form className="mt-7 flex flex-wrap gap-2" onSubmit={event => event.preventDefault()}>
        <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg border border-foreground bg-background px-4">
          <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search companies</span>
          <input
            value={search}
            maxLength={100}
            onChange={event => setSearch(event.target.value)}
            placeholder="Company, function, or industry"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <button type="submit" className="brand-button inline-flex items-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground">
          Search <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Function</span>
          <select value={fn} onChange={event => setFn(event.target.value)} className="bg-transparent text-xs font-semibold outline-none">
            <option value="">All functions</option>
            {COMPANY_FUNCTIONS.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3">
          <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Location</span>
          <select value={location} onChange={event => setLocation(event.target.value)} className="bg-transparent text-xs font-semibold outline-none">
            <option value="">Anywhere</option>
            {COMPANY_LOCATIONS.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        {hasFilters && (
          <button type="button" onClick={clear} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold">
            <X className="size-4" aria-hidden="true" />Clear
          </button>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
            <span className="size-2 rounded-full bg-[#15803d]" aria-hidden="true" />People are open to requests
          </span>
          <h2 className="mt-2 text-xl font-semibold" aria-live="polite">
            {filtered.length ? `${filtered.length} ${filtered.length === 1 ? "company" : "companies"} to explore` : "No matching doors yet"}
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">Availability can change. No referral is guaranteed.</span>
      </div>

      {filtered.length ? (
        <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(company => (
            <article key={company.slug} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-md bg-secondary text-sm font-bold" aria-hidden="true">{company.initials}</span>
                <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[.1em] text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-[#15803d]" aria-hidden="true" />People open to referrals
                </span>
              </div>
              <h3 className="text-lg font-semibold">{company.name}</h3>
              <p className="text-xs leading-5 text-muted-foreground">{company.blurb}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Briefcase className="size-3.5" aria-hidden="true" />{company.industry}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden="true" />{company.location}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {company.functions.map(name => (
                  <span key={name} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px]">
                    <Check className="size-3 text-[#15803d]" aria-hidden="true" />{name}
                  </span>
                ))}
              </div>
              <Link href={`/explore/${company.slug}`} className="mt-auto inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-foreground px-4 text-xs font-semibold">
                View open door <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </section>
      ) : (
        <section className="mt-5 rounded-lg border border-dashed border-border p-10 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">Try a wider search.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Clear a filter, or tell us where you want a door to open next.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={clear} className="inline-flex min-h-11 items-center rounded-lg border border-foreground px-5 text-sm font-semibold">Clear filters</button>
            <Link href="/invite" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Request a company <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      <section className="mt-8 flex flex-wrap items-center gap-4 rounded-lg border-2 border-foreground bg-secondary p-5">
        <HeartHandshake className="size-7 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Work at one of these companies?</h2>
          <p className="mt-1 text-sm">Open another door. You control every request you accept.</p>
        </div>
        <Link href="/referrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 border-foreground bg-background px-5 text-sm font-semibold">
          I can refer <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </section>

      <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><HeartHandshake className="size-4" aria-hidden="true" />Free. Always.</span>
        <span className="inline-flex items-center gap-2"><LockKeyhole className="size-4" aria-hidden="true" />Private by default</span>
        <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" aria-hidden="true" />People choose every request</span>
      </div>
    </main>
  );
}
