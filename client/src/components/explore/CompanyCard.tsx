import { ArrowUpRight, BriefcaseBusiness, Check, MapPin } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import type { LaunchCompany } from "@/lib/companies";

/** Kit v4 company card (app/src/components/company-card.tsx). Descriptors come
 * from the spec-mandated launch set; nothing here is a live count. */
export function CompanyCard({ company }: { company: LaunchCompany }) {
  return <article className="company-card">
    <div className="company-card-top"><span className="company-mark" aria-hidden="true">{company.initials}</span><span className="availability"><span /> PEOPLE OPEN TO REFERRALS</span></div>
    <div><h2>{company.name}</h2><p>{company.blurb}</p></div>
    <div className="company-meta"><span><BriefcaseBusiness />{company.industry}</span><span><MapPin />{company.location}</span></div>
    <div className="company-functions" aria-label="Functions">{company.functions.map(item => <span key={item}><Check />{item}</span>)}</div>
    <Button asChild variant="outline"><Link href={`/explore/${company.slug}`}>View open door <ArrowUpRight /></Link></Button>
  </article>;
}
