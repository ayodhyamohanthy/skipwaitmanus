import { ArrowRight, ArrowUpRight, BriefcaseBusiness, Building2, Check, Globe2, HeartHandshake, LockKeyhole, MapPin, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { LAUNCH_COMPANIES } from "@/lib/companies";

export default function Explore() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");

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
    <main data-skipwait-screen="explore" className="page-content explore-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Five open doors · More to come</span>
          <h1>Where would you<br />love to work next<span className="brand-dot">?</span></h1>
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
          <span className="availability"><span />People are open to requests</span>
          <h2>{filtered.length ? `${filtered.length} ${filtered.length === 1 ? "company" : "companies"} to explore` : "No matching doors yet"}</h2>
        </div>
        <span className="directory-note">Availability can change. No referral is guaranteed.</span>
      </div>
      {filtered.length ? (
        <section className="company-grid" aria-live="polite">
          {filtered.map(company => (
            <article className="company-card" key={company.slug}>
              <div className="company-card-top"><span className="company-mark" aria-hidden="true">{company.initials}</span><span className="availability"><span />People open to referrals</span></div>
              <div><h2>{company.name}</h2><p>{company.blurb}</p></div>
              <div className="company-meta"><span><BriefcaseBusiness />{company.industry}</span><span><MapPin />{company.location}</span></div>
              <div className="company-functions" aria-label="Functions">{company.functions.map(fn => <span key={fn}><Check />{fn}</span>)}</div>
              <Link href={`/explore/${company.slug}`} className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">View open door <ArrowUpRight /></Link>
            </article>
          ))}
        </section>
      ) : (
        <section className="no-results">
          <Building2 /><h2>Try a wider search.</h2><p>Clear a filter, or tell us where you want a door to open next.</p>
          <div>
            <button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={clear}>Clear filters</button>
            <Link href="/invite" className="brand-button">Request a company <ArrowUpRight /></Link>
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
