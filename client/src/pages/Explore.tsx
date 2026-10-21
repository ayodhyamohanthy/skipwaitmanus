import { ArrowRight, ArrowUpRight, Building2, Globe2, HeartHandshake, LockKeyhole, MapPin, RefreshCw, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { FREE_ASKS_CHIP } from "@shared/moneyCopy";
import { publicRoute } from "@shared/publicRoutes";
import { Button } from "@/components/kit/button";
import { CompanyCard, CompanyCardSkeleton } from "@/components/explore/CompanyCard";
import { exploreDescription, openDoorsEyebrow, useCompanyDirectory } from "@/lib/companyDirectory";
import { applySeo } from "@/lib/seo";

export default function Explore() {
  const directory = useCompanyDirectory();
  // Pre-filter from the landing search bar (QA fix, #407): /explore?q=...
  const [search, setSearch] = useState(() => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("q") ?? "")));
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const companies = directory.data?.companies;
  const openCount = directory.data?.openCount;
  const filtered = useMemo(() => (companies ?? []).filter(company => {
    const query = search.trim().toLowerCase();
    return (!query || `${company.name} ${company.industry} ${company.functions.join(" ")}`.toLowerCase().includes(query)) && (!role || company.functions.includes(role)) && (!location || company.location.includes(location));
  }), [companies, search, role, location]);
  // Kit head (app/src/routes/explore.index.tsx pageMeta), names from the live directory.
  useEffect(() => { applySeo({ title: "Explore companies", description: exploreDescription(companies ?? []) ?? publicRoute("/explore")?.description, path: "/explore" }); }, [companies]);
  function clear() { setSearch(""); setRole(""); setLocation(""); }
  return <main data-skipwait-screen="explore" className="page-content explore-page">
    <div className="page-heading"><div><span className="eyebrow">{openDoorsEyebrow(openCount)}</span><h1>Where would you love to work next<span className="brand-dot">?</span></h1><p>Start with a company. We’ll help you make a thoughtful ask.</p></div><span className="global-pill"><Globe2 />GLOBAL BY DESIGN</span></div>
    <form className="search-form" onSubmit={event => event.preventDefault()}><label className="search-field"><Search /><input aria-label="Search companies" placeholder="Company, function, or industry" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} /></label><Button type="submit" aria-label="Search"><span className="search-button-label">Search</span><ArrowRight /></Button></form>
    <div className="filter-row"><label className="filter-control"><SlidersHorizontal /><select aria-label="Function" value={role} onChange={event => setRole(event.target.value)}><option value="">All functions</option><option>Engineering</option><option>Product</option><option>Design</option><option>Data</option><option>Operations</option></select></label><label className="filter-control"><MapPin /><select aria-label="Location" value={location} onChange={event => setLocation(event.target.value)}><option value="">Anywhere</option><option>Remote</option><option>India</option><option>Global</option></select></label>{(search || role || location) && <Button type="button" variant="ghost" className="filter-clear" onClick={clear}><X />Clear</Button>}</div>
    {companies ? <>
      <div className="directory-heading"><div>{openCount ? <span className="availability"><span /> PEOPLE ARE OPEN TO REQUESTS</span> : null}<h2>{filtered.length ? `${filtered.length} ${filtered.length === 1 ? "company" : "companies"} to explore` : "No matching doors yet"}</h2></div><span className="directory-note">Availability can change. No referral is guaranteed.</span></div>
      {filtered.length ? <section className="company-grid" aria-live="polite">{filtered.map(company => <CompanyCard key={company.slug} company={company} />)}</section> : <section className="no-results"><Building2 /><h2>Try a wider search.</h2><p>Clear a filter, or tell us where you want a door to open next.</p><div><Button variant="outline" onClick={clear}>Clear filters</Button><Button asChild><Link href="/invite">Request a company <ArrowUpRight /></Link></Button></div></section>}
    </> : directory.isError ? <section className="no-results" role="alert"><Building2 /><h2>We couldn’t load companies.</h2><p>{directory.error.message}</p><div><Button variant="outline" onClick={() => { void directory.refetch(); }} disabled={directory.isFetching}><RefreshCw />Try again</Button></div></section>
      : <section className="company-grid mt-[38px]" aria-busy="true" aria-label="Loading companies">{[0, 1, 2].map(index => <CompanyCardSkeleton key={index} />)}</section>}
    <section className="employee-band"><span className="band-icon"><HeartHandshake /></span><div><h3>Work at one of these companies?</h3><p>Open another door. You control every request you accept.</p></div><Button variant="outline" asChild><Link href="/referrer">I can refer <ArrowUpRight /></Link></Button></section>
    <div className="trust-row"><span><HeartHandshake />{FREE_ASKS_CHIP}</span><span><LockKeyhole />Private by default</span><span><ShieldCheck />People choose every request</span></div>
  </main>;
}
