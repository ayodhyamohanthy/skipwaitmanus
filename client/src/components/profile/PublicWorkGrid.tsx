// Kit v4 /p/:handle "Work" section (app/src/routes/p.$handle.tsx) over the
// live, owner-filtered work items the public-profile API returns.
import { ArrowRight, Eye, EyeOff, Github, Globe, Pin } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { isGithubSource, workKindLabel, type WorkItem } from "./workItems";

export function PublicWorkGrid({ items, isOwner }: { items: readonly WorkItem[]; isOwner: boolean }) {
  return (
    <section className="mt-10" aria-label="Work">
      <div className="mb-4 flex items-end justify-between gap-3"><h2 className="text-xl font-semibold">Work</h2>{isOwner ? <Link href="/work" className="text-link text-sm">Manage work →</Link> : null}</div>
      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">{isOwner ? "Add one piece you're proud of." : "No public work yet."}</p>
          {isOwner ? <><p className="mt-1 text-sm text-muted-foreground">Link a case study, project, article or code.</p><Button asChild className="mt-4"><Link href="/work">Add work</Link></Button></> : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map(item => (
            <article key={item.id} className="rounded-3xl border border-border p-5">
              <div className="mb-10 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">{isGithubSource(item.source) ? <Github className="size-3.5" /> : <Globe className="size-3.5" />}{item.source || "Link"}</span>
                {item.pinned ? <span className="flex items-center gap-1 text-foreground"><Pin className="size-3.5" />Pinned</span> : null}
              </div>
              <span className="eyebrow">{workKindLabel(item.kind).toUpperCase()}</span>
              <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
              {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="text-link text-sm">Open link <ArrowRight className="size-3" /></a> : null}
              {isOwner ? <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">{item.visibleOnProfile ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{item.visibleOnProfile ? "Visible on profile" : "Only visible to you"}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
