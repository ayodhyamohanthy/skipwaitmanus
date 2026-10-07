import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Search, Globe2, SlidersHorizontal, MapPin, ArrowUpRight, ShieldCheck, LockKeyhole, HeartHandshake, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanyCard } from "@/components/company-card";
import { pageMeta } from "@/lib/page-meta";
import { launchCompanies } from "@/lib/marketplace-data";

export const Route = createFileRoute("/explore/")({ head: () => pageMeta("Explore companies", "Find people open to referral requests at SkipWait, Wipro, Go Neutrinos, TCS, and Merkle."), component: Explore });

function Explore() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const filtered = useMemo(() => launchCompanies.filter(company => {
    const query = search.trim().toLowerCase();
    return (!query || `${company.name} ${company.industry} ${company.functions.join(" ")}`.toLowerCase().includes(query)) && (!role || company.functions.includes(role)) && (!location || company.location.includes(location));
  }), [search, role, location]);
  function clear() { setSearch(""); setRole(""); setLocation(""); }
  return <main className="page-content explore-page">
    <div className="page-heading"><div><span className="eyebrow">FIVE OPEN DOORS · MORE TO COME</span><h1>Where do you<br />want to go<span className="brand-dot">?</span></h1><p>Start with a company. We’ll help you make a thoughtful ask.</p></div><span className="global-pill"><Globe2 />GLOBAL BY DESIGN</span></div>
    <form className="search-form" onSubmit={event => event.preventDefault()}><label className="search-field"><Search /><input aria-label="Search companies" placeholder="Company, function, or industry" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} /></label><Button type="submit" aria-label="Search"><span className="search-button-label">Search</span><ArrowRight /></Button></form>
    <div className="filter-row"><label className="filter-control"><SlidersHorizontal /><select aria-label="Function" value={role} onChange={event => setRole(event.target.value)}><option value="">All functions</option><option>Engineering</option><option>Product</option><option>Design</option><option>Data</option><option>Operations</option></select></label><label className="filter-control"><MapPin /><select aria-label="Location" value={location} onChange={event => setLocation(event.target.value)}><option value="">Anywhere</option><option>Remote</option><option>India</option><option>Global</option></select></label>{(search || role || location) && <Button type="button" variant="ghost" className="filter-clear" onClick={clear}><X />Clear</Button>}</div>
    <div className="directory-heading"><div><span className="availability"><span /> PEOPLE ARE OPEN TO REQUESTS</span><h2>{filtered.length ? `${filtered.length} ${filtered.length === 1 ? "company" : "companies"} to explore` : "No matching doors yet"}</h2></div><span className="directory-note">Availability can change. No referral is guaranteed.</span></div>
    {filtered.length ? <section className="company-grid" aria-live="polite">{filtered.map(company => <CompanyCard key={company.slug} company={company} />)}</section> : <section className="no-results"><Building2 /><h2>Try a wider search.</h2><p>Clear a filter, or tell us where you want a door to open next.</p><div><Button variant="outline" onClick={clear}>Clear filters</Button><Button asChild><Link to="/invite">Request a company <ArrowUpRight /></Link></Button></div></section>}
    <section className="employee-band"><span className="band-icon"><HeartHandshake /></span><div><h3>Work at one of these companies?</h3><p>Open another door. You control every request you accept.</p></div><Button variant="outline" asChild><Link to="/referrer">I can refer <ArrowUpRight /></Link></Button></section>
    <div className="trust-row"><span><HeartHandshake />Free. Always.</span><span><LockKeyhole />Private by default</span><span><ShieldCheck />People choose every request</span></div>
  </main>;
}