// Kit v4 "Request queue" building blocks (app/src/routes/referrer.tsx:
// queue-layout, queue-card, identity-locked, request-quality, queue-guidance)
// rendered from live company-inbox rows. No sample requests: every field
// shown comes from the real inbox row or candidate preview.
import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Clock3, EyeOff, type LucideIcon } from "lucide-react";
import { StatusPill } from "@/components/kit/status-pill";
import { companyInitial } from "./ClaimedReview";

export type InboxScope = "new" | "saved" | "completed";
export const INBOX_SCOPES: ReadonlyArray<{ readonly id: InboxScope; readonly label: string }> = [
  { id: "new", label: "New" },
  { id: "saved", label: "Saved" },
  { id: "completed", label: "Done" },
];

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

export function ScopeTabs({ scope, newCount, onSelect }: { scope: InboxScope; newCount: number; onSelect: (scope: InboxScope) => void }) {
  return (
    <div role="tablist" aria-label="Company inbox views" className="inline-flex gap-1 rounded-[10px] bg-muted p-1">
      {INBOX_SCOPES.map(item => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={scope === item.id}
          onClick={() => onSelect(item.id)}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-[7px] px-4 text-[13px] font-semibold ${scope === item.id ? "bg-background text-foreground shadow-[0_1px_4px_color-mix(in_oklch,var(--foreground)_13%,transparent)]" : "text-muted-foreground hover:text-foreground"}`}
        >
          {item.label}
          {item.id === "new" && newCount > 0 ? <span aria-label={`${newCount} new private request${newCount === 1 ? "" : "s"}`} className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] leading-none text-primary-foreground">{newCount > 99 ? "99+" : newCount}</span> : null}
        </button>
      ))}
    </div>
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

export type QueueCardRequest = { id: number; companyDomain: string; targetRoleUrl: string | null; compensation?: string | null; attachmentCount: number };

export function QueueRequestCard({ request, badge, expiry, expiryUrgent, detail, actions }: {
  request: QueueCardRequest;
  badge: string;
  expiry: string | null;
  expiryUrgent: boolean;
  detail: string;
  actions: ReactNode;
}) {
  return (
    <article aria-label={`Private request ${displayRef(request.id)}`} className="queue-card min-w-0">
      <header>
        <span className="company-mark" aria-hidden="true">{companyInitial(request.companyDomain)}</span>
        <div className="min-w-0"><span className="eyebrow block truncate">{request.companyDomain} · {displayRef(request.id)}</span><h2>Private request</h2></div>
        <StatusPill status={badge} />
      </header>
      <div className="identity-locked"><EyeOff /><span><strong>Your identity stays hidden</strong><small>Shared only if you accept the request</small></span></div>
      <div className="request-quality">
        {request.targetRoleUrl ? <span><Check />Official job link included</span> : null}
        <span><Check />{request.attachmentCount} document{request.attachmentCount === 1 ? "" : "s"} attached</span>
        {request.compensation ? <span>{request.compensation}</span> : null}
        {expiry ? <span className={expiryUrgent ? "text-destructive" : undefined}><Clock3 />{expiry}</span> : null}
      </div>
      <RoleLink url={request.targetRoleUrl} />
      <p className="my-[23px] text-sm leading-[1.7] text-muted-foreground">{detail}</p>
      <footer>{actions}</footer>
    </article>
  );
}

export function RoleLink({ url }: { url: string | null }) {
  if (!url) return <p className="mt-5 text-sm text-muted-foreground">Role link unavailable</p>;
  return <a href={url} target="_blank" rel="noreferrer" className="mt-5 block truncate text-[13px] font-medium text-primary underline-offset-4 hover:underline">{url}</a>;
}
