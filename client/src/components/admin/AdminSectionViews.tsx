import { AlertTriangle, ArrowRight, Check, CheckCircle2, Clock3, Eye, Search, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { LAUNCH_COMPANIES } from "@/lib/companies";
import { AdminHeading } from "./AdminShell";
import type { LiveMetric } from "./AdminOverviewView";

export function CompaniesView() {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const companies = LAUNCH_COMPANIES.filter(company => !needle || `${company.name} ${company.domain}`.toLowerCase().includes(needle));
  return <>
    <AdminHeading eyebrow="COMPANY OPERATIONS" title="Launch directory." body="Five confirmed companies are visible. New submissions require domain and duplicate review." />
    <div className="admin-toolbar"><label><Search /><input aria-label="Search companies" placeholder="Search company or domain" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} /></label><Button asChild><Link href="/admin-review?tab=companies">Submissions</Link></Button></div>
    <section className="admin-table" aria-label="Companies"><header><span>Company</span><span>Coverage</span><span>Status</span><span>Action</span></header>
      {companies.length ? companies.map(company => <div key={company.slug}><span className="table-primary"><i className="company-mark">{company.initials}</i><span><strong>{company.name}</strong><small>{company.industry}</small></span></span><span>{company.location}</span><span className="status-pill"><Check />Open door</span><Button variant="ghost" asChild><Link href={`/explore/${company.slug}`} aria-label={`Review ${company.name}`}>Review <ArrowRight /></Link></Button></div>)
        : <div><span>No launch company matches that search.</span></div>}
    </section>
  </>;
}

function countHeading(metric: LiveMetric, loading: string, failed: string, none: string, some: (count: number) => string) {
  if (metric.loading) return loading;
  if (metric.failed || metric.value === null) return failed;
  return metric.value === 0 ? none : some(metric.value);
}

export function VerificationsView({ queue }: { queue: LiveMetric }) {
  return <>
    <AdminHeading eyebrow="TRUST OPERATIONS" title="Verification review." body="Work-email checks confirm address ownership only. Exceptions require a documented decision." />
    <section className="admin-empty"><span><ShieldCheck /></span><h2>{countHeading(queue, "Loading the verification queue…", "We could not load the verification queue.", "No verifications waiting.", count => `${count} ${count === 1 ? "enrollment" : "enrollments"} waiting for review.`)}</h2><p>Reviewers see the company, domain, verification time, and decision history before approving or rejecting.</p><Button asChild className="mt-5"><Link href="/admin-review?tab=verifications">Open review queue</Link></Button></section>
  </>;
}

export function ReportsView({ reports }: { reports: LiveMetric }) {
  const open = reports.value ?? 0;
  return <>
    <AdminHeading eyebrow="SAFETY OPERATIONS" title="Reports and escalations." body="Payment requests, harassment, identity concerns, and spam should be triaged with context and an audit trail." />
    <Button asChild className="mb-4"><Link href="/admin-review?tab=reports">Open review queue</Link></Button>
    <section className="admin-empty report-empty"><span>{open > 0 ? <ShieldAlert /> : <CheckCircle2 />}</span><h2>{countHeading(reports, "Loading reports…", "We could not load reports.", "No open reports.", count => `${count} open ${count === 1 ? "report" : "reports"}.`)}</h2><p>Absence here is not a safety claim. Review urgent reports first and preserve evidence.</p></section>
    <section className="severity-guide"><h2>Triage guide</h2><div><span className="severity urgent"><AlertTriangle />Urgent</span><p>Threats, financial solicitation, or exposed sensitive data.</p></div><div><span className="severity review"><Clock3 />Review</span><p>Harassment, impersonation, repeated spam, or policy disputes.</p></div><div><span className="severity normal"><Eye />Routine</span><p>Quality concerns, company corrections, and support requests.</p></div></section>
  </>;
}

export function UsersView() {
  return <>
    <AdminHeading eyebrow="ACCOUNT OPERATIONS" title="User lookup." body="Support legitimate access while keeping restrictions, evidence, and appeals visible to reviewers." />
    <section className="admin-empty"><span><UsersRound /></span><h2>Review accounts in the users directory.</h2><p>Each account shows its role, company, work-email verification, and suspension state.</p><Button asChild className="mt-5"><Link href="/admin/users">Open users directory</Link></Button></section>
  </>;
}
