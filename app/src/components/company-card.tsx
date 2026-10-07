import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BriefcaseBusiness, Check, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Company } from "@/lib/marketplace-data";

export function CompanyCard({ company }: { company: Company }) {
  return <article className="company-card">
    <div className="company-card-top"><span className="company-mark" aria-hidden="true">{company.initials}</span><span className="availability"><span /> PEOPLE OPEN TO REFERRALS</span></div>
    <div><h2>{company.name}</h2><p>{company.blurb}</p></div>
    <div className="company-meta"><span><BriefcaseBusiness />{company.industry}</span><span><MapPin />{company.location}</span></div>
    <div className="company-functions" aria-label="Functions">{company.functions.map(item => <span key={item}><Check />{item}</span>)}</div>
    <Button asChild variant="outline"><Link to="/explore/$slug" params={{ slug: company.slug }}>View open door <ArrowUpRight /></Link></Button>
  </article>;
}