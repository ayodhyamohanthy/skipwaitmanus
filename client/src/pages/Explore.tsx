import { ArrowRight, ArrowUpRight, Building2, Globe2, HeartHandshake, LockKeyhole, MapPin, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { LAUNCH_COMPANIES, companySlugForJobCompany } from "@/lib/companies";

type Job = { id: number; title: string; company: string; location: string };

export default function Explore() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/jobs");
        if (!response.ok) return;
        const payload = (await response.json()) as { jobs?: Job[] };
        if (!active || !Array.isArray(payload.jobs)) return;
        const grouped: Record<string, number> = {};
        for (const job of payload.jobs) {
          const slug = companySlugForJobCompany(job.company);
          if (slug) grouped[slug] = (grouped[slug] ?? 0) + 1;
        }
        setCounts(grouped);
      } catch { /* directory renders without counts */ }
    })();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return LAUNCH_COMPANIES.filter(company =>
      (!query || `${company.name} ${company.industry} ${company.functions.join(" ")}`.toLowerCase().includes(query)) &&
      (!role || company.functions.includes(role)) &&
      (!location || company.location.includes(location)),
    );
  }, [search, role, location]);
  const clear = () => { setSearch(""); setRole(""); setLocation(""); };

  return (
    <main data-skipwait-screen="explore" className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Five open doors · More to come</span>
          <h1>Where do you<br />want to go<span className="brand-dot">?</span></h1>
          <p>Start with a company. We&apos;ll help you make a thoughtful ask.</p>
        </div>
        <span className="global-pill"><Globe2 />Global by design</span>
      </div>
      <form className="search-form" onSubmit={event => event.preventDefault()}>
        <label className="search-field"><Search /><input aria-label="Search companies" placeholder="Company, function, or industry" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} /></label>
        <button type="submit" className="brand-button" aria-label="Search"><span className="search-button-label">Search</span><ArrowRight /></button>
      </form>
      <div className="filter-row">
        <label className="filter-control"><SlidersHorizontal /><select aria-label="Function" value={role} onChange={event => setRole(event.target.value)}><option value="">All functions</option><option>Engineering</option><option>Product</option><option>Design</option><option>Data</option><option>Operations</option></select></label>
        <label className="filter-control"><MapPin /><select aria-label="Location" value={location} onChange={event => setLocation(event.target.value)}><option value="">Anywhere</option><option>Remote</option><option>India</option><option>Global</option></select></label>
        {(search || role || location) ? <button type="button" className="filter-clear" onClick={clear}><X />Clear</button> : null}
      </div>
      <div className="directory-heading">
        <div>
          <span className="availability"><span />{Object.values(counts).reduce((a, b) => a + b, 0) > 0 ? "Open roles listed now" : "Company directory"}</span>
          <h2>{filtered.length ? `${filtered.length} ${filtered.length === 1 ? "company" : "companies"} to explore` : "No matching doors yet"}</h2>
        </div>
        <span className="directory-note">Availability can change. No referral is guaranteed.</span>
      </div>
      {filtered.length ? (
        <section className="company-grid" aria-live="polite">
          {filtered.map(company => {
            const openRoles = counts[company.slug] ?? 0;
            return (
              <Link key={company.slug} href={`/explore/${company.slug}`} className="company-card">
                <div className="company-card-top"><span className="company-mark">{company.initials}</span><ArrowUpRight /></div>
                <div><h2>{company.name}</h2><p>{company.blurb}</p></div>
                <div className="company-meta"><span>{company.industry}</span><span>{company.location}</span>{openRoles > 0 ? <span>{openRoles} open {openRoles === 1 ? "role" : "roles"}</span> : null}</div>
                <div className="company-functions">{company.functions.map(fn => <span key={fn}>{fn}</span>)}</div>
              </Link>
            );
          })}
        </section>
      ) : (
        <section className="no-results">
          <Building2 /><h2>Try a wider search.</h2><p>Clear a filter, or tell us where you want a door to open next.</p>
          <div>
            <button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={clear}>Clear filters</button>
            <Link href="/support" className="brand-button">Contact us <ArrowUpRight /></Link>
          </div>
        </section>
      )}
      <section className="employee-band">
        <span className="band-icon"><HeartHandshake /></span>
        <div><h3>Work at one of these companies?</h3><p>Open another door. You control every request you accept.</p></div>
        <Link href="/referrer" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">I can refer <ArrowUpRight /></Link>
      </section>
      <div className="trust-row"><span><HeartHandshake />Free. Always.</span><span><LockKeyhole />Private by default</span><span><ShieldCheck />People choose every request</span></div>
    </main>
  );
}
