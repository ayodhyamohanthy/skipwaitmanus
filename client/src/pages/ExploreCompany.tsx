import { ArrowLeft, ArrowRight, BadgeCheck, Bell, BriefcaseBusiness, CalendarDays, LockKeyhole, MapPin, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/kit/button";
import { RequestDialog } from "@/components/explore/RequestDialog";
import { CompanyNotFoundError, useCompany, type PublicCompany } from "@/lib/companyDirectory";
import { useCompanyOpportunities, type PublicOpportunityPost } from "@/lib/companyOpportunities";
import { formatDay, formatDayTime } from "@/lib/displayPrefs";
import { applySeo } from "@/lib/seo";
import { NotFoundContent } from "./NotFound";

export default function ExploreCompany() {
  const [, params] = useRoute("/explore/:slug");
  const slug = params?.slug ?? "";
  const company = useCompany(slug);
  // Kit: an unknown or hidden slug is the app's 404. This route already sits in the shell.
  if (company.error instanceof CompanyNotFoundError) return <NotFoundContent />;
  if (company.data) return <CompanyPage company={company.data} />;
  if (company.isError) {
    return <main data-skipwait-screen="explore-company-error" className="page-content company-page">
      <Link className="back-link" href="/explore"><ArrowLeft />All companies</Link>
      <section className="no-results" role="alert"><LockKeyhole /><h2>We couldn’t load this company.</h2><p>{company.error.message}</p><div><Button variant="outline" onClick={() => { void company.refetch(); }} disabled={company.isFetching}><RefreshCw />Try again</Button></div></section>
    </main>;
  }
  return <main data-skipwait-screen="explore-company-loading" className="page-content company-page" aria-busy="true">
    <Link className="back-link" href="/explore"><ArrowLeft />All companies</Link>
    <section className="company-hero" aria-label="Loading company"><span className="company-mark large animate-pulse bg-muted motion-reduce:animate-none" aria-hidden="true" /><div className="space-y-4"><span className="block h-2.5 w-48 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /><span className="block h-10 w-3/5 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /><span className="block h-3 w-4/5 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /></div></section>
  </main>;
}

function CompanyPage({ company }: { company: PublicCompany }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  // Each "Ask for a referral" mounts a fresh dialog, so a new ask starts empty.
  const [draft, setDraft] = useState(0);
  useEffect(() => {
    applySeo({ title: `Referrals at ${company.name}`, description: `Request a free, private introduction to someone at ${company.name}.`, path: `/explore/${company.slug}` });
  }, [company.name, company.slug]);
  return <main data-skipwait-screen="explore-company" className="page-content company-page">
    <Link className="back-link" href="/explore"><ArrowLeft />All companies</Link>
    <section className="company-hero"><span className="company-mark large" aria-hidden="true">{company.initials}</span><div>{company.openToReferrals ? <span className="availability"><span /> PEOPLE OPEN TO REFERRAL REQUESTS</span> : <Link href="/alerts" className="availability text-muted-foreground hover:text-foreground"><Bell className="size-3" aria-hidden="true" />Get told when a door opens</Link>}<h1>{company.name}<span className="brand-dot">.</span></h1><p>{company.blurb}</p><div className="company-meta"><span><BriefcaseBusiness />{company.industry}</span><span><MapPin />{company.location}</span></div></div><Button onClick={() => { setStep(0); setDraft(value => value + 1); setOpen(true); }}>Ask for a referral <ArrowRight /></Button></section>
    <CompanyOpenings slug={company.slug} companyName={company.name} />
    <section className="company-detail-grid"><div><span className="eyebrow">BEFORE YOU ASK</span><h2>Bring the role.<br />We’ll guide the request.</h2><p>Find a role on the company’s own careers site, copy its link, and explain why your experience fits. A focused request is easier to review.</p></div><ol className="quality-list"><li><span>1</span><div><strong>Use the exact job link</strong><p>This keeps the request specific and current.</p></div></li><li><span>2</span><div><strong>Make your fit easy to see</strong><p>Share the most relevant experience, not a generic pitch.</p></div></li><li><span>3</span><div><strong>Respect the decision</strong><p>People choose what they can support. A pass stays private.</p></div></li></ol></section>
    <section className="privacy-preview"><LockKeyhole /><div><strong>What is shared, and when?</strong><p>Your job link and note are shared with an available referrer. Personal contact details and documents remain private until a request is accepted.</p></div><Link href="/safety">Read safety guide <ArrowRight /></Link></section>
    <RequestDialog key={draft} company={company} open={open} step={step} onStepChange={setStep} onOpenChange={setOpen} />
  </main>;
}

// D-022: roles posted by verified employees of this company, between the hero
// and "Before you ask". The public read is cacheable and retryable; an empty
// answer invites employees to post, and a failed one never blocks the page.
function CompanyOpenings({ slug, companyName }: { slug: string; companyName: string }) {
  const openings = useCompanyOpportunities(slug);
  const posts = openings.data ?? [];
  return <section className="mt-11" aria-label={`Open roles from verified employees at ${companyName}`}>
    <span className="eyebrow">OPEN ROLES FROM VERIFIED EMPLOYEES</span>
    {openings.isPending ? <div className="mt-4 grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Loading open roles"><span className="block h-32 animate-pulse rounded-lg border border-border bg-muted motion-reduce:animate-none" /><span className="block h-32 animate-pulse rounded-lg border border-border bg-muted motion-reduce:animate-none" /></div> : openings.isError ? <div role="alert" className="mt-4 flex flex-col items-start gap-3 rounded-lg border border-border p-5"><p className="text-sm font-semibold">We couldn’t load open roles.</p><p className="text-xs text-muted-foreground">{openings.error.message}</p><Button variant="outline" size="sm" disabled={openings.isFetching} onClick={() => { void openings.refetch(); }}><RefreshCw />Try again</Button></div> : posts.length === 0 ? <div className="mt-4 rounded-lg border border-border p-5"><p className="text-sm font-semibold">No open roles from employees yet.</p><p className="mt-1 text-xs text-muted-foreground">When someone at {companyName} shares a role here, it appears on this page for 30 days.</p><Link href="/post-opportunity" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary">Work at {companyName}? Share a role <ArrowRight className="size-4" aria-hidden="true" /></Link></div> : <div className="mt-4 grid gap-3 md:grid-cols-2">{posts.map(post => <OpenRoleCard key={post.id} post={post} />)}</div>}
  </section>;
}

function OpenRoleCard({ post }: { post: PublicOpportunityPost }) {
  const posted = formatDay(post.postedAt);
  const walkIn = post.kind === "walk_in" && post.walkInAt ? formatDayTime(post.walkInAt) : null;
  // A walk-in (or a post whose link the poster left out) still opens the ask
  // composer with the post attached; the seeker adds the job link they mean.
  const askHref = post.targetRoleUrl ? `/ask?post=${post.id}&job=${encodeURIComponent(post.targetRoleUrl)}` : `/ask?post=${post.id}`;
  return <article className="rounded-lg border border-border p-5">
    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.14em] text-muted-foreground">{post.kind === "walk_in" ? <CalendarDays className="size-3.5" aria-hidden="true" /> : <BadgeCheck className="size-3.5" aria-hidden="true" />}{post.kind === "walk_in" ? "Walk-in" : "Hiring now"}</p>
    <h3 className="mt-2 text-lg font-semibold">{post.roleTitle}</h3>
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{post.location ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{post.location}</span> : null}{walkIn ? <span>Walk-in · {walkIn}</span> : null}{posted ? <span>Posted {posted}</span> : null}</p>
    <p className="mt-2 text-xs text-muted-foreground">{post.poster.kind === "firstName" ? `Posted by ${post.poster.firstName}` : "Posted by a verified employee"}</p>
    <Link href={askHref} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Ask for a referral <ArrowRight className="size-4" aria-hidden="true" /></Link>
  </article>;
}
