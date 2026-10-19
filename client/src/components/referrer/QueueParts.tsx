// Kit v4 "Request queue" building blocks (app/src/routes/referrer.tsx:
// queue-layout, queue-card, identity-locked, request-quality, queue-guidance)
// rendered from live company-inbox rows. No sample requests: every field
// shown comes from the real inbox row or candidate preview.
import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Clock3, EyeOff, type LucideIcon } from "lucide-react";
import { StatusPill } from "@/components/kit/status-pill";
import { companyIdentityOf } from "@shared/companies";
import { functionEyebrow, type JobFunction } from "@shared/jobFunctions";
import { companyInitial } from "./ClaimedReview";

export const displayRef = (id: number) => `Ref-${1000 + id}`;

export function QueueGuidance() {
  return (
    <aside className="queue-guidance">
      <span className="eyebrow">YOUR DECISION</span>
      <h3>A referral is your professional judgment.</h3>
      <p>Review the role and context. Accept only if you’re comfortable making the introduction through your company’s process.</p>
      <Link href="/safety">Safety and boundaries <ArrowRight /></Link>
    </aside>
  );
}

/** Honest gate or empty panel inside the queue column (signed out, unverified, empty scope). */
export function QueuePanel({ icon: Icon, title, text, label, children }: { icon: LucideIcon; title: string; text?: string; label?: string; children?: ReactNode }) {
  return (
    <section aria-label={label} className="min-w-0 pt-2">
      <span className="empty-icon"><Icon /></span>
      <h2 className="text-[27px] font-semibold leading-[1.2]">{title}</h2>
      {text ? <p className="mt-3.5 text-sm leading-[1.7] text-muted-foreground">{text}</p> : null}
      {children}
    </section>
  );
}

export type QueueCardRequest = { jobTitle?: string | null; id: number; companyDomain: string; companyName?: string | null; companyInitials?: string | null; jobFunction?: JobFunction | null; targetRoleUrl: string | null; compensation?: string | null; attachmentCount: number };

/** One routed request in the kit queue card ("PRODUCT · WIPRO"). The role link and the seeker's note stay inside the opened request. */
export function QueueRequestCard({ request, badge, expiry, expiryUrgent, decisionDue, footer }: {
  request: QueueCardRequest;
  badge: string;
  expiry: string | null;
  expiryUrgent: boolean;
  decisionDue: string | null;
  footer: ReactNode;
}) {
  return (
    <article aria-label={`Private request ${displayRef(request.id)}`} className="queue-card min-w-0">
      <header>
        <span className="company-mark" aria-hidden="true">{companyInitial(request.companyDomain)}</span>
        <div className="min-w-0"><span className="eyebrow block truncate">{functionEyebrow(request.jobFunction, companyIdentityOf(request).name)}</span><h2>{request.jobTitle?.trim() || "Private request"}</h2></div>
        <StatusPill status={badge} />
      </header>
      <div className="identity-locked"><EyeOff /><span><strong>Your identity stays hidden</strong><small>Shared only if you accept the request</small></span></div>
      <div className="request-quality">
        {request.targetRoleUrl ? <span><Check />Official job link included</span> : null}
        <span><Check />{request.attachmentCount} document{request.attachmentCount === 1 ? "" : "s"} attached</span>
        {request.compensation ? <span>{request.compensation}</span> : null}
        {expiry ? <span className={expiryUrgent ? "text-destructive" : undefined}><Clock3 />{expiry}</span> : null}
        {decisionDue ? <span className="text-muted-foreground"><Clock3 size={14} />Decide within {decisionDue}</span> : null}
      </div>
      <div className="mt-[23px]">{footer}</div>
    </article>
  );
}

export function RoleLink({ url }: { url: string | null }) {
  if (!url) return <p className="mt-5 text-sm text-muted-foreground">Role link unavailable</p>;
  return <a href={url} target="_blank" rel="noreferrer" className="mt-5 block truncate text-[13px] font-medium text-primary underline-offset-4 hover:underline">{url}</a>;
}
