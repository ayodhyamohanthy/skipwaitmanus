import { ArrowUpRight, Bell, BriefcaseBusiness, Check, MapPin } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import type { PublicCompany } from "@/lib/companyDirectory";

/** Kit v4 company card (app/src/components/company-card.tsx). Descriptors come
 * from the server directory; the green pill shows only while a verified
 * referrer there is open to requests, never as a count. */
export function CompanyCard({ company }: { company: PublicCompany }) {
  return <article className="company-card">
    <div className="company-card-top"><span className="company-mark" aria-hidden="true">{company.initials}</span>{company.openToReferrals
      ? <span className="availability"><span /> PEOPLE OPEN TO REFERRALS</span>
      : <Link href="/alerts" className="availability text-muted-foreground hover:text-foreground"><Bell className="size-3" aria-hidden="true" />Get told when a door opens</Link>}</div>
    <div><h2>{company.name}</h2><p>{company.blurb}</p></div>
    <div className="company-meta"><span><BriefcaseBusiness />{company.industry}</span><span><MapPin />{company.location}</span></div>
    <div className="company-functions" aria-label="Functions">{company.functions.map(item => <span key={item}><Check />{item}</span>)}</div>
    <Button asChild variant="outline"><Link href={`/explore/${company.slug}`}>{company.openToReferrals ? "View open door" : "View company"} <ArrowUpRight /></Link></Button>
  </article>;
}

/** Same footprint as a card while the directory loads, so nothing jumps. */
export function CompanyCardSkeleton() {
  return <div className="company-card" aria-hidden="true">
    <div className="company-card-top"><span className="company-mark animate-pulse bg-muted motion-reduce:animate-none" /><span className="h-2.5 w-36 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /></div>
    <div className="space-y-3"><span className="block h-5 w-2/5 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /><span className="block h-3 w-full animate-pulse rounded-full bg-muted motion-reduce:animate-none" /><span className="block h-3 w-4/5 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /></div>
    <span className="mt-auto block h-10 w-40 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
  </div>;
}
