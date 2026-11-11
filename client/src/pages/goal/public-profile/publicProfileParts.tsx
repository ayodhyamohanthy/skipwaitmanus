// Goal-token building blocks for /p/:handle (D-048-p3-public-profile). The
// profile lane's goal parts cover the signed-in owner pages; this page is the
// public one, so it carries its own goal line, the visitor-safe work list and
// the honest visibility words. Kit components stay out of this tree.
import { ExternalLink, MapPin } from "lucide-react";
import { Link } from "wouter";
import { GoalVerifiedMark } from "@/components/goal";
import type { ProfileVisibility } from "@/components/profile/profileVisibility";
import { workKindLabel, type WorkItem } from "@/components/profile/workItems";
import { cn } from "@/lib/utils";

// The kit card's three options, keeping the same stored values. The hints are
// what the API actually does: private hides the page from everyone but its
// owner, so it must not promise "referrers you ask" (D-153).
export const VISIBILITY_CHOICES: ReadonlyArray<readonly [ProfileVisibility, string, string]> = [
  ["public", "Public", "Anyone, and search engines"],
  ["link", "Link only", "People with the link"],
  ["private", "Private", "Only you"],
];

export type PublicProfileData = {
  visible: boolean;
  visibility: string;
  isOwner?: boolean;
  displayName?: string;
  headline?: string | null;
  location?: string | null;
  openTo?: string[] | null;
  company?: string | null;
  verifiedWork?: { domain: string | null; verifiedAt: string } | null;
  handle?: string | null;
  workItems?: WorkItem[];
};

export function ViewAsToggle({ value, onChange }: { value: "you" | "visitor"; onChange(next: "you" | "visitor"): void }) {
  return (
    <div className="flex rounded-g-control border border-g-hairline p-0.5 text-g-meta" role="tablist" aria-label="View as">
      {(["you", "visitor"] as const).map(option => (
        <button key={option} type="button" role="tab" aria-selected={value === option} onClick={() => onChange(option)}
          className={cn("min-h-9 rounded-g-control px-3", value === option ? "bg-g-surface-hover text-g-ink" : "text-g-ink-2")}>
          {option === "you" ? "You" : "Visitor"}
        </button>
      ))}
    </div>
  );
}

export function ProfileIdentity({ profile }: { profile: PublicProfileData }) {
  const verified = profile.verifiedWork;
  return (
    <>
      {profile.headline ? <p className="mt-3 max-w-[620px] text-g-body text-g-ink">{profile.headline}</p> : null}
      {profile.location || verified ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-g-meta text-g-ink-2">
          {profile.location ? <span className="flex items-center gap-1"><MapPin aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />{profile.location}</span> : null}
          {verified ? <GoalVerifiedMark>{verified.domain ? `Verified at ${verified.domain} via work email` : "Work email verified"}</GoalVerifiedMark> : null}
        </div>
      ) : null}
      {profile.openTo && profile.openTo.length > 0 ? (
        <ul aria-label="Open to" className="mt-4 flex flex-wrap gap-2">
          {profile.openTo.map(role => <li key={role} className="rounded-g-control border border-g-hairline px-3 py-1.5 text-g-meta text-g-ink">Open to: {role}</li>)}
        </ul>
      ) : null}
    </>
  );
}

export function VisibilityPanel({ current, saving, offline, error, path, onSelect }: { current: ProfileVisibility; saving: boolean; offline: boolean; error: string; path: string; onSelect(next: ProfileVisibility): void }) {
  const inert = saving || offline;
  return (
    <section aria-labelledby="goal-public-visibility" className="mt-8 border border-g-hairline p-4 gdesk:p-5">
      <h2 id="goal-public-visibility" className="text-g-heading text-g-ink">Who can see this page</h2>
      <p className="mt-1 break-all text-g-meta text-g-ink-2">{path}</p>
      <div role="radiogroup" aria-label="Page visibility" className="mt-4 grid gap-2 gdesk:grid-cols-3">
        {VISIBILITY_CHOICES.map(([value, label, hint]) => {
          const selected = current === value;
          return (
            <button key={value} type="button" role="radio" aria-checked={selected} aria-label={label}
              aria-disabled={inert ? "true" : undefined}
              onClick={inert ? (event: { preventDefault(): void }) => event.preventDefault() : () => onSelect(value)}
              className={cn("flex min-h-11 items-start gap-3 rounded-g-control border p-3 text-left", selected ? "border-g-ink" : "border-g-control-edge", inert && "cursor-not-allowed")}>
              <span aria-hidden="true" className={cn("mt-1.5 size-(--g-dot) shrink-0 rounded-full", selected ? "bg-g-ink" : "border-[1.5px] border-g-control-edge")} />
              <span><strong className="block text-g-label text-g-ink">{label}</strong><small className="block text-g-meta text-g-ink-3">{hint}</small></span>
            </button>
          );
        })}
      </div>
      <p role="status" className="mt-2 text-g-meta text-g-ink-2">{saving ? "Saving…" : ""}</p>
      {error ? <p role="alert" className="mt-1 text-g-meta text-g-crimson">{error}</p> : null}
    </section>
  );
}

function WorkPiece({ item, isOwner }: { item: WorkItem; isOwner: boolean }) {
  return (
    <li className="border-b border-g-hairline py-4 last:border-0">
      <p className="text-g-meta text-g-ink-3">{workKindLabel(item.kind)}{item.source ? ` · from ${item.source}` : ""}{item.pinned ? " · Pinned" : ""}</p>
      <h3 className="mt-0.5 text-g-label text-g-ink">
        {item.url
          ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-[3px] hover:no-underline">{item.title}<ExternalLink aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} /></a>
          : item.title}
      </h3>
      {isOwner ? <p className="mt-1 text-g-meta text-g-ink-2">{item.visibleOnProfile ? "Visible on profile" : "Only you can see this"}</p> : null}
    </li>
  );
}

export function WorkList({ items, isOwner }: { items: readonly WorkItem[]; isOwner: boolean }) {
  const hidden = items.filter(item => !item.visibleOnProfile).length;
  return (
    <section aria-label="Work" className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-g-heading text-g-ink">Work</h2>
        {isOwner ? <Link href="/work" className="text-g-meta text-g-ink underline underline-offset-[3px] hover:no-underline">Manage your work</Link> : null}
      </div>
      {items.length === 0 ? (
        <div className="mt-3 border border-g-hairline p-4">
          <p className="text-g-label text-g-ink">{isOwner ? "Add one piece you're proud of." : "No work shared yet."}</p>
          <p className="mt-1 text-g-meta text-g-ink-2">{isOwner ? "Link a case study, project, article, or code." : "When this person shares a piece, it shows here."}</p>
          {isOwner ? <Link href="/work" className="mt-3 inline-block text-g-meta text-g-ink underline underline-offset-[3px] hover:no-underline">Add work</Link> : null}
        </div>
      ) : (
        <>
          {isOwner && hidden > 0 ? <p className="mt-2 text-g-meta text-g-ink-2">Only pieces marked visible on profile appear to visitors.</p> : null}
          <ul className="mt-2">{items.map(item => <WorkPiece key={item.id} item={item} isOwner={isOwner} />)}</ul>
        </>
      )}
    </section>
  );
}

export function ProfileFooter() {
  return (
    <p className="mt-10 border-t border-g-hairline pt-4 text-g-meta text-g-ink-3">
      No feed. No followers. No likes. Just work. ·{" "}
      <a href="/" className="text-g-ink underline underline-offset-[3px] hover:no-underline">Make your own on skipwait.me</a>
    </p>
  );
}
